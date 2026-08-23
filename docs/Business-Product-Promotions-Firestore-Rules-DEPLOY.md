# Business product promotions — Firestore notes

This repository does not contain a complete `firestore.rules` file. Promotions
are stored on the existing `businesses/{uid}` document as `productPromotions`.

## What to add

If `match /businesses/{businessId}` already allows the signed-in owner to update
their own document, keep that rule and add the prototype field bound from
`Business-Product-Promotions-Firestore-Rules.snippet.txt`.

Do not overwrite the production businesses rule. The frontend validates
promotion shape, product ownership, pricing basis, and overlapping products
before write.

## Security boundary

Checkout totals remain client-computed, matching the current payment functions.
Authoritative anti-tampering requires backend repricing outside this frontend
repository.
