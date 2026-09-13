# Community weekly promotions: backend contract

This document is the integration contract for the frontend service in
`src/services/communityWeeklyPromotionService.js`. The Cloud Functions repository is not
part of this project, so every HTTP endpoint below must be implemented there before the
corresponding write flow is enabled.

## Security boundary

- Firestore is Standard edition in native mode.
- Browsers may directly read only an active promotion and its deterministic community
  unlock document. Authenticated admins may also read drafts, archives, and aggregate
  stats.
- Browsers never directly create, update, or delete promotions, unlocks, share tokens,
  events, or stats. All such writes go through the HTTP endpoints below.
- Functions verify Firebase ID tokens and use the Admin SDK, which bypasses Firestore
  Security Rules. Admin endpoints additionally require an `admin: true` custom claim or
  an equivalent server-owned admin claim.
- A share token is an opaque, cryptographically random value with at least 128 bits of
  entropy. Store only its SHA-256 hash. Never put a token in logs, event documents, stats,
  analytics labels, or error messages.
- Functions must set an explicit CORS allowlist, accept `POST` and `OPTIONS` only, cap
  request bodies, and return `Cache-Control: no-store` when a response contains a token.

Optional client auth is sent as `Authorization: Bearer <Firebase ID token>`. Admin
endpoints require it. Public visit/unlock/pricing endpoints accept it when present, but
must not trust user IDs supplied in JSON.

All responses use JSON. Errors have this shape:

```json
{
  "error": {
    "code": "invalid-argument",
    "message": "A safe message for the client",
    "details": {}
  }
}
```

Recommended statuses are `400` invalid input, `401` missing/invalid token, `403` not
authorized, `404` absent or deliberately undisclosed resource, `409` invalid state or
idempotency conflict, `429` rate limited, and `500` unexpected failure.

## Firestore model

### `communityWeeklyPromotions/{promotionId}`

Required fields:

| Field | Type | Constraints |
| --- | --- | --- |
| `title` | string | 1–200 characters |
| `weekKey` | string | `YYYY-MM-DD` |
| `status` | string | `draft`, `scheduled`, `active`, or `archived` |
| `startsAt`, `endsAt` | timestamp | `startsAt < endsAt` |
| `targetCommunities` | list | 1–100 snapshots `{code, name}`; no private coordinator data |
| `targetCommunityCodes` | list | 1–100 unique strings; denormalized query field |
| `productSnapshots` | list | 1–250 immutable-at-publish product/price snapshots |
| `shareConfig` | map | `{enabled, headline, message}` |
| `schemaVersion` | integer | 1–100 |
| `pricingVersion` | string | 1–100 characters |
| `createdAt`, `updatedAt` | timestamp | server timestamps |

Each product snapshot contains `productId`, `businessId`, `name`, `regularPrice`, and
`promotionPrice`; optional display-only fields include `catalogNumber`, `imageUrl`,
`measurementType`, `unit`, and `maxQuantity`. Prices are finite, non-negative, and
`promotionPrice` must be strictly below `regularPrice`. Published product snapshots,
`schemaVersion`, and `pricingVersion` are the source of truth used by checkout
validation; current catalog prices are not.

Optional public-safe lifecycle fields are `publishedAt`, `archivedAt`, and
`duplicatedFromPromotionId`. Do not store actor UIDs, share tokens, token hashes, event
details, customer identity, or private admin notes in this public-readable document.
Store actor UIDs and privileged audit details in a separate server-only audit collection.

State transitions:

```text
draft     -> draft | scheduled | active | archived
scheduled -> draft | scheduled | active | archived
active    -> active | archived
archived  -> archived
```

Publishing sets `scheduled` when `startsAt` is in the future and `active` otherwise.
A scheduled activation job changes `scheduled -> active` at `startsAt`; an expiry job
changes `active -> archived` at/after `endsAt`. An archived promotion is terminal.
Only draft/scheduled display fields may be edited freely. An active promotion may only
receive an explicitly allowlisted operational patch and cannot change product pricing,
targets, time range, schema version, or pricing version.

### `communityWeeklyPromotionUnlocks/{promotionIdEncoded}__{communityCodeEncoded}`

The ID is deterministic: JavaScript `encodeURIComponent(promotionId) + "__" +
encodeURIComponent(communityCode)`.

