## Architecture: Files, Modules, and Data

### New modules and files
- `src/components/independent/CreateIndependentOrderForm.js`
  - Create flow with threshold fields (`minCommunityTotal`, `thresholdDeadline`) and volunteer fields (`volunteerIncentive`, `volunteerWhatsappMessage`).
  - Sets `mode: 'independent'`, `paymentRoute: 'threshold'`.
- `src/components/independent/IndependentOrderForm.js`
  - Order page with products, threshold progress, and volunteer CTA when no pickup spot for user’s community.
- `src/components/independent/VolunteerPickupSpot.js`
  - Host volunteer flow; writes selected community/pickup spot; shows WhatsApp share.
- `src/components/independent/FarmerDashboard.js`
  - Manage independent orders, view threshold progress and pickup volunteers.
- `src/components/independent/IndependentOrderConfirmation.js`
  - Independent checkout; calls alternate payment endpoint.
- `src/components/independent/components/ThresholdProgressBar.js`
  - Visualizes current collected amount vs minimum and countdown to deadline.

### Shared infra
- `src/contexts/SaleModeContext.js`
  - Provides `saleMode: 'weekly' | 'independent'`, `setSaleMode`; persists to localStorage.
- `src/components/shared/ModeToggle.js`
  - Toggle UI bound to `SaleModeContext`.
- `src/hooks/usePaymentGateway.js`
  - Returns payment handler and endpoint by order mode/paymentRoute.
- `src/hooks/useThreshold.js`
  - Helpers for threshold percentage, remaining amount/time.

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
- `src/components/Cart.js`
  - Add `ModeToggle`.
  - Render items from `cartItemsByMode[saleMode]`.
  - Prevent mixing; offer to switch mode (and clear other mode’s cart) when needed.
- `src/contexts/CartContext.js`
  - Store `cartItemsByMode: { weekly: ItemsByOrder, independent: ItemsByOrder }`.
  - Derive active view by `saleMode` from `SaleModeContext`.
  - Migrate from legacy cart if present.
- `src/components/OrderConfirmation.js`
  - Weekly-only. Redirect to `/order-confirmation-independent` when `saleMode === 'independent'`.
- `src/components/auth/BusinessRegister.js`
  - Optional checkbox to set `isIndependent` on `businesses/{uid}`.

### Data model (frontend usage)
- `businesses/{businessId}`
  - `isIndependent: boolean`
- `Orders/{orderId}`
  - `mode: 'weekly' | 'independent'`
  - `isIndependentOrder: boolean` (mirror for legacy compatibility)
  - `paymentRoute: 'bit' | 'threshold'`
  - `minCommunityTotal: number`
  - `thresholdDeadline: timestamp`
  - `status: 'draft' | 'collecting' | 'confirmed' | 'cancelled'`
  - `communitiesAllowed: string[]` (or reuse `areas`)
  - `pickupSpots: string[]`
  - `volunteerIncentive: string`
  - `volunteerWhatsappMessage: string`
  - Reuse existing: `orderName`, `imageUrl`, `selectedProducts`, `description`, `shippingDateRange`, `schedule`
- Cart (local, persisted)
  - `saleMode: 'weekly' | 'independent'`
  - `cartItemsByMode: { weekly: ItemsByOrderId, independent: ItemsByOrderId }`
  - Enforce single-mode constraints.

### Payment endpoints
- Weekly: `createBitPayment` (existing payload).
- Independent: `createCommunityThresholdPayment`
  - Include: `orderIds`, `selectedPickupSpot`, `amount`, `productData[..]`, customer contact details.
  - Backend aggregates totals per community and confirms/cancels post-deadline. 