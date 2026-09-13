# Community discount progress — Firestore notes

This repository does not contain a complete `firestore.rules` file. The store
and community hub read weekly community totals from
`communityDiscountProgress/{community}__{weekKey}`.

Signed-in shoppers (not only admins) need `get` on that exact document. Guests
do not: the compact widget asks them to log in and no longer opens a progress
listener.

## What to add

Merge `Community-Discount-Progress-Firestore-Rules.snippet.txt` into the existing
`match /databases/{database}/documents` block. Reuse the project's canonical
`isAdmin()` / `isAuthenticated()` helpers if they already exist.

Do not replace the production ruleset with this snippet. Keep writes denied for
browsers; Cloud Functions / Admin SDK should continue to publish `total` and
`orderCount`.

## After deploy

A signed-in non-admin customer on the weekly store should no longer see
`Missing or insufficient permissions` for `communityDiscountProgress`.