Required fields are `promotionId`, `communityCode`, `unlocked` (boolean),
`confirmedAt` (timestamp), `pricingVersion`, `schemaVersion`, and `updatedAt`. Optional
public-safe fields are `unlockedAt`, `threshold`, and aggregate `confirmedCount`.
Never store a UID, email, phone number, address, share token, token hash, or IP in this
public-readable document. Any abuse-control identity belongs in a private server-only
collection.

### Private collections

- `communityWeeklyPromotionShareTokens/{tokenHash}`: `promotionId`, optional
  `communityCode`, `source`, `campaign`, `createdAt`, `createdBy`, `expiresAt`,
  `revokedAt`, `maxUses`, and `useCount`. The document ID is lowercase SHA-256 hex.
- `communityWeeklyPromotionEvents/{eventId}`: append-only normalized events. Store
  `promotionId`, optional `communityCode`, `type`, `occurredAt`, `visitKeyHash`, safe
  attribution, and server-derived actor UID when needed. Do not store the raw visit key
  or share token.
- `communityWeeklyPromotionStats/{promotionId}`: server-maintained aggregate counters
  such as `visits`, `uniqueVisits`, `unlockConfirmations`, `pricingValidations`,
  `pricingFailures`, optional bounded `byCommunity`, and `updatedAt`.

Use a transaction or idempotency document keyed by a hash of `(event type, promotion,
visitKey)` so retries do not increment events or stats twice. Configure a retention/TTL
policy for raw event and token records as required by the business.

## Direct read contracts

`getActivePromotionForCommunity(communityCode)` performs the constrained query:

```text
status == "active"
targetCommunityCodes array-contains communityCode
startsAt <= now
endsAt > now
orderBy startsAt desc
orderBy endsAt asc
limit 1
```

The composite index is declared in `firestore.indexes.json`. A caller then reads the
unlock with its deterministic ID. `listPromotions`, `getPromotion`, and
`getPromotionStats` are admin read paths; Security Rules must verify an immutable admin
custom claim for non-active promotions and stats.

`loadEligibleWeeklyProducts()` reads `businesses`, excludes accounts recognized by
`isIndependentBusinessAccount`, and queries `Products` with `Owner_ID == business.id`.
The endpoint still re-loads and validates every selected business/product when creating
or updating a promotion; frontend filtering is not authorization.

## HTTP endpoints

Every successful mutation response includes the final server-normalized document, not
the untrusted request object.

### `createCommunityWeeklyPromotion` — admin

Request:

```json
{ "promotion": { "title": "...", "weekKey": "2026-08-23", "status": "draft", "startsAt": "timestamp-compatible value", "endsAt": "timestamp-compatible value", "targetCommunities": [], "targetCommunityCodes": [], "productSnapshots": [], "shareConfig": {}, "schemaVersion": 1, "pricingVersion": "..." } }
```

Response `201`:

```json
{ "promotion": { "id": "promotionId", "status": "draft" } }
```

The server accepts initial `draft` only, validates all fields, revalidates products and
business eligibility, converts dates to Firestore timestamps, and writes actor identity
to a separate server-only audit trail.

### `updateCommunityWeeklyPromotion` — admin

Request:

```json
{ "promotionId": "promotionId", "patch": { "title": "New title" } }
```

Response `200`:

```json
{ "promotion": { "id": "promotionId", "status": "draft" } }
```

Reject unknown fields. Read the existing document in a transaction, enforce the state
machine and full post-update schema, and never accept audit/lifecycle fields from JSON.
Write actor identity to the separate private audit trail.

### `publishCommunityWeeklyPromotion` — admin

Request:

```json
{ "promotionId": "promotionId" }
```

Response `200`:

```json
{ "promotion": { "id": "promotionId", "status": "active" }, "unlockDocumentIds": ["promotionId__community"] }
```

Revalidate the complete promotion and current product ownership. Atomically set the
lifecycle fields and create one default unlock document per target community. Repeated
calls return the already published result without duplicating documents.

### `archiveCommunityWeeklyPromotion` — admin

Request:

```json
{ "promotionId": "promotionId" }
```

Response `200`:

```json
{ "promotion": { "id": "promotionId", "status": "archived" } }
```

Archiving is idempotent and terminal. Existing tokens become unusable immediately even
if their token records have not yet been updated.

### `duplicateCommunityWeeklyPromotion` — admin

Request:

```json
{ "promotionId": "sourcePromotionId", "overrides": { "title": "Copy", "weekKey": "2026-08-30", "startsAt": "...", "endsAt": "..." } }
```

Response `201`:

```json
{ "promotion": { "id": "newPromotionId", "status": "draft", "duplicatedFromPromotionId": "sourcePromotionId" } }
```

Only allowlisted content/scheduling overrides are accepted. The copy is always a new
draft with new audit fields and no tokens, events, stats, or unlock state.

### `createCommunityWeeklyPromotionShareToken` — admin

Request:

```json
{ "promotionId": "promotionId", "communityCode": "north", "source": "whatsapp", "campaign": "week-35", "expiresAt": "optional timestamp-compatible value" }
```

Response `201` with `Cache-Control: no-store`:

```json
{ "token": "opaque-one-time-return-value", "promotionId": "promotionId", "communityCode": "north", "expiresAt": "...", "urlParams": { "promo": "opaque-one-time-return-value", "community": "north", "src": "whatsapp", "campaign": "week-35" } }
```

Validate that the optional community is targeted. Generate the token server-side, store
only its hash, and return the raw value only in this response.

### `confirmCommunityWeeklyPromotionUnlock` — public, optional auth

Request:

```json
{ "promo": "opaqueShareToken", "promotionId": "optionalClaimedId", "communityCode": "north", "visitKey": "clientIdempotencyKey" }
```

Response `200`:

```json
{ "promotionId": "promotionId", "communityCode": "north", "unlock": { "unlocked": true, "confirmedCount": 1, "pricingVersion": "..." }, "alreadyProcessed": false }
```

Resolve the token by hash; do not trust the claimed promotion. Require an active,
unexpired, targeted promotion and a non-revoked token. Rate limit, hash the visit key,
and atomically update the deterministic unlock, event, token usage, and stats.

### `recordCommunityWeeklyPromotionVisit` — public, optional auth

Request:

```json
{ "promo": "opaqueShareToken", "promotionId": "optionalClaimedId", "communityCode": "north", "source": "whatsapp", "campaign": "week-35", "visitKey": "clientIdempotencyKey", "occurredAt": "optional client ISO timestamp" }
```

Response `200`:

```json
{ "accepted": true, "promotionId": "promotionId", "alreadyProcessed": false }
```

Resolve and validate the token when `promo` is supplied. Without one, resolve the
claimed active promotion and targeted community. Use server time for enforcement;
`occurredAt` is diagnostic only. Normalize attribution to bounded strings and dedupe by
the hashed visit key.

### `validateCommunityWeeklyCartPricing` — public, optional auth

Request:

```json
{ "promotionId": "promotionId", "communityCode": "north", "pricingVersion": "version", "items": [{ "productId": "productId", "businessId": "businessId", "quantity": 2, "unitPrice": 9 }] }
```

Response `200` when valid:

```json
{ "valid": true, "promotionId": "promotionId", "communityCode": "north", "pricingVersion": "version", "items": [{ "productId": "productId", "businessId": "businessId", "quantity": 2, "unitPrice": 9, "lineTotal": 18 }], "total": 18 }
```

Response `409` when stale/invalid:

```json
{ "error": { "code": "pricing-mismatch", "message": "Promotion pricing changed", "details": { "pricingVersion": "current-version", "invalidItems": [{ "productId": "productId", "reason": "unit-price-mismatch", "expectedUnitPrice": 9 }] } }
```

Require an active targeted promotion and an unlocked deterministic document. Validate
bounded positive quantities, exact product/business membership, pricing version, and
money in integer minor units server-side. Never trust a client total. Checkout/order
creation must perform the same validation in its own transaction; this preflight does
not reserve inventory or authorize payment. The payment functions `createBitPayment`,
`createGrowSuspendedPayment`, `createGrowPaymentLinkCheckout`, and delayed settlement
(`handleSuspendedPayment`) must re-fetch the promotion, unlock, and product snapshots,
recompute line totals, reject mismatches, and persist `pricingVersion`.

## Operational requirements

- Functions should use App Check where the deployed clients support it, plus per-IP and
  per-token rate limits for public endpoints.
- Scheduled activation/expiry must be safe to rerun and should query bounded batches.
- Alert on repeated pricing failures, invalid-token volume, event write errors, and stats
  transaction contention.
- Emulator/integration tests should cover unauthenticated admin denial, token hashing,
  state transitions, archive invalidation, replay/idempotency, cross-community access,
  malformed payloads, stale pricing, and transaction retries.
