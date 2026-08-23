# Compensation entitlements — Firestore deploy notes

This project manages Firestore rules through the Firebase Console (there is no
`firestore.rules` in the repo). Publish the snippet before assigning live
compensation items.

## 1. Publish security rules

Add the short block from `Compensations-Firestore-Rules.snippet.txt` inside
`match /databases/{database}/documents { ... }` in the Firebase Console,
immediately before the final catch-all deny.

Remove the long compensation helper functions if you already added them
(`isValidCompensationRedemption`, `isValidCompensationGrantCreate`, etc.).
The snippet reuses the existing `isAdmin()` helper. Do not redefine it.

I've set up prototype Security Rules to keep the data in Firestore safe. They
are designed to be secure for admin-only assignment and a tightly constrained
one-time redemption write. However, you should review and verify them before
broadly sharing your app. Guest phone/email matching cannot prove ownership
without a backend.

## 2. No extra composite index

Checkout and admin screens load `compensationRecipients/{identityKey}/items`
without a `where` + `orderBy` pair, so no composite index is required.
