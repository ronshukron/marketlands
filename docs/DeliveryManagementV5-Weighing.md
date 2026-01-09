# DeliveryManagement V5 — Weigh Before Final Charge (Admin Only)

## Goal
Add a **new standalone admin-only page** that lets an admin **weigh “sold-by-weight” items** on delivery day **before** charging the customer fully (like grocery stores).

This implementation is **admin-side only** and lives in a **new directory** to avoid touching the existing delivery/admin stack.

## User Flow (Requested)
- **1) Customer places order**
  - Example: 2kg tomatoes + 1kg oranges.
- **2) Backend creates a delayed/suspended payment** (Grow API; “catch as delayed order”)
  - The order is stored as a “delayed order” and is **not fully charged yet**.
- **3) On delivery day admin opens Delivery Management V5**
  - Admin selects **week** and **communities** (similar filtering concept to `DeliveryManagmentV4.js`).
- **4) Admin sees list of customer delayed orders**
  - Admin selects one order to prepare.
- **5) Admin weighs items**
  - Admin clicks the first item (e.g., tomatoes).
  - Admin puts item on scale and gets reading (later: real hardware integration).
  - For now:
    - **Placeholder “scale reading” button**
    - **Manual weight entry fallback**
  - Admin presses **OK** → the UI **auto-advances to the next item**.
- **6) Complete the order**
  - When all items are weighed, admin clicks **Complete + Charge**
  - This marks the order completed and calls backend `handleSuspendedPayment`.

## Current Implementation (This PR)
### New directory (isolated)
- `src/components/adminV5/deliveryWeighingV5/`
  - `DeliveryManagementV5.js`: the new page (filters, list of delayed orders, weighing workflow, completion)
  - `WeighItemModal.js`: modal for reading/manual entry + “OK and continue”
  - `api.js`: loads **real orders from Firestore `customerOrdersDelayed`** (filters by week + communities) and falls back to mock only if no matches
  - `mockDelayedOrders.js`: fallback delayed orders (only if none found in Firestore)
  - `storage.js`: localStorage persistence for weighed values (per week)

### Route
- `src/App.js`
  - New route: `/admin/delivery-v5`

## Customer Frontend Preparation (Delayed Payment Checkout)
We also added a **new checkout page** (copy of the legacy one) that will be used later when you switch the customer flow to delayed payments:
- `src/components/delayedPayment/OrderConfirmationDelayed.js`
  - Route: `/order-confirmation-delayed`
  - Writes `isDelayedOrder: true` and a few initial delayed-order fields into `customerOrdersDelayed`
  - Calls backend `createGrowSuspendedPayment` to create the Grow J5 process (backend-only call)
- `src/components/delayedPayment/delayedPaymentService.js`

## Data Model (Frontend Shape)
Each “delayed order” is expected to look like:
- `id`: string
- `weekKey`: string (YYYY-MM-DD; Sunday)
- `pickupSpot`: string
- `customerDetails`: { name, phone, pickupSpot }
- `items`: array of
  - `lineId`: unique per line
  - `productId`, `productName`
  - `unit`: `"kg"`
  - `requestedQuantity`: number (kg)
  - `pricePerUnit`: number (₪ per kg)
- `suspendedPaymentRef`: object (future: provider payment id / reference)

The weighing state is stored locally (per week):
- `weightsByLineId[lineId] = { actualQuantity, source }`
  - `source`: `manual | scale_placeholder`

## Backend Integration Points (Later)
### 1) Fetch delayed orders from Grow
In `src/components/adminV5/deliveryWeighingV5/api.js`:
- Implement Cloud Function: `getDelayedOrdersForDeliveryV5`
- Return the array of delayed orders in the shape above.

### 2) Finalize / capture the suspended payment
In `src/components/adminV5/deliveryWeighingV5/api.js`:
- Implement Cloud Function: `handleSuspendedPayment`
- Expected payload (current frontend call):
  - `{ orderId, weightsByLineId }`
- Backend responsibilities:
  - Validate admin auth
  - Recompute totals based on weighed quantities
  - Call provider (Grow) to finalize/capture the J5/suspended payment
  - Persist final invoice lines + order status

## Notes / Constraints
- **Admin-only**: gated by the same UID whitelist pattern used elsewhere.
- **Does not modify old delivery pages**: V4 and older remain untouched.
- **Customer/payment flow not switched yet**: later we will update `src/components/OrderConfirmation.js` to use the delayed-payment version or migrate logic over.


