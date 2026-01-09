# Delayed Payments (Grow J5/J4) — Backend Snapshot & Implementation Brief

This document is a **handoff + spec** for implementing **delayed payments** using **Grow/Meshulam J5 (suspended hold) → J4 (settlement/final charge)** for the “בסטה בסקט” B2C platform.

The frontend work is already prepared in a **new, isolated stack** (new directories + new routes). The remaining work is to add the **backend Cloud Functions** that:
1) create a **J5 suspended payment process** at checkout (customer authorization),
2) receive the **server-to-server webhook** confirming the hold was created, and
3) later **settle (J4)** using the weighed quantities from the admin workflow.

---

## 1) Business goal (what we’re building)

We want to support grocery-style variable weight pricing:
- Customer orders e.g. **2kg tomatoes + 1kg oranges**
- Customer enters credit card details at checkout, but we **do NOT charge** immediately
- Instead we create a **J5 hold** (money reserved / credit limit impacted)
- On delivery day the admin **weighs the items**, producing actual weights (e.g. 1.955kg tomatoes)
- Backend performs **J4 settlement** for the final sum and generates the final invoice lines

Constraints:
- Grow requires **approval/permission** for J5.
- J5 has a limited window (docs mention **up to ~7 days**, with auto release after ~10 days if not settled).
- **All Grow API requests must be server-side** (browser requests are blocked).
- **Never expose** sensitive process/transaction identifiers (e.g., `processToken`, `transactionToken`) to the customer.

---

## 2) Current frontend state (already implemented)

### 2.1 Admin workflow page (Delivery Management V5)
- **Route**: `/admin/delivery-v5`
- **Code**: `src/components/adminV5/deliveryWeighingV5/DeliveryManagementV5.js`
- **What it does**:
  - Admin selects **week + communities**
  - Loads **real delayed orders from Firestore** `customerOrdersDelayed` (new collection; parallel stack)
  - Admin selects an order → sees items → weighs each item
    - currently supports **placeholder scale reading** + **manual fallback**
  - When all items weighed: admin clicks **Complete + Charge**
    - calls backend placeholder endpoint: `handleSuspendedPayment`
      - (called via `functionsEndpoint('handleSuspendedPayment')`)

We store weighed state locally per week for now:
- `src/components/adminV5/deliveryWeighingV5/storage.js`

### 2.2 Customer checkout page for delayed payments (copy of existing checkout)
- **Route**: `/order-confirmation-delayed`
- **Code**: `src/components/delayedPayment/OrderConfirmationDelayed.js`
- **Behavior**:
  - Creates/updates a `customerOrdersDelayed/{customerOrderId}` doc and marks it as “delayed”
  - Calls backend placeholder endpoint: `createGrowSuspendedPayment`
    - (called via `functionsEndpoint('createGrowSuspendedPayment')`)
  - Redirects customer to the hosted Grow payment page URL returned by backend

Service wrapper used by the page:
- `src/components/delayedPayment/delayedPaymentService.js`

### 2.3 Frontend note: why this is safe
The frontend **never calls Grow directly**. It only calls our backend to get a hosted payment URL.

The frontend must also **never store/reveal**:
- `processId`, `processToken`
- `transactionToken`
- any sensitive identifier required to settle a hold

---

## 3) Firestore model (what we store)

We will use a **new collection** `customerOrdersDelayed` to keep the delayed-payment flow fully isolated from the existing immediate-payment stack (`customerOrders`).

### 3.1 `customerOrdersDelayed/{customerOrderId}` — expected schema
`customerOrdersDelayed` is a **parallel order document** that mirrors the shape of `customerOrders` closely (so we can reuse UI + reporting patterns), but is dedicated to delayed payments.

#### Existing (already present today)
Typical structure (partial):
- `businessIds: string[]`
- `createdAt: string | Timestamp`
- `completedAt: Timestamp`
- `customerDetails: { name, phone, email, address, pickupSpot, deliveryOption, deliveryDetails, ... }`
- `grandTotal: number`
- `orderBreakdown: { [orderId]: { businessId, businessName, subTotal, items: [...] } }`
- delayed-order payment fields (shared naming with legacy, but used differently):
  - `paymentStatus: "pending_payment" | "held" | "completed" | "abandoned" | ...`
  - We **should not** store legacy `paymentDetails` tokens here. Use `delayedPayment` + server-only secrets.

#### New/updated delayed-payment fields (proposal)

- **Delayed order flags**
  - `isDelayedOrder: true`
  - `delayedOrderStatus: string`
    - suggested states:
      - `awaiting_customer_authorization` (after J5 process created)
      - `held` (after webhook confirms suspended transaction)
      - `pending_weighing` (ready for admin weighing)
      - `in_progress` (admin started)
      - `completed` (after J4 settlement)
      - `released` / `canceled`

- **Delayed payment metadata (safe subset)**
  - `delayedPayment: { provider: 'grow', chargeType: 2, holdSum, ... }`
  - DO NOT store tokens in a client-readable place.

  Suggested structure:
  - `delayedPayment.provider: "grow"`
  - `delayedPayment.chargeType: 2`
  - `delayedPayment.holdSum: number`
  - `delayedPayment.heldAt: Timestamp|null`
  - `delayedPayment.settledAt: Timestamp|null`
  - `delayedPayment.statusCode: number|string|null`
  - `delayedPayment.statusText: string|null`
  - `delayedPayment.lastError: { message, at }|null` (optional)

- **Weighing and settlement audit**
  - `weighing.weightsByLineId: { [lineId]: { actualQuantity, source, measuredAt } }`
  - `weighing.finalSum: number`
  - `weighing.finalizedAt: Timestamp`
  - `weighing.finalInvoiceLines: []` (normalized snapshot used for J4 receipt)
  - `weighing.settlementReceipt: { asmachta, statusCode, ... }` (optional)

- **Secure transaction identifiers (server-only)**
You will need `transactionId` and `transactionToken` for settlement.
Store them in a **separate locked-down collection** (recommended):
1) `delayedPaymentSecrets/{customerOrderId}`
   - `transactionId`, `transactionToken`
   - optional: `processId`, `processToken` (debug only)
   - `createdAt`, `updatedAt`
2) Avoid putting tokens inside `customerOrdersDelayed` (assume it may be readable by the customer/client apps).

**Never expose these tokens to the customer frontend.**

### 3.2 Line-item integration (how weighing maps to items)
We should **not mutate** `orderBreakdown.items[]` after checkout (it represents “what the customer requested”). Instead:

1) Ensure each item line has a stable identifier:
- Add `lineId` to every item in `orderBreakdown.*.items[]` at checkout.

Recommended `lineId` format (deterministic, stable):
- `lineId = "${customerOrderId}::${businessOrderId}::${productId}::${selectedOption}::${idx}"`

2) Add “weighable” metadata per item line (additive fields, optional):
- `soldByWeight: boolean`
- `unit: "kg" | "unit" | "pack"`
- `requestedQuantity: number` (requested kg for weighable items; or units for fixed items)
- `unitPrice: number` (price per kg or per unit)
- optional: `maxQuantity` / `maxKg` (ties into J5 frame rules)

3) Store actual measured weight separately:
- `weighing.weightsByLineId[lineId].actualQuantity = <kg>`

4) At settlement time, backend produces:
- `weighing.finalInvoiceLines[]` which is the authoritative “final charged lines”
  - includes `catalogNumber`, `vatType`, `itemDescription`, `finalQuantity`, `unitPrice`, `lineTotal`

This keeps the legacy order display intact while still letting the backend settle accurately.

---

## 4) Grow API summary (what backend must do)

### 4.1 Create Payment Process (J5)
Endpoint:
- `POST https://sandbox.meshulam.co.il/api/light/server/1.0/createPaymentProcess`
- `chargeType = 2` (Suspended/Hold / J5)

Must be called **only from backend**.

Webhook:
- `notifyUrl` receives server-to-server callback when hold is created

### 4.2 Settle Suspended Transaction (J4)
Endpoint:
- `POST https://sandbox.meshulam.co.il/api/light/server/1.0/settleSuspendedTransaction`

Requires:
- `transactionId`
- `transactionToken`
- `sum` (final amount)
- optional `productData[]` (invoice override)

Must be called **only from backend**.

---

## 5) Backend endpoints to implement (Cloud Functions)

The frontend is already wired to these logical endpoints (names can be adjusted, but then update frontend):

### (A) `createGrowSuspendedPayment` — create J5 hold and return payment URL
**Caller:** customer frontend (`/order-confirmation-delayed`)

**Input** (current frontend payload shape; backend can also accept a normalized payload):
- `customerOrderId`
- `orderIds[]` (weekly Orders IDs used for aggregation)
- `amount` (hold/frame amount)
- `description`
- `successUrl`, `cancelUrl`
- `userName`, `userPhone`, `userEmail`
- flattened invoice fields: `productData[n][catalogNumber|quantity|price|itemDescription|vatType]`

**Backend responsibilities:**
- Validate required fields
- Sanitize strings (Grow disallows special characters in many fields)
- Choose correct Grow credentials (`userId`, `pageCode`) for the business
- Call Grow createPaymentProcess with:
  - `chargeType: 2`
  - `sum: amount`
  - `notifyUrl: <your webhook URL>`
  - `cField2: customerOrderId` (strongly recommended for correlation)
  - invoice fields from `productData`
- Update Firestore:
  - mark order as delayed + awaiting authorization
- Return:
  - `{ status: 1, data: { url } }`

**Critical security rule:**
- DO NOT return `processId` / `processToken` to the client.

### (B) `handleDelayedPaymentNotification` — webhook for J5 “held” creation
**Caller:** Grow server-to-server notifyUrl

**Input:** payload from Grow (contains `transactionId`, `transactionToken`, `processId`, `processToken`, status, etc.)

**Backend responsibilities:**
- Correlate the callback to a `customerOrderId`
  - recommended: use `cField2` from the callback payload
- Store sensitive fields in secure storage:
  - `transactionId`, `transactionToken` (required for settlement)
  - do not make readable by client
- Update Firestore order:
  - `paymentStatus: 'held'` (or a new status)
  - `delayedOrderStatus: 'pending_weighing'`
  - store safe non-secret metadata for ops/debug

### (C) `handleSuspendedPayment` — settle J5 → J4 (admin action)
**Caller:** Admin V5 page (`/admin/delivery-v5`)

**Input**:
- `orderId` = `customerOrdersDelayed` doc id
- `weightsByLineId` = `{ [lineId]: { actualQuantity, source } }`

**Backend responsibilities:**
- Authenticate + authorize admin
- Load:
  - `customerOrdersDelayed/{orderId}`
  - secure tokens (`transactionId`, `transactionToken`) for that order
- Compute final invoice lines and final sum based on weights
- Call Grow settleSuspendedTransaction with:
  - `transactionId`, `transactionToken`, `sum`, and invoice override productData
- Update Firestore:
  - `paymentStatus: 'completed'`
  - `delayedOrderStatus: 'completed'`
  - store final invoice snapshot, final sum, timestamps, `asmachta`

---

## 6) Recommended backend file structure (in the Cloud Functions repo)

Mirror the existing “independent” structure, but for regular delayed orders:

```
handlers/
  delayedPayment.js        # createGrowSuspendedPayment (J5 createPaymentProcess)
  delayedNotification.js   # handleDelayedPaymentNotification (notifyUrl webhook)
  delayedSettlement.js     # handleSuspendedPayment (J4 settleSuspendedTransaction)
  delayedCancel.js         # optional cancel/release/expire helpers
  delayedScheduled.js      # optional cleanup / expiry tasks
```

---

## 7) Operational / rollout plan

1) Implement backend endpoints and test in **sandbox**
2) Update checkout to route users to `/order-confirmation-delayed` (later step)
3) Add explicit Firestore flags:
   - `isDelayedOrder`, `delayedOrderStatus`, `delayedPayment.*`
4) Update Admin V5 query logic to rely only on explicit delayed fields
5) Add safety and monitoring:
   - logs for webhook + settlement
   - alerting for “held but not settled within X days”

---

## 8) Security checklist (must-have)

- **Never call Grow from browser** (Grow blocks client-side calls)
- **Never expose** `processToken` / `transactionToken` to the customer
- Webhook endpoints should be hardened:
  - validate payload shape
  - log with redaction
  - avoid leaking secrets in logs
- Admin settlement must require:
  - Firebase Auth token + admin allowlist / role

---

## 9) Frontend integration mapping (quick reference)

- **Create delayed payment (J5)**:
  - frontend: `src/components/delayedPayment/OrderConfirmationDelayed.js`
  - calls: `functionsEndpoint('createGrowSuspendedPayment')`

- **Admin settle (J4)**:
  - frontend: `src/components/adminV5/deliveryWeighingV5/DeliveryManagementV5.js`
  - calls: `functionsEndpoint('handleSuspendedPayment')`

Doc for the admin flow exists here:
- `docs/DeliveryManagementV5-Weighing.md`


