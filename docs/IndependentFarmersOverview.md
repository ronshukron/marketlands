## Independent Farmers Initiative — Overview

### Goals
- **Empower independent farmers** to self-manage product listings and order forms.
- **Community threshold checkout**: orders are confirmed only if a community reaches a minimum total by a deadline.
- **Seamless user experience**: users can toggle between existing weekly sales and independent farmer orders; cart respects the selected mode.

### Personas
- **User (buyer)**: browses weekly or independent, orders to a pickup spot in their community.
- **Volunteer host**: pledges to host a pickup spot for an independent order that has no spot yet; shares a pre-filled WhatsApp message.
- **Independent farmer**: creates order forms, sets thresholds and volunteer incentive, tracks progress.
- **Coordinator (existing)**: continues current weekly flows unchanged.

### High-level flows
- **Discovery**
  - Home shows a toggle: **Weekly** vs **Independent**.
  - Weekly: existing `OngoingOrders`.
  - Independent: `IndependentFarmers` list; navigate to individual order forms.
- **Volunteer pickup spot**
  - If no pickup spot is set for the user’s community, show a “Volunteer host” CTA.
  - Collect volunteer info, persist spot, and present a pre-filled WhatsApp message to share.
- **Cart and checkout**
  - Cart is split by mode: `weekly` and `independent`. Users cannot mix.
  - Weekly checkout uses existing Bit payment.
  - Independent checkout uses a threshold-aware payment endpoint and includes community context.
- **Threshold outcome**
  - Backend confirms or cancels after deadline based on community totals. Frontend displays progress (amount vs minimum, countdown).

### Out of scope (frontend)
- Refund/void handling and final threshold decision logic (handled in backend).
- Admin tooling beyond farmer dashboard basics. 