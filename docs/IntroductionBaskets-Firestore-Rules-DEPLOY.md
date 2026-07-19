# Introduction Baskets — Firestore deploy notes

This project manages Firestore rules through the Firebase Console (there is no
`firestore.rules` in the repo). To enable the Introduction Baskets feature you
must publish the rules and create one composite index.

## 1. Publish security rules

Add the block from `IntroductionBaskets-Firestore-Rules.snippet.txt` inside
`match /databases/{database}/documents { ... }` in the Firebase Console,
**immediately before** the final catch-all deny
(`match /{document=**} { allow read, write: if false; }`).

Important:

- The project already defines `isAdmin()` at the top of the rules (a UID
  allowlist). The snippet reuses it; do NOT redefine it.
- The rule is intentionally minimal: only "is this an admin?" for writes, plus
  public read of `active` baskets for the anonymous storefront. Document shape
  and bounds are validated client-side in `validatePreparedBasket`
  (`src/services/introductionBasketService.js`), so heavy in-rule field
  validation was omitted on purpose.

Publish, wait ~1 minute, then reload `/admin/introduction-baskets` and the
community store.

Note: without this block, every read of `introductionBaskets` falls through to
the catch-all deny and fails with `Missing or insufficient permissions`, even
for admins.

## 2. Create the composite index

The storefront query filters on equality + array membership:

```js
query(
  collection(db, 'introductionBaskets'),
  where('active', '==', true),
  where('communities', 'array-contains', communityName)
)
```

This requires a composite index. Create it in the Console
(Firestore → Indexes → Composite → Add), or add the following to
`firestore.indexes.json` if/when the project adopts CLI index management:

```json
{
  "indexes": [
    {
      "collectionGroup": "introductionBaskets",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "active", "order": "ASCENDING" },
        { "fieldPath": "communities", "arrayConfig": "CONTAINS" }
      ]
    }
  ]
}
```

Tip: the first time the query runs without the index, the Firestore error in the
browser console includes a direct link to auto-create the exact index.

## 3. Security summary

- Writes require the project's existing `isAdmin()` UID allowlist, so only
  trusted admins can create/update/delete baskets.
- Public read is limited to `active == true`; admins can read all.
- Document shape/bounds and component availability across communities are
  enforced client-side before write (`validatePreparedBasket` and
  `IntroductionBasketAdmin.handleSave`). This is sufficient here because the
  write surface is admin-only; add in-rule field validation later only if
  non-admin write paths are ever introduced.
