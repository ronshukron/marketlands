# Delayed Payments (Grow J5) — Webhook-Loss Recovery Plan

Handoff for two agents: **Backend (Cloud Functions)** and **Frontend (React)**.
Backend work is the fix. Frontend work is thin: consume the new contract and clean up.

Related: `docs/DelayedPayments-Backend-Snapshot.md` (original J5/J4 spec).

---

## 0. Problem

Weekly grocery checkout uses Grow **J5 hold → J4 settle**:

1. `createGrowSuspendedPayment` → Grow `createPaymentProcess` (`chargeType: 2`) → hosted URL.
2. Customer authorizes card on Grow.
3. Grow POSTs to our `notifyUrl` → webhook stores `transactionId` + `transactionToken` in `delayedPaymentSecretsV2/{customerOrderId}` and sets the order to `paymentStatus: held`, `delayedOrderStatus: pending_weighing`.
4. Admin weighs in Delivery V7 → `handleSuspendedPayment` → Grow `settleSuspendedTransaction`.

**This week, 4 orders authorized on Grow but step 3 never happened.** Symptoms on each order doc:

| Field | Value |
|---|---|
| `paymentStatus` | `abandoned` |
| `delayedOrderStatus` | `abandoned` |
| `delayedPayment.heldAt` | **missing** — this is the reliable marker |
| `delayedPayment.statusCode` | missing (healthy J5 orders have `'11'`) |
| `delayedPayment.status` | `created` — **not** a useful signal; the current webhook leaves it `created` even on success |
| `abandonedAt` | ~11 min after `createdAt` |
| `delayedPaymentSecretsV2/{id}` | missing `transactionId` / `transactionToken` |

Verified in production Firestore: every historical order that the webhook did confirm has `delayedPayment.heldAt` + `delayedPayment.statusCode: '11'` while `delayedPayment.status` is still `created`. Use `heldAt` (or the secrets doc) to decide "hold confirmed", never `delayedPayment.status`.

Admin manually flipped statuses to `held` / `pending_weighing`. Orders then **appear** in V7, but charging returns **500** from `handleSuspendedPayment` because there are no tokens to settle with.

Two Grow timings line up with the ~11 min abandon:

- Hosted payment URL is valid **10 minutes** ([overview](https://developers.grow.business/reference/regular-payment-overview)).
- If `notifyUrl` does not return HTTP 200, Grow retries at **10 / 20 / 30 minute** intervals ([server response](https://developers.grow.business/reference/server-response-1)).

So either Grow's first notify failed/was dropped and we abandoned before the retry, or our webhook errored and Grow's retries hit an already-abandoned order. Both must be handled.

### Root-cause checks the backend agent should run first

- Cloud Logging for the notify function around the 4 orders' `createdAt`: did a request arrive? Did it return non-200 / time out / throw?
- Was the abandon job's threshold shortened recently?
- Any change to `notifyUrl` value, region, or function name in the last few weeks?

---

## 1. What Grow's API allows (verified against docs)

| Need | Endpoint | Works for us? |
|---|---|---|
| Get transaction IDs from the browser success URL | — | **No.** Success URL only carries `response=success` + `cField`s. No `transactionId`/`transactionToken`. ([success-url](https://developers.grow.business/reference/success-url)) |
| Look up a process we created | `POST /api/light/server/1.0/getPaymentProcessInfo` `pageCode, processId, processToken` | **Yes.** This is the recovery primitive. ([docs](https://developers.grow.business/reference/get-payment-process-info)) |
| Look up a transaction | `POST /api/light/server/1.0/getTransactionInfo` | Only if you already have `transactionId` + `transactionToken`. Use for verification, not recovery. ([docs](https://developers.grow.business/reference/get-transaction-info)) |
| Search transactions by phone / cField | — | **Not available** in the Light API. |
| Settle a hold | `POST /api/light/server/1.0/settleSuspendedTransaction` `userId, transactionId, transactionToken, sum, productData[...]` | Existing. ([docs](https://developers.grow.business/reference/settle-suspended-transaction)) |
| `approveTransaction` | — | **Do not call** for J4/J5 flows. ([live-environment](https://developers.grow.business/reference/live-environment)) |

Constraints:

- All calls **server-side only**; browser calls are blocked.
- Requests are `multipart/form-data`, not JSON.
- Sandbox base `https://sandbox.meshulam.co.il/api/light/server/1.0`, production base `https://secure.meshulam.co.il/api/light/server/1.0`.
- `createPaymentProcess` success response already includes `data.processId` and `data.processToken` alongside `data.url`. These are the keys for `getPaymentProcessInfo`.
- `getPaymentProcessInfo` response shape is not spelled out on its page. Expect the same family as the server update (`status`, `err`, `data.{transactionId, transactionToken, statusCode, status, sum, asmachta, processId, processToken, customFields, ...}`). **Backend must capture real sandbox responses for J5 (`chargeType: 2`) in "authorized/held", "not yet paid", and "expired" states before relying on a specific `statusCode`.**

Design principle: **`notifyUrl` stays the primary path. Add pull-based recovery as a backup everywhere a missing hold currently causes a failure.**

---

## 2. Backend plan

### 2.1 Persist process identifiers at create — prerequisite

In `createGrowSuspendedPayment`, after Grow returns `{ status: 1, data: { url, processId, processToken } }`:

Write to `delayedPaymentSecretsV2/{customerOrderId}` (server-only collection; confirm the deployed name — frontend constant says `delayedPaymentSecretsV2`, older spec said `delayedPaymentSecrets`):

```text
processId, processToken
pageCode, userId            // which Grow credentials were used, so lookups use the same ones
environment                 // 'sandbox' | 'production'
customerOrderId
createdAt
```

Also set safe, non-secret metadata on the order doc `customerOrdersDelayed/{id}`:

```text
delayedPayment.status = 'awaiting_customer_authorization'
delayedPayment.processCreatedAt = <serverTimestamp>
```

Do **not** return `processId` / `processToken` to the client.

If this already exists, verify it; nothing else in this plan works without it.

### 2.2 Shared internal helper: `recoverDelayedHoldFromGrow(customerOrderId, { source })`

One function, called from 2.3, 2.4, 2.5, 2.6. Behavior:

1. Load order + secrets. If secrets already have `transactionId` + `transactionToken` and order is `held`/settled → return `{ state: 'held', recovered: false }`.
2. If no `processId`/`processToken` → return `{ state: 'unrecoverable', reason: 'missing_process_ids' }`.
3. Call `getPaymentProcessInfo` with the stored `pageCode`, `processId`, `processToken`.
4. Interpret:
   - Transaction present with `transactionId` + `transactionToken` and a "held/authorized" status → **recover**:
     - Firestore **transaction**: write tokens into secrets (only if absent), set order `paymentStatus: 'held'`, `delayedOrderStatus: 'pending_weighing'`, `delayedPayment.status: 'held'`, `delayedPayment.heldAt`, `delayedPayment.statusCode/statusText`, `delayedPayment.recoveredVia: source`, `FieldValue.delete()` on `abandonedAt`.
     - Never downgrade: if the order is already `held`/`completed`/`settled`, only fill missing secrets.
     - Return `{ state: 'held', recovered: true }`.
   - Transaction present but already **settled/captured** → set order to `completed` if not already, return `{ state: 'already_settled' }`.
   - No transaction yet → return `{ state: 'pending' }`.
   - Process expired / cancelled / declined → return `{ state: 'not_paid' }`.
5. Log one structured line per call: `customerOrderId, source, growStatusCode, resultState, durationMs`. Redact tokens.

Idempotency: webhook, confirm, charge fallback and scheduler may all call this concurrently. All writes go through the Firestore transaction above; last writer cannot regress a `held` order.

### 2.3 New HTTPS function: `confirmDelayedPayment` — **frontend already calls this; currently 404**

Called by `PaymentSuccess.js` when the customer lands on `/payment-success/?customerOrderId=…&response=success` (Grow appends `response` and cFields; frontend also tolerates them landing in the pathname).

Request (JSON, unauthenticated — guest checkout):

```json
{ "customerOrderId": "temp_1758000000000", "response": "success", "source": "frontend_success_url" }
```

Response `200`:

```json
{
  "ok": true,
  "state": "held" | "pending" | "not_paid" | "already_settled" | "unrecoverable",
  "customerOrderId": "…",
  "paymentStatus": "held",
  "delayedOrderStatus": "pending_weighing"
}
```

Errors: `400` bad input, `404` order not found, `502` Grow call failed (`{ "error": { "code": "grow_unavailable", "message": "…" } }`).

Rules:

- Never return secrets. Only statuses.
- Only accept `customerOrderId`; ignore everything else from the body.
- Per-IP and per-orderId rate limit (e.g. 10 req / min). The frontend polls ~20× at 2 s when `pending`.
- Implementation = `recoverDelayedHoldFromGrow(customerOrderId, { source: 'success_url' })`.
- CORS: same allowlist as `createGrowSuspendedPayment`.

### 2.4 Fallback inside `handleSuspendedPayment`

Before settling:

```text
if secrets missing transactionId/transactionToken:
    result = recoverDelayedHoldFromGrow(orderId, { source: 'settlement' })
    if result.state != 'held' and != 'already_settled':
        return 409 { error: { code: 'missing_grow_hold', message: '<human text>', state: result.state } }
proceed with settleSuspendedTransaction as today
```

Also replace the generic 500 for "no tokens" with that 409. The V7 UI already surfaces `error.message` from the response body in the batch-charge failure list.

If `result.state === 'already_settled'`, do not settle again; return `200` with `alreadySettled: true` so V7 marks it completed.

### 2.5 Fix the abandon job

Wherever `abandoned` / `abandonedAt` is written today (scheduled function or inline timeout):

1. Before marking abandoned, call `recoverDelayedHoldFromGrow(id, { source: 'abandon_check' })`.
2. `held` / `already_settled` → do **not** abandon.
3. `pending` and age < **45 min** → skip this run (covers Grow's 10/20/30 min notify retries plus slack).
4. `pending` and age ≥ 45 min, or `not_paid` → mark abandoned as before.
5. `unrecoverable` (no process ids) → keep current behavior, but log at WARNING so we notice.

### 2.6 Make the webhook tolerant of late delivery

In `handleDelayedPaymentNotification`:

- Return **200 immediately** after minimal validation; do the Firestore work after acknowledging or keep it fast. Non-200 makes Grow retry and can produce duplicate/late updates.
- Accept notifications for orders already marked `abandoned`: run the same "recover" write (tokens + `held` + delete `abandonedAt`). Log `lateWebhookRecovered: true`.
- Idempotent on `transactionId`.
- Correlate by `cField2` = `customerOrderId` first, then by `processId` lookup in secrets as fallback.

### 2.7 Admin recovery endpoint: `recoverDelayedPaymentFromGrow`

HTTPS function, **admin auth required** (Firebase ID token + existing admin allowlist/claim), for V7 and the Abandoned Carts page.

Request: `{ "customerOrderId": "…" }`
Response: same shape as 2.3, plus `recovered: boolean`.

Implementation = `recoverDelayedHoldFromGrow(customerOrderId, { source: 'admin' })`.

### 2.8 Scheduled reconciliation (cheap insurance)

Every 15 min: query `customerOrdersDelayed` where `isDelayedOrder == true`, `createdAt` between 10 min and 7 days ago, and `delayedPayment.heldAt` is absent (Firestore cannot filter on "missing field" directly — either add a boolean `delayedPayment.holdConfirmed: false` at create and flip it in the recover write, or query by `createdAt` range and filter in memory). Skip `completed` / `settled` / `cancelled*`. For each, call the helper. Bounded batch (e.g. 50). This catches customers who paid and then closed the tab without ever reaching `/payment-success`.

### 2.9 Fix the 4 stuck orders

Identify them: `customerOrdersDelayed` where `paymentStatus == 'held'` and `delayedPayment.heldAt` is **absent** (these are the ones admin flipped by hand). Cross-check with the ids admin edited.

For each affected `customerOrderId`, in this order:

1. **Secrets doc has `processId` + `processToken`** → run the helper (2.2) from a one-off admin script or via 2.7. Expect `held`; it writes `transactionId`/`transactionToken`, `heldAt`, `statusCode`. V7 charge then works, provided the J5 hold is still inside Grow's window (~7 days from authorization; auto-release ~10).
2. **Secrets doc has no process ids** → check Cloud Logging for `createGrowSuspendedPayment` around the order's `createdAt`. The Grow response (`data.processId`, `data.processToken`) is very likely in the logs. If found, feed them to the same helper.
3. **Nothing in logs either** → Grow dashboard: locate the J5 transaction by payer phone/name + `delayedPayment.holdSum` + date. The dashboard exposes the transaction id; `transactionToken` is usually **not** shown in the UI — request it from Grow support with the transaction id, or ask them for `processId`/`processToken` and use step 1. Then write the secrets doc **mirroring an existing healthy order's secrets doc exactly** (same field names and types — Grow's `transactionId` is numeric, token is a string), set `delayedPayment.heldAt` (server timestamp), `delayedPayment.statusCode: '11'`, delete `abandonedAt`, and charge from V7.
4. **Grow shows no hold at all** → nothing to settle. Take a new payment; do not attempt V7 charge. Revert the order to `abandoned` so it stops appearing in V7.

None of this can be done from the frontend or the browser: Grow blocks client calls and the secrets collection is server-only.

### 2.10 Observability

- Alert when `recoverDelayedHoldFromGrow` returns `recovered: true` from any source other than the webhook (means the webhook missed one).
- Alert on webhook handler non-200 responses.
- Counter for `missing_grow_hold` 409s from settlement.
- Send Grow support the `processId`s of the 4 orders and ask why `notifyUrl` was not delivered / what their delivery logs show.

### 2.11 Backend verification checklist

- Sandbox J5: create → pay → block the webhook (return 500 from notify) → hit `confirmDelayedPayment` → order becomes `held` with tokens in secrets → V7 charge succeeds.
- Sandbox J5: create → do not pay → `confirmDelayedPayment` returns `pending`; after 45 min abandon job marks abandoned.
- Sandbox J5: create → pay → let webhook succeed → `confirmDelayedPayment` is a no-op (`held`, `recovered: false`).
- Late webhook on an `abandoned` order recovers it.
- `handleSuspendedPayment` with missing tokens returns 409 `missing_grow_hold`, not 500.
- No token appears in any HTTP response or log line.

---

## 3. Frontend plan

Frontend must not call Grow directly and must not hold tokens. All work below consumes the backend contract in §2.

### 3.1 `PaymentSuccess.js` — consume `confirmDelayedPayment` states

Already implemented: reads `customerOrderId` from `cField2` / query / sessionStorage, calls `confirmDelayedPayment`, polls Firestore ~40 s, renders `success` / `pending` / `abandoned` / `error`.

Changes:

- Use the backend `state` from the confirm response to short-circuit polling:
  - `held` / `already_settled` → success view immediately, `clearCart()`.
  - `not_paid` → show a clear "payment not completed, cart preserved" view (not the current "Grow approved but server didn't confirm" copy, which is only right for the `abandoned`-with-hold case).
  - `pending` → keep polling; on timeout show the existing pending view.
  - `unrecoverable` → existing "contact support, do not pay again" view with the order id.
- Treat `missingEndpoint: true` (404) as `pending` and log a `console.warn` once so the gap is visible during rollout.
- Keep the "אל תשלמו שוב" (do not pay again) copy for `abandoned` + Grow `response=success`.

### 3.2 Remove debug instrumentation before shipping

`OrderConfirmationDelayed.js`, `PaymentSuccess.js`, `PaymentCancel.js` currently contain `// #region agent log` blocks that `fetch('http://127.0.0.1:7682/ingest/…')`. Remove all of them. Keep `storeDelayedCustomerOrderId` and `buildGrowSuccessUrl` (they are the fix that lets the success page know the order id).

### 3.3 Delivery V7 — show why a charge failed and offer recovery

- `runBatchChargeForEntries` / single-order charge already display `error.message` from the response body via `getActionErrorDetail`. Verify the 409 `missing_grow_hold` message renders in the failed list and in the per-order red badge; add a Hebrew/Thai fallback string if the backend message is English.
- Add an admin-only action on a pending order: **"אחזר אישור מ-Grow" (Recover hold from Grow)** → calls `recoverDelayedPaymentFromGrow` via `apiV7.js` with the admin ID token → on `held` re-enable charge for that order; on `not_paid` / `unrecoverable` show the reason and keep the order un-chargeable.
- Do not auto-retry charging after a 409; recovery is an explicit admin click or the backend's own fallback in §2.4.

### 3.4 Abandoned Carts admin page

For delayed orders with `delayedPayment.status === 'created'` and no `heldAt`, show the same **Recover from Grow** button (calls §2.7). On success, remove the row (it is no longer abandoned).

### 3.5 Optional: surface `delayedPayment.status`

`awaiting_customer_authorization` (new, from §2.1) should display as "ממתין לאישור תשלום" in `AbandonedCarts.js` and any status label helpers, same as `pending_payment` today.

### 3.6 Frontend tests

- `PaymentSuccess` state machine: each backend `state` maps to the right view; 404 → pending.
- `delayedPaymentGatewayService.confirmDelayedPayment`: 404 → `missingEndpoint: true`; 502 → `ok: false, status: 502`.
- `apiV7.recoverDelayedPaymentFromGrowV7`: sends bearer token, returns parsed state.
- V7 batch charge: a 409 `{ error: { code: 'missing_grow_hold', message } }` shows `message` in the failure summary and does not mark the order completed.

---

## 4. Rollout order

1. Backend §2.1 (persist process ids) — deploy first; nothing else works without it.
2. Backend §2.2 + §2.3 (`confirmDelayedPayment`) — frontend is already calling it; the 404 disappears.
3. Backend §2.4 (settlement fallback + 409) and §2.6 (late webhook tolerance).
4. Backend §2.5 (abandon job waits for Grow) and §2.8 (scheduler).
5. Backend §2.7 (admin recover endpoint) → then Frontend §3.3 / §3.4.
6. Frontend §3.1 / §3.2 can ship any time after step 2.
7. Recover the 4 stuck orders (§2.9) as soon as step 1–2 are live, before their J5 window closes.

---

## 5. Non-goals

- No frontend-only workaround: the success page cannot obtain transaction tokens.
- No `approveTransaction` on J5 orders.
- Grow dashboard **Webhooks** (support-enabled account-level notifications) are optional extra insurance, not a replacement for `getPaymentProcessInfo` pull.
- Do not rely on manual Firestore status flips; they make orders appear in V7 without making them chargeable.
