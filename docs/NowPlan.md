## Implementation Plan (Now)

### 1) Foundations
- Create `SaleModeContext` and `ModeToggle` and wire them into `App`:
  - Persist `saleMode` to localStorage.
  - Default to `weekly`.
- Keep existing global cart for weekly only. No split cart by mode.

### 2) UI toggles and routing
- `Home.js`: add `ModeToggle` and conditional rendering (`OngoingOrders` vs `IndependentFarmers`).
- `App.js`: register routes for independent module and `IndependentOrderConfirmation`.

### 3) Independent checkout (ephemeral cart)
- `IndependentOrderForm.js`:
  - Maintain an in-component floating cart (state) for the current order only.
  - Add a floating mini-cart UI with “Go to payment”.
  - On click, navigate to `/order-confirmation-independent` with `{ items, totals, orderId, selectedPickupSpot }` in navigation state.
- `IndependentOrderConfirmation.js`:
  - Mirror weekly confirmation UX, reading data from `location.state` instead of global cart.
  - Call `createCommunityThresholdPayment` endpoint.

### 4) Independent create and order pages
- `CreateIndependentOrderForm.js`:
  - Threshold/volunteer fields; set `mode: 'independent'`, `paymentRoute: 'threshold'`.
- `IndependentOrderForm.js`:
  - Show threshold progress (via `ThresholdProgressBar`).
  - Show volunteer CTA if no pickup spot for user’s community.
- `VolunteerPickupSpot.js`:
  - Persist pickup spot for the community and show WhatsApp share.

### 5) Nice-to-haves (can follow)
- `FarmerDashboard.js` for progress monitoring.
- `useThreshold.js` helper (optional inline logic ok).
- Optional checkbox in `BusinessRegister.js` to mark `isIndependent`.

### Acceptance checks
- Weekly flow unchanged with global cart.
- Independent order page uses ephemeral cart; leaving the page clears it.
- Independent confirmation uses the new endpoint with state-passed items.
- Volunteer flow unblocks ordering for that community. 