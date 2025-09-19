## Independent Farmers Initiative — Overview

### Goals
- **Empower independent farmers** to self-manage product listings and order forms.
- **Community threshold checkout**: orders are confirmed only if a community reaches a minimum total by a deadline.
- **Simple UX**: weekly sales use the existing global cart; independent orders use an ephemeral per-order cart and direct checkout.
- **Communities as a first-class identity**: users select a community; unlisted communities can be created (via backend) to avoid typos.

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
  - Requires login to volunteer; backend function updates the independent order with volunteer info.
  - Collect volunteer info, persist spot, and present a pre-filled WhatsApp message to share.
- **Independent order flow (no global cart)**
  - User opens an independent order form.
  - Picks items; they go into a floating, per-page cart (in-memory, cleared when leaving the page; cannot mix across orders).
  - Clicks “Go to payment”; navigates to `IndependentOrderConfirmation` with the ephemeral cart via navigation state.
  - Checkout uses the threshold-aware endpoint and includes community context.
- **Weekly checkout**
  - Unchanged; still uses the existing global cart and Bit payment.
- **Threshold outcome**
  - Backend confirms or cancels after deadline based on community totals. Frontend displays progress (amount vs minimum, countdown).

### Communities identity
- `communities/{communityId}`: `name`, `region`, `aliases[]`, `createdAt`, `createdBy`.
- Registration uses a searchable dropdown over `communities`; if no match, creation happens via backend (to prevent typos and enforce rules).
- Users store `communityId` and denormalized `communityName`.

### My Volunteer Spots (new)
- Route: `/my-volunteer-spots`.
- Lists volunteer spots created by the logged-in user (from `volunteers`), hydrates related `IndependentOrders`.
- Actions: copy share message, view order; optional edit of instructions via backend.

### Out of scope (frontend)
- Refund/void handling and final threshold decision logic (handled in backend).
- Admin tooling beyond farmer dashboard basics.
- Community moderation workflows (merge, rename) handled offline/admin tools. 