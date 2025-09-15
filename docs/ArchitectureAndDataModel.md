## Architecture: Files, Modules, and Data

### New modules and files
- `src/components/independent/CreateIndependentOrderForm.js`
  - Create flow with threshold fields (`minCommunityTotal`, `thresholdDeadline`) and volunteer fields (`volunteerIncentive`, `volunteerWhatsappMessage`).
  - Sets `mode: 'independent'`, `paymentRoute: 'threshold'`.
- `src/components/independent/IndependentOrderForm.js`
  - Order page with products, threshold progress, and volunteer CTA when no pickup spot for user’s community.
  - Maintains an ephemeral, per-order floating cart (in-component state). No interaction with global cart.
- `src/components/independent/VolunteerPickupSpot.js`
  - Host volunteer flow; writes selected community/pickup spot; shows WhatsApp share.
- `src/components/independent/FarmerDashboard.js`
  - Manage independent orders, view threshold progress and pickup volunteers.
- `src/components/independent/IndependentOrderConfirmation.js`
  - Independent checkout; receives ephemeral cart via navigation state and calls alternate payment endpoint.
- `src/components/independent/components/ThresholdProgressBar.js`
  - Visualizes current collected amount vs minimum and countdown to deadline.

### Shared infra
- `src/contexts/SaleModeContext.js`
  - Provides `saleMode: 'weekly' | 'independent'`, `setSaleMode`; persists to localStorage.
- `src/components/shared/ModeToggle.js`
  - Toggle UI bound to `SaleModeContext`.

### Integration points (edits)
- `src/App.js`
  - Add routes:
    - `/independent/create` → `CreateIndependentOrderForm`
    - `/independent/order/:orderId` → `IndependentOrderForm`
    - `/independent/volunteer/:orderId` → `VolunteerPickupSpot`
    - `/independent/dashboard` → `FarmerDashboard`
    - `/order-confirmation-independent` → `IndependentOrderConfirmation`
  - Wrap with `SaleModeContext` provider.
- `src/components/Home.js`
  - Add `ModeToggle`; render `OngoingOrders` for weekly, `IndependentFarmers` for independent.
- `src/components/OrderConfirmation.js`
  - Weekly-only. Redirect to `/order-confirmation-independent` when `saleMode === 'independent'`.
- `src/components/IndependentFarmers.js`
  - Lists `IndependentOrders`; shows whether a volunteer exists (via `volunteers` subcollection) and navigates to order form.

### Data model (frontend usage)
- `businesses/{businessId}`
  - `isIndependent: boolean`
- `IndependentOrders/{orderId}`
  - `mode: 'independent'`
  - `paymentRoute: 'threshold'`
  - `minCommunityTotal: number`
  - `thresholdDeadline: timestamp|string`
  - `status: 'draft' | 'open' | 'confirmed' | 'cancelled'`
  - `pickupSpots: string[]`
  - `volunteerIncentive: string`
  - `volunteerWhatsappMessage: string`
  - `orderName`, `imageUrl`, `selectedProducts`, `description`, `shippingDateRange`
  - Subcollections: `volunteers/{volunteerId}`
- Ephemeral cart (in-memory, per page)
  - Lives inside `IndependentOrderForm` component state
  - Reset when navigating away; cannot mix across orders

### Payment endpoints
- Weekly: `createBitPayment` (existing payload).
- Independent: `createCommunityThresholdPayment`
  - Include: `orderId`, `selectedPickupSpot`, `amount`, `productData[..]`, customer contact details.
  - Backend aggregates totals per community and confirms/cancels post-deadline. 