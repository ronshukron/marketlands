## Implementation Plan (Now)

### Progress summary
- Completed
  - Created `SaleModeContext` with persistence; integrated across app
  - Redesigned `ModeToggle` as segmented control (Weekly = blue, Independent = green), mobile-friendly and accessible
  - Added independent routes in `App.js`:
    - `/independent/create`, `/independent/order/:orderId`, `/independent/volunteer/:orderId`, `/volunteer-share-success`, `/order-confirmation-independent`
  - Independent order page `IndependentOrderForm` overhauled:
    - Fetches order + business + selected products
    - Ephemeral, in-component cart with stock and option checks
    - New `FloatingCart` component (view items, change qty, remove, go to payment)
    - Volunteer gating: If no volunteer → disable add-to-cart and show CTA; if exists → enable
  - `IndependentOrderConfirmation` now mirrors weekly UX:
    - Reads `{ orderId, items, total }` from `location.state`
    - Collects buyer details, pickup spot, terms; validates
  - `ThresholdProgressBar` inlined calculations; removed deleted hook usage
  - Volunteer flow implemented:
    - `VolunteerPickupSpot` saves to dedicated `volunteers` collection (not a subcollection)
    - Updates `IndependentOrders/{orderId}` with `hasVolunteer: true`, `volunteerId`, and `volunteerInfo`
    - Adds optional `locationInstructions` and includes it in WhatsApp share template
    - `VolunteerShareSuccess` page with share/copy actions, mobile-friendly buttons
  - Discovery list:
    - `IndependentFarmers` updated to check volunteers from main `volunteers` collection (query by `orderId`) and display status badge
  - Weekly/global cart remains unchanged

- In progress / Next
  - Implement `createCommunityThresholdPayment` integration on independent confirmation
  - Compute `currentTotal` per community for threshold display (server-driven or aggregated read)
  - Optional: Discovery filter “show only orders with pickup volunteer”
  - Farmer dashboard basics (progress, volunteers list)
  - Error/empty/edge states hardening and i18n copy polish
  - Accessibility sweep and keyboard navigation checks across new pages

### 1) Foundations
- Keep existing global cart for weekly only. No split cart by mode. [done]
- `SaleModeContext` and `ModeToggle` wired into `App`. [done]

### 2) UI toggles and routing
- `Home.js` uses segmented toggle; headings align with active mode. [done]
- `App.js` registers routes for independent module and independent confirmation. [done]

### 3) Independent checkout (ephemeral cart)
- `IndependentOrderForm.js`:
  - Maintain an in-component floating cart (state) for the current order only. [done]
  - Add a floating mini-cart UI with “Go to payment”. [done]
  - On click, navigate to `/order-confirmation-independent` with `{ items, total, orderId }` in navigation state. [done]
- `IndependentOrderConfirmation.js`:
  - Mirror weekly confirmation UX, reading data from `location.state` instead of global cart. [done]
  - Call `createCommunityThresholdPayment` endpoint. [pending]

### 4) Independent create and order pages
- `CreateIndependentOrderForm.js`:
  - Threshold/volunteer fields; set `mode: 'independent'`, `paymentRoute: 'threshold'`. [done]
- `IndependentOrderForm.js`:
  - Show threshold progress (`ThresholdProgressBar`). [done]
  - Gate ordering by volunteer presence. [done]
- `VolunteerPickupSpot.js`:
  - Persist volunteer in main `volunteers` collection (fields: `orderId`, `fullName`, `phone`, `community`, `address`, `locationInstructions`, `userId`, `volunteeredAt`). [done]
  - Update order (`IndependentOrders/{orderId}`) with `hasVolunteer`, `volunteerId`, `volunteerInfo`. [done]
- `VolunteerShareSuccess.js`:
  - Show volunteer info, message preview, WhatsApp share and copy actions (mobile-optimized). [done]

### 5) Discovery and status
- `IndependentFarmers.js` lists `IndependentOrders` and hydrates volunteer status by querying `volunteers` for matching `orderId`. [done]
- Optional: Add toggle to show only orders with a pickup volunteer. [pending]

### 6) Data model (frontend usage)
- `IndependentOrders/{orderId}`
  - `mode: 'independent'`, `paymentRoute: 'threshold'`
  - `minCommunityTotal`, `thresholdDeadline`, `status`, `pickupSpots`, `volunteerIncentive`, `volunteerWhatsappMessage`
  - `orderName`, `imageUrl`, `selectedProducts`, `description`, `shippingDateRange`
  - `hasVolunteer: boolean`, `volunteerId: string`, `volunteerInfo: {...}` [added]
- `volunteers/{volunteerId}`
  - `orderId`, `fullName`, `phone`, `community`, `address`, `locationInstructions`, `userId`, `volunteeredAt`

### 7) Security rules (to apply in Firebase Console)
- Firestore
  - `IndependentOrders` (read: public; create/update: business owner; delete: deny). [exists]
  - `volunteers` (main collection):
    - `read: if true`
    - `create: if true` (allow broad community participation)
    - `update: if isAuthenticated() && resource.data.userId == request.auth.uid`
    - `delete: if false`
- Storage
  - Use `businesses/{businessId}/independent-orders/...` for uploads to align with existing `businesses` rule. [done]

### Acceptance checks
- Weekly flow remains unchanged with global cart. [done]
- Independent order page uses ephemeral cart; leaving the page clears it. [done]
- Independent confirmation uses the new endpoint with state-passed items. [pending integration]
- Volunteer flow enables ordering only when a volunteer exists. [done]
- Discovery clearly indicates volunteer status. [done]
- Mobile UX: floating cart, share buttons, and segmented toggle are touch-friendly and readable. [done]

### Open items / Next actions
- Implement backend call for `createCommunityThresholdPayment` and handle redirects/responses
- Aggregate `currentTotal` and expose per community for threshold bar
- Add optional discovery filter for “Only with pickup volunteer”
- Add Farmer Dashboard scaffolding for monitoring
- Improve error states (order ended, stock mismatches, missing state) and toast UX
- QA pass across devices; finalize copy; instrument analytics where needed 