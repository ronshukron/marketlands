# Basket subscriptions — review brief

This document is for a reviewer who did not build the feature. It describes the intended product, the code that exists, the Grow sandbox evidence, a double-charge bug that was found and fixed, and the things that are still unproven.

Repos:

- Frontend: `d:\My_Projects\B2C\frontend` (React CRA, Firestore client, Firebase Hosting).
- Cloud Functions: `D:\My_Projects\B2C\functions\functions` (Firebase Functions v1, Node, `functions.https.onRequest` + one scheduled function). ESLint is google style, ecmaVersion 2018, so the functions code has no optional chaining and no nullish coalescing.

The delayed-order (J5 hold) flow was left in place. Subscription orders reuse the same order collection and the same weighing screens, then branch only at charge time.

## Product

A customer subscribes to an admin-built basket (weekly or biweekly). Grow saves the card on a hosted page. We store the token, not the card number. Before each delivery the system creates an order from the basket. The customer can remove any line until weighing starts, and can add a product only while that farmer's form is still open for the delivery. After weighing, an admin charges the saved card for the weighed lines plus the delivery fee. Pickup is free. Home delivery follows the community's shipping rules, including the city free-shipping threshold, recomputed on the weighed product total.

There is no VIP tier. Pricing is the sum of the lines that remain, at current product prices (including quantity discounts), not a fixed basket price.

## What is deployed and what is not

Deployed to Firebase project `auth-development-323c3` on 2026-11-21:

- Firestore rules for `subscriptionBaskets`, `basketSubscriptions`, `subscriptionPaymentSecrets`, `subscriptionCounters`.
- These functions, all `us-central1`:
  - `createBasketSubscription`
  - `handleSubscriptionCardNotification`
  - `confirmBasketSubscriptionCard`
  - `generateSubscriptionOrders` (Pub/Sub, every 30 minutes, `Asia/Jerusalem`)
  - `chargeSubscriptionOrder`
  - `updateBasketSubscription`
  - `listSubscriptionAddableProducts`
  - `addSubscriptionOrderItems`

Not deployed at the time of writing: the frontend. The live site `https://bastabasket.com` still serves the previous build, which has no consent checkbox. Signup against the new function will fail with `CARD_CONSENT_REQUIRED` until hosting is deployed.

The token flow is pointed at Grow **sandbox**. The existing delayed J5 flow stays on Grow production (`MESHULAM_ENV=secure`). They do not share a host. See `getGrowTokenConfig` in `functions/utils/growTokenClient.js`.

## Environment

In `functions/functions/.env` (gitignored):

```
GROW_TOKEN_ENV=sandbox
GROW_TOKEN_USER_ID=2c95741943b955ad
GROW_TOKEN_PAGE_CODE=8c28655488db
SITE_URL=https://bastabasket.com
```

These user id and page code are Grow's **test** credentials. They must be replaced, and `GROW_TOKEN_ENV` set to `secure`, before real customers are charged. `GROW_TOKEN_USER_ID` falls back to `MESHULAM_USER_ID` only when unset.

`SUBSCRIPTIONS_OPEN_TO_ALL` in `src/services/subscriptionBasketService.js` is `false`. While false, the store hides subscription baskets from everyone except two admin uids:

- `rfHOLhNoJOW8ByNypCtm3hlSNKs2`
- `Q0bohhVCdmeMhgBbDknvLxbEzW53`

The same two uids are the default of `SUBSCRIPTION_TESTER_UIDS` in `canSignUpNow` (`handlers/subscriptionSignup.js`). The server returns `403 SUBSCRIPTIONS_NOT_OPEN` for anyone else while `GROW_TOKEN_ENV` is not `secure`. The UI hide and the server check are duplicated on purpose: the UI copy can be stale, the function cannot.

Going live requires both flips, plus a functions redeploy and a hosting deploy:

1. Production token user id and page code, `GROW_TOKEN_ENV=secure`.
2. `SUBSCRIPTIONS_OPEN_TO_ALL = true`.

## Data model

| Collection | Who can read | Who can write | Contents |
|---|---|---|---|
| `subscriptionBaskets` | active docs, or an admin | admin | The template: title, communities, component lines, `openLeadHours` |
| `basketSubscriptions` | admin, or the owning `userId` | nobody (functions only) | Status, schedule, customer details, `card.last4` / brand / exp, `orderIds`, consent summary |
| `subscriptionPaymentSecrets` | nobody | nobody | `cardToken`, pending Grow process, consent log, per-order charge identifiers |
| `subscriptionCounters/growIdentifiers` | nobody | nobody | Monotonic counter for Grow identifiers, starts at 100000 |
| `customerOrdersDelayed` | existing rules (public create) | existing rules | Generated deliveries, id `sub_{subscriptionId}_{deliveryDate}` |

`customerOrdersDelayed` still allows public create. `chargeSubscriptionOrder` therefore refuses to charge an order unless `basketSubscriptions.orderIds` contains that order id. A forged document in the orders collection cannot be charged on someone else's token.

A generated order is written already `paymentStatus: held`, `delayedOrderStatus: pending_weighing`, `paymentMethod: grow_token`, `isSubscriptionOrder: true`, `delayedPayment: { provider: grow, method: token, holdConfirmed: false }`. It has **no** `delayedPayment.processCreatedAt`, so `reconcileDelayedHolds` (which queries that field) does not pick it up. There is no J5 hold.

Subscription statuses: `pending_card`, `active`, `paused`, `payment_failed`, `canceled`.

## Routes

| Path | Who | What |
|---|---|---|
| `/admin/subscription-baskets` | admin | Create and edit baskets. Card on `/admin` titled "סלי מנוי". |
| community store | testers only, until the flag flips | `SubscriptionBasketCard` when the selected community has an active delivery schedule and an active basket that includes it. |
| `/subscribe/:basketId` | logged-in tester | Community, delivery option, first date, frequency, details, required consent checkbox, then redirect to Grow. |
| `/subscription-success` | customer | Polls `confirmBasketSubscriptionCard` up to 6 times, every 3 seconds. |
| `/my-subscriptions` | owner | Pause, resume, skip, unskip, frequency, cancel, replace card. Linked from "ההזמנות שלי". |
| `/my-orders/:orderId` | owner | Remove any line; add products only while the farmer form is open. |

Weighing is the existing V7 and V8 screens. A subscription order shows an amber "מנוי" badge. `settleAndChargeOrderV7` calls `chargeSubscriptionOrder` instead of `handleSuspendedPayment` when `isSubscriptionOrder` is true. V5 and V6 do not have this branch. That is acceptable only if admins weigh subscriptions on V7 or V8.

## Card save

`createCardTokenProcess` calls Grow `createPaymentProcess` with `chargeType=3`, `saveCardToken=1`, `sum=1`, `paymentNum=1`, `cField1=subscriptionId`. This is Grow's documented "save token only" flow: https://grow-il.readme.io/reference/overview-4

The customer types the card on Grow's hosted page (CreditGuard iframe). The card number and CVV never reach our code. The token is written only to `subscriptionPaymentSecrets`. `basketSubscriptions.card` stores last4, brand, and expiry so the customer can see which card is on file. Last4 is not PAN data under PCI; the token is the sensitive value and is blocked by rules.

The webhook `handleSubscriptionCardNotification` always returns 200. It does not trust the posted body for the token. It calls `getPaymentProcessInfo` with the process id and process token stored when the page was opened. It accepts the webhook's token only if `processId` matches the pending process. `extractCardDetails` accepts several field spellings because Grow's docs did not name them. The sandbox later showed the real shape (below).

`confirmBasketSubscriptionCard` does the same read from the success page, so a missed webhook still saves the card.

### Consent

Grow requires a checkbox, before purchase, in which the customer agrees that the card will be kept for future charges. The wording lives in two places that must stay identical:

- `functions/utils/subscriptionConsent.js` — `CARD_CONSENT_VERSION` (`2026-11-21`) and `CARD_CONSENT_TEXT`.
- `src/services/basketSubscriptionService.js` — the same version and text.

The client sends `cardSaveConsent: true` and `cardSaveConsentVersion`. The server rejects anything else with `CARD_CONSENT_REQUIRED`. The stored record (on the secrets doc, and a short copy on the subscription) includes the exact text, version, purpose (`signup` or `replace_card`), time, IP, and user agent. Replacing a card asks again, in a SweetAlert checkbox, and is rejected server-side without it.

The signup page also says payment is credit card only. Grow's sandbox page for these credentials shows card number, expiry, and ID, and no wallet buttons. We did not add our own card form.

### Approve once

Grow: "a server update is sent only for the first transaction, and approve only that first transaction."

`approveFirstTransactionOnce` claims `approvedTransactionIds` in a transaction before calling `approveTransaction`, so a second webhook or the success page does not approve twice. On failure it removes the claim so a retry can try again. Token charges are never approved.

This is the one Grow behavior we could not prove. Calling `approveTransaction` ourselves, with data from `getPaymentProcessInfo` after a sandbox card save, returned error 722: "לא ניתן לבצע אישור לעסקה שלא בוצעה או בוטלה" ("cannot approve a transaction that was not performed or was cancelled"). The card-save transaction stayed `statusCode` 11, "עסקה מושהית" (suspended). The ₪1 was not captured. Approve may only succeed when Grow posts the real webhook. The first live signup's function logs are the check: a 722 there means approve still does not work.

## Generation

`generateSubscriptionOrders` queries `nextGenerateAt <= now` and filters status in memory. Paused, canceled, and `payment_failed` subscriptions have `nextGenerateAt: null`.

`nextGenerateAt` is `openLeadHours` (default 96, max 14 days) before the community cutoff. The cutoff is the end of the delivery day in `Asia/Jerusalem` minus `defaultCutoff.hoursBeforeDelivery`, unless that date has an exception cutoff.

`planNextCycle` keeps an unshifted `anchorDeliveryDate` so a holiday does not move every later delivery. `resolveDeliveryDateInWeek` moves only that week's delivery to the nearest delivery day in the same Sunday–Saturday week. If the community has no delivery that week, the cycle is skipped and the anchor still advances. Dates whose delivery day has already ended are jumped over.

For each basket line the generator picks an open farmer form (`chooseOpenForm`: the form saved on the basket, else an always-on form, else any open classic form). Closed or out-of-stock lines are recorded on `subscription.unavailableLines` and omitted. Stock is decremented in the same transaction as `tx.create` of the order. The order id is deterministic, so a rerun cannot create a second order for the same delivery.

A customer skip of a date that already has an order, before cutoff, cancels that order and restores stock.

## Customer edits

`canCustomerRemoveSubscriptionLine`: a subscription order that is still `held` / `pending_weighing` can exclude any line, even after the farmer form closed. Putting a line back, or adding a new one, still requires the form to be open. The server checks again in `addSubscriptionOrderItems` and in `toggleCustomerLineExclusion`. New lines get a `lineSeed` so their `lineId` does not collide with basket lines.

`listSubscriptionAddableProducts` returns products whose farmer form is open for that delivery and whose stock is above zero. Forms are cached 60 seconds.

## Charge — the bug

### What we believed

An earlier reading of Grow's docs said `transactionGroupIdentifier` rejects a second successful payment in the same group. The first implementation allocated one group id per order and reused it, and treated a group-related error as "already charged, do not email the customer".

### What the sandbox showed (2026-11-21)

Credentials: test user `2c95741943b955ad`, page code `8c28655488db`, host `https://sandbox.meshulam.co.il`.

1. `createPaymentProcess` with the save-token parameters returned a hosted URL. A standard test card `4580458045804580`, expiry 12/28, ID `000000018` was accepted. CreditGuard redirected with `errorCode=000` and "עסקה תקינה".
2. `getPaymentProcessInfo` returned the token and the fields our parser needed. Real shape, not the guesses:

```
data.customField.cField1          subscription id
data.transactions[0].cardToken    40-char token
data.transactions[0].cardSuffix   "4580"
data.transactions[0].cardBrand    "Visa"
data.transactions[0].cardExp      "1228"
data.transactions[0].statusCode   "11"   (suspended, the ₪1)
data.transactions[0].transactionId / transactionToken / asmachta
```

3. `createTransactionWithToken` with `paymentType: 2`, `paymentNum: 1`, invoice `productData`, and both identifiers returned `status: 1`, `statusCode: 2` ("שולם"), `sum: "12.5"`.
4. The same `transactionUniqueIdentifier` again returned:

```
{ "status": 0, "err": { "id": 1010, "message": "מזהה עסקה יחודי כבר קיים עבור בית העסק..." }, "data": "" }
```

   Grow's email is right, and stronger than the docs: 1010 fires even when the first request failed. A failed charge burns the identifier. Reusing it cannot retry.

5. A **new** unique identifier with the **same** group identifier was accepted and paid (`transactionId` 572438 vs 572437). The group identifier does not prevent a double charge. The doc page that still says it does (`createTransactionWithToken` on grow-il.readme.io) disagrees with Grow's email and with this test. Trust the email and the sandbox.

