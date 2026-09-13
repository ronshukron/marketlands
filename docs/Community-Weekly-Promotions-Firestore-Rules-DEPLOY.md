# Deploying the community weekly promotion rules

The rules snippet is a prototype for review and merging; it is not a complete
`firestore.rules` file. This frontend repository's `firebase.json` currently configures
Hosting only. Do not add Firestore configuration to it merely to deploy this feature,
and do not deploy the snippet as a replacement for the project's existing rules.

## Before merging

1. Locate the canonical Firestore Rules file in the infrastructure/backend repository
   for project `auth-development-323c3`.
2. Confirm the selected database is the intended Standard-edition native-mode database.
3. Confirm the production admin custom claim. The prototype accepts `admin == true` or
   `role == "admin"`; narrow this to the project's one canonical server-issued claim.
4. Verify that active promotion documents and unlock documents contain only the
   public-safe fields in the contract. Firestore cannot hide individual fields in a
   readable document.
5. Merge the helper functions and `match` blocks from
   `Community-Weekly-Promotions-Firestore-Rules.snippet.txt` inside the existing
   `match /databases/{database}/documents` block. Resolve helper and path collisions.
6. Keep the existing catch-all default deny. Never replace the full ruleset with this
   snippet.
7. Deploy the composite index in this repository's `firestore.indexes.json` from the
   canonical Firebase project configuration, or create the equivalent index in the
   Firebase console. Do not modify this frontend's `firebase.json`.

The Admin SDK in Cloud Functions bypasses Security Rules. Endpoint authorization,
payload validation, state transitions, token hashing, rate limiting, and transaction
integrity therefore require separate backend tests; Rules do not enforce them.

## Emulator test matrix

Merge the snippet into the canonical complete rules file and add emulator tests for all
of these cases:

| Actor/action | Expected |
| --- | --- |
| Unauthenticated `get` of currently active, in-window promotion | allow |
| Unauthenticated constrained active query for one targeted community | allow |
| Query missing status, start/end, community, order, or bounded limit | deny |
| Unauthenticated read of draft, scheduled, expired, or archived promotion | deny |
| Admin read of any promotion and stats | allow |
| Non-admin read of stats | deny |
| Public `get` of a valid unlock tied to an active targeted promotion | allow |
| Public list/query of unlocks | deny |
| Admin list/query of unlocks | allow |
| Unlock for wrong community, missing promotion, or inactive promotion | deny |
| Any browser create/update/delete on every feature collection | deny |
| Any browser read of token or event collection, including admin | deny |
| Promotion with an extra field, oversized field, invalid type, or bad time range | not publicly readable |

Also test that an active-promotion query succeeds with the deployed composite index.
Rules are not filters: a query that could return a forbidden document is rejected in
full.

Typical commands in the canonical Firebase-configured repository are:

```powershell
npx -y firebase-tools@latest emulators:exec --only firestore "npm test -- --runInBand path/to/rules-tests"
npx -y firebase-tools@latest deploy --only firestore:indexes --project auth-development-323c3
npx -y firebase-tools@latest deploy --only firestore:rules --project auth-development-323c3
```

Use the project's actual test command and project alias. Review the generated diff and
the Firebase CLI project selection immediately before deployment. Deploy indexes first
and wait until the index reports `Enabled` before relying on the public query.

## Post-deploy checks

- In a signed-out browser, verify one active promotion and its exact deterministic
  unlock document can be read.
- Verify draft and stats reads fail signed out and succeed for a real admin.
- Verify direct SDK writes and token/event reads fail even for an admin.
- Exercise each HTTP endpoint and confirm it still writes through the Admin SDK.
- Confirm raw share tokens do not appear in Firestore, logs, analytics, errors, or
  network responses other than the token-creation response.
- Monitor `PERMISSION_DENIED`, index errors, endpoint `401/403/409/429`, and event/stats
  transaction failures during rollout.

I've set up prototype Security Rules to keep the data in Firestore safe. They are
designed to be secure for public, time-bounded promotion reads, exact unlock reads,
admin-only draft/stat reads, and server-only writes. However, you should review and
verify them before broadly sharing your app. If you'd like, I can help you harden these
rules.
