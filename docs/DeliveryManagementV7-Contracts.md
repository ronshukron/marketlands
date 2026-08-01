# Delivery Management V7 — Immutable Contracts and Station Attribution

## Immutable compatibility contracts

Station attribution must not change these V7 behaviors:

- Firestore paths remain `deliveryRealtimeV7/{weekKey}` with the existing `presence`, `claims`, and `drafts` subcollections.
- Station identity reuses the existing `deliveryV7::stationId` localStorage value; no replacement station key is introduced.
- Session identity remains `${userId || "guest"}::${stationId || "station"}`.
- Existing localStorage keys and the offline operation/cache format remain unchanged.
- Claim acquisition, stale-claim timing, release behavior, settlement ordering, navigation, and stable line-ID construction remain unchanged.
- Attribution fields are optional and additive. Readers must continue to accept orders and drafts that do not contain them.

## Additive attribution fields

A changed realtime weight may include:

```text
weightsByLineId[lineId].audit = {
  stationId,
  sessionId,
  userId,
  userName,
  updatedAtIso
}
```

The settlement request may include:

```text
weighingAudit = {
  stationId,
  sessionId,
  userId,
  userName,
  updatedAtIso,
  finalizedAtIso,
  source: "delivery-v7"
}
```

Final invoice lines may include the same optional `audit` object. A line keeps its own edit attribution when available; otherwise it receives the finalizing station attribution. These fields contain operational identity only; payment-provider tokens and secrets must never be included.

Backend compatibility is required for durable attribution: `handleSuspendedPayment` must accept optional `weighingAudit`, preserve optional line `audit` fields, and persist them under the finalized order's `weighing` data. An older backend may ignore the additive fields without changing settlement totals or Grow invoice fields, but attribution will not survive a reload.

## Prototype Firestore rules — documentation only, not deployed

This prototype assumes the production ruleset already defines a robust `isAdmin()` function. It must be reviewed against deployed rules and authenticated admin claims before use.

A paste-ready copy lives in `docs/DeliveryRealtimeV7-Firestore-Rules.snippet.txt` and is clearly labeled prototype-only.

```text
match /deliveryRealtimeV7/{weekKey} {
  allow read, write: if isAdmin();

  match /presence/{sessionId} {
    allow read, write: if isAdmin();
  }

  match /claims/{orderId} {
    allow read, write: if isAdmin();
  }

  match /drafts/{orderId} {
    allow read, write: if isAdmin();
  }
}
```

This prototype does not change collection paths or claim semantics and is not a deployment instruction.