6. `getTokenTransactionsByExternalIdentifiers` with `userId`, `cardToken`, and `transactionUniqueIdentifier` returned the paid transaction, including `statusCode: 2`, `transactionId`, `asmachta`, `sum`. An unused identifier returned `transactions: []`. Sending both identifiers returned error 1012, nested as `err.id = { id: 1012, content: "..." }`, `err.message = "שגיאה כללית"`. `readChargeResponse` unwraps `err.id.id`.

7. `findTokenTransactionByUniqueIdentifier` plus `attemptTokenCharge` were then run against that already-paid unique id. Grow returned 1010, the lookup found `statusCode` 2, and the function returned `outcome: "paid", recovered: true` with the original transaction id. No second charge.

### What the code does now

`handlers/subscriptionCharge.js`:

- One `groupIdentifier` per order, kept for lookups only.
- One `pendingUniqueIdentifier` per in-flight attempt. `planIdentifiers` reuses it until Grow answers, including after a timeout or a crash (`outcome: "unknown"` reverts the order to `held` but leaves the pending id).
- A new identifier is allocated only when the previous one is known not to have been paid.
- On 1010, `findTokenTransactionByUniqueIdentifier` is called with the **card token that attempt used**, stored at `subscriptionPaymentSecrets.orderCharges[orderId]`. If the customer replaced the card between the attempt and the retry, the lookup still uses the old token. If the lookup says paid, the order is completed and the customer is not charged again. If the lookup finds nothing paid, the identifier is burned and exactly one fresh identifier is tried. If the lookup itself fails, the outcome stays unknown and the same identifier is kept.
- A normal decline (`outcome: "declined"`) sets the subscription to `payment_failed`, clears `nextGenerateAt`, and emails the customer. A 1010 does not.
- `checkTokenOwnership` refuses to charge unless the secrets doc's `userId` and `subscriptionId` match the subscription, and the order's `userId` matches the subscription's `userId`. This is Grow's "do not charge customer A's token for customer B" rule.
- `plainText` strips characters outside letters, digits, spaces, and `. , ( ) -` from names, descriptions, and invoice line text before they are sent. Grow asks for no special characters; a `"` in `5 ק"ג` would break a form body.

`attemptTokenCharge`, `planIdentifiers`, `checkTokenOwnership`, `classifyChargeFailure`, and `takeIdentifiers` are exported and unit-tested with the real sandbox response bodies, including the nested 1012 id.

## Tests that exist

Functions (`npm test`, node:test), 112 passing after this work, including:

- `utils/subscriptionSchedule.test.js` — Israel winter/summer offsets, cutoff, holiday shift that does not move the anchor, biweekly, lead hours, classic form (open until one hour before `endingTime`), always-on form (schedule, weekly days, participation, cutoff override, go-live).
- `utils/subscriptionOrderBuilder.test.js` — form choice, line ids, quantity discount, unit-to-kg charge quantity, delivery fee (pickup free, village fee, city threshold), generated order shape, charge plan appending a delivery line and re-pricing it on the weighed total.
- `utils/subscriptionCharge.test.js` — 1010 vs decline, identifier counter bounds, pending-id reuse, token ownership, paid / timeout / 1010-paid / 1010-unpaid / 1010-lookup-down / decline, consent version, `plainText`, response parsing.

Frontend Jest: `chargeOrderV7.test.js` asserts a subscription order calls `chargeSubscriptionOrder` and a normal order calls `handleSuspendedPayment`. Existing delayed-flow tests still pass (52 in the last targeted run).

Not covered by automated tests: the HTTP handlers themselves (they need Firestore and Grow), the webhook, approve, the scheduler's stock transaction, and any browser flow on the deployed site.

## Grow checklist

| Grow requirement | Where it stands |
|---|---|
| Credit card only, no wallets | Their token page. Our copy says so. We do not render a card form. |
| Checkbox before the card is saved | Signup and replace-card. Server rejects a missing or stale version and stores the text. |
| Save token only (`sum=1`, `chargeType=3`, `saveCardToken=1`) | `createCardTokenProcess`. Sandbox confirmed. The ₪1 stayed suspended. |
| Charge later with `createTransactionWithToken` | `chargeCardToken`. Sandbox confirmed, with invoice lines. |
| `transactionUniqueIdentifier` on every charge; 1010 means "already used", even after a failure | `pendingUniqueIdentifier` plus the lookup. Sandbox confirmed, including recovery of a paid attempt. |
| `transactionGroupIdentifier` is not unique and does not reject | Used only as a lookup key, one per order. Sandbox confirmed it does **not** block a second charge. |
| Lookup `getTokenTransactionsByExternalIdentifiers` with exactly one identifier | `findTokenTransactionByUniqueIdentifier`. Both identifiers together return 1012. |
| Never charge customer A's token for customer B | `checkTokenOwnership`, and the token is keyed by subscription id. |
| Notify and approve only the first transaction | Approve is only called from the card webhook and the success-page confirm, once per transaction id. **Not confirmed**: sandbox approve returned 722. |
| No special characters | `plainText` / `cleanProductData`. |

## Reviewer checklist

Things worth challenging, in order:

1. **Double charge after a crash.** Trace `chargeSubscriptionOrder` from the lock transaction through `attemptTokenCharge` for: timeout before any Grow response, timeout after Grow paid but before we saved, 1010 with a paid lookup, 1010 with an empty lookup, 1010 with a failed lookup, and a card replaced between the two attempts. The pending id and `orderCharges[orderId].cardToken` are the whole mechanism.
2. **Approve 722.** Read `approveFirstTransactionOnce` and `approveCardTransaction`. Decide whether error 722 is expected for a `chargeType=3` suspended ₪1, and whether a failed approve blocks the subscription (it should not: the card is saved first, approve errors are logged).
3. **Public create on `customerOrdersDelayed`.** Confirm the `orderIds` membership check is the only thing standing between a forged order and a token charge, and that the order's `userId` is also checked.
4. **Stock.** `processSubscriptionCycle` decrements stock inside the order-create transaction. Skip/cancel of a generated order should put it back. Check the restore path in `subscriptionManage.js` (`cancelGeneratedOrder`) for a partial failure.
5. **Delivery fee.** `buildChargePlan` recomputes the fee from the weighed product total and appends a line. The weighing UI drops shipping lines for delayed orders; subscriptions must not depend on the UI to keep the fee. A city order that crosses `freeShippingMinCart` after weighing should charge 0.
6. **Scheduler vs customer edit.** An order is created `openLeadHours` before cutoff. Confirm a customer can still remove lines after creation and before weighing, and cannot add once `isFarmerFormOpenForDelivery` is false. The form-open port in `subscriptionSchedule.js` is a copy of the frontend rules; drift between the two would let the server accept an add the store would hide, or the reverse.
7. **Consent drift.** The version string is copied by hand into the frontend. A mismatch fails every signup with `CARD_CONSENT_REQUIRED`.
8. **Sandbox guard drift.** The tester uid list is duplicated in `subscriptionBasketService.js` and in the function default. The function is the one that matters.
9. **V5/V6.** Charging a subscription order from an old weighing screen would call `handleSuspendedPayment` and fail or, worse, try to capture a hold that does not exist. Confirm admins cannot reach those screens for these orders, or that the failure is safe.
10. **Secrets in logs.** Webhook logs should contain field names and booleans, not the token. Check `subscriptionSignup.js` log lines.
11. **Idempotent order id.** `sub_{subscriptionId}_{deliveryDate}` plus `tx.create` should make a duplicate scheduler run fail cleanly rather than double-decrement stock.

## Files

Functions, new unless noted:

- `utils/growTokenClient.js`, `utils/growClient.js` (token host override only), `utils/customerAuth.js`, `utils/subscriptionConsent.js`
- `utils/subscriptionSchedule.js`, `utils/subscriptionOrderBuilder.js`, `utils/subscriptionData.js`
- `handlers/subscriptionSignup.js`, `subscriptionGeneration.js`, `subscriptionCharge.js`, `subscriptionManage.js`, `subscriptionEmail.js`
- `index.js` exports only
- tests next to the utils: `subscriptionSchedule.test.js`, `subscriptionOrderBuilder.test.js`, `subscriptionCharge.test.js`

Frontend:

- `src/services/subscriptionBasketService.js`, `src/services/basketSubscriptionService.js`
- `src/components/admin/SubscriptionBasketAdmin.js`, admin dashboard card
- `src/components/category-store/SubscriptionBasketCard.js`, `CategoryStore.js` (tester gate)
- `src/components/subscriptions/SubscribeBasketPage.js`, `SubscriptionSuccess.js`, `MySubscriptions.js`, `SubscriptionAddItems.js`
- `src/components/CustomerOrderDetail.js`, `src/services/customerOrderService.js` (remove-anytime rule)
- `src/components/adminV5/deliveryWeighingV5/apiV7.js`, `v7/chargeOrderV7.js`, `DeliveryManagementV7.js`, `DeliveryManagementV8.js`
- `src/App.js` routes, `firestore.rules`
