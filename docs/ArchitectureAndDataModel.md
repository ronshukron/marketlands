## Architecture: Files, Modules, and Data

### New modules and files
- `src/components/independent/CreateIndependentOrderForm.js`
  - Create flow with threshold fields (`minCommunityTotal`, `endingTime`) and volunteer fields (`volunteerIncentive`, `volunteerWhatsappMessage`).
  - Sets `mode: 'independent'`, `paymentRoute: 'threshold'`.
- `src/components/independent/IndependentOrderForm.js`
  - Order page with products, threshold progress, and volunteer CTA when no pickup spot for user’s community.
  - Maintains an ephemeral, per-order floating cart (in-component state). No interaction with global cart.
- `src/components/independent/VolunteerPickupSpot.js`
  - Host volunteer flow; requires login; creates `volunteers` entry, backend function updates `IndependentOrders`.
  - Shows WhatsApp share.
- `src/components/independent/FarmerDashboard.js`
  - Manage independent orders, view threshold progress and pickup volunteers.
- `src/components/independent/IndependentOrderConfirmation.js`
  - Independent checkout; receives ephemeral cart via navigation state and calls alternate payment endpoint.
- `src/components/independent/components/ThresholdProgressBar.js`
  - Visualizes current collected amount vs minimum and countdown to deadline.
- `src/components/independent/MyVolunteerSpots.js` [new]
  - Lists the logged-in user’s volunteer spots and related orders.
- `src/services/communityService.js` [new]
  - Search communities; callable to create-if-missing safely on the backend.

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
    - `/my-volunteer-spots` → `MyVolunteerSpots`
  - Wrap with `SaleModeContext` provider.
- `src/components/Home.js`
  - Add `ModeToggle`; render `OngoingOrders` for weekly, `IndependentFarmers` for independent.
- `src/components/OrderConfirmation.js`
  - Weekly-only. Redirect to `/order-confirmation-independent` when `saleMode === 'independent'`.
- `src/components/IndependentFarmers.js`
  - Lists `IndependentOrders`; shows whether a volunteer exists (via `volunteers` collection) and navigates to order form.
- `src/components/auth/UserRegister.js`
  - Replace community free-text with searchable dropdown over `communities`. If no match, call backend to create.

### Data model (frontend usage)
- `businesses/{businessId}`
  - `isIndependent: boolean`
- `IndependentOrders/{orderId}`
  - `mode: 'independent'`
  - `paymentRoute: 'threshold'`
  - `minCommunityTotal: number`
  - `endingTime: timestamp`
  - `status: 'draft' | 'open' | 'confirmed' | 'cancelled'`
  - `pickupSpots: string[]`
  - `volunteerIncentive: string`
  - `volunteerWhatsappMessage: string`
  - `orderName`, `imageUrl`, `selectedProducts`, `description`, `shippingDateRange`
  - `hasVolunteer: boolean`
  - `volunteerId: string`
  - `volunteerInfo: { id, fullName, phone, community, address, locationInstructions, volunteeredAt }`
- `volunteers/{volunteerId}`
  - `orderId`, `fullName`, `phone`, `community`, `address`, `locationInstructions`, `userId`, `volunteeredAt`
- `communities/{communityId}` [new]
  - `name: string`
  - `region: string`
  - `aliases: string[]`
  - `createdAt: timestamp`
  - `createdBy: userId|null`
- User
  - `users/{uid}`: `name`, `email`, `phone`, `communityId`, `communityName` (denormalized), `orders[]`, optional `volunteerSpots[]` (references or ids; backend-managed)
- Ephemeral cart (in-memory, per page)
  - Lives inside `IndependentOrderForm` component state
  - Reset when navigating away; cannot mix across orders

### Payment endpoints
- Weekly: `createBitPayment` (existing payload).
- Independent: `createCommunityThresholdPayment`
  - Include: `orderId`, `selectedPickupSpot`, `amount`, `productData[..]`, customer contact details.
  - Backend aggregates totals per community and confirms/cancels post-deadline. 

### Backend functions (new/tightened)
- `createCommunityIfMissing(name, region?, alias?)` → creates `communities` doc if exact/alias not found.
- `updateIndependentOrderVolunteer(orderId, volunteerId, volunteerInfo)` → updates `IndependentOrders` (server-only), asserts `context.auth`.

### Security rules (high-level)
- `IndependentOrders` → read: public; create/update/delete: server-only (functions).
- `volunteers` → read: public; create: public; update: owner (authenticated); delete: deny.
- `communities` → read: public; create: authenticated (prefer callable); update/delete: deny. 