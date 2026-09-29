# Farmer pasted orders — Firestore notes

This repository now includes a `firestore.rules` file. The live project
`auth-development-323c3` has `farmerPastedOrders/{orderId}` published.

## What was added

`farmerPastedOrders` and `farmerProductAliases` are owned by the signed-in business uid. Merge
`FarmerPastedOrders-Firestore-Rules.snippet.txt` only if you are editing the
console ruleset by hand instead of deploying `firestore.rules`.

Do not replace a production ruleset with the snippet alone.

## After deploy

A signed-in business account can create, list, update status, and delete only
documents whose `businessId` equals their Firebase uid.
