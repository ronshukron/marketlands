## Implementation Plan (Now)

### 1) Foundations
- Create `SaleModeContext` and `ModeToggle` and wire them into `App`:
  - Persist `saleMode` to localStorage.
  - Default to `weekly`.
- Refactor `CartContext`:
  - Introduce `cartItemsByMode`.
  - Read `saleMode` from `SaleModeContext`.
  - Migrate legacy single cart if found.
  - Block mixing modes; add helper to switch mode and clear other cart.

### 2) UI toggles and routing
- `Home.js`: add `ModeToggle` and conditional rendering (`OngoingOrders` vs `IndependentFarmers`).
- `Cart.js`: add `ModeToggle`, display only current mode’s items.
- `App.js`: register routes for independent module and `IndependentOrderConfirmation`.

### 3) Independent checkout
- Add `IndependentOrderConfirmation.js`:
  - Mirror weekly confirmation UX.
  - Use `usePaymentGateway` to call `createCommunityThresholdPayment`.
  - Ensure payload includes `orderIds`, `selectedPickupSpot`, and `productData`.

### 4) Independent create and order pages
- Add `CreateIndependentOrderForm.js`:
  - Threshold/volunteer fields; set `mode: 'independent'`, `paymentRoute: 'threshold'`.
- Add `IndependentOrderForm.js`:
  - Show threshold progress (via `ThresholdProgressBar`).
  - Show volunteer CTA if no pickup spot for user’s community.
- Add `VolunteerPickupSpot.js`:
  - Persist pickup spot for the community and show WhatsApp share.

### 5) Nice-to-haves (can follow)
- `FarmerDashboard.js` for progress monitoring.
- `useThreshold.js` helper.
- Optional checkbox in `BusinessRegister.js` to mark `isIndependent`.

### Acceptance checks
- Toggling Home updates Cart and vice versa.
- Weekly and independent carts remain separate; adding items in the wrong mode prompts a switch.
- Weekly checkout unchanged; independent checkout uses new endpoint.
- Volunteer flow unblocks ordering for that community. 