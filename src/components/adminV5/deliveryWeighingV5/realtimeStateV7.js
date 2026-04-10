import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../../../firebase/firebase';

const STATION_KEY = 'deliveryV7::stationId';
const CLAIM_STALE_MS = 2 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function parseIso(value) {
  const parsed = new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function getOrCreateStationIdV7() {
  try {
    const existing = localStorage.getItem(STATION_KEY);
    if (existing) return existing;
    const next = `station-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(STATION_KEY, next);
    return next;
  } catch (error) {
    return `station-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function buildSessionIdV7({ userId, stationId }) {
  return `${userId || 'guest'}::${stationId || 'station'}`;
}

function roomRef(weekKey) {
  return doc(db, 'deliveryRealtimeV7', weekKey);
}

function presenceCollectionRef(weekKey) {
  return collection(db, 'deliveryRealtimeV7', weekKey, 'presence');
}

function claimsCollectionRef(weekKey) {
  return collection(db, 'deliveryRealtimeV7', weekKey, 'claims');
}

function draftsCollectionRef(weekKey) {
  return collection(db, 'deliveryRealtimeV7', weekKey, 'drafts');
}

function presenceRef(weekKey, sessionId) {
  return doc(db, 'deliveryRealtimeV7', weekKey, 'presence', sessionId);
}

function claimRef(weekKey, orderId) {
  return doc(db, 'deliveryRealtimeV7', weekKey, 'claims', orderId);
}

function draftRef(weekKey, orderId) {
  return doc(db, 'deliveryRealtimeV7', weekKey, 'drafts', orderId);
}

export function isClaimStaleV7(claim) {
  const updatedAt = parseIso(claim?.updatedAtIso);
  return !updatedAt || (Date.now() - updatedAt > CLAIM_STALE_MS);
}

export async function upsertPresenceV7({
  weekKey,
  session,
  selectedOrderId = '',
}) {
  if (!weekKey || !session?.sessionId) return;

  const timestamp = nowIso();
  await setDoc(roomRef(weekKey), {
    weekKey,
    updatedAtIso: timestamp,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await setDoc(presenceRef(weekKey, session.sessionId), {
    sessionId: session.sessionId,
    userId: session.userId || null,
    userName: session.userName || '',
    stationId: session.stationId || '',
    selectedOrderId: selectedOrderId || '',
    updatedAtIso: timestamp,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function clearPresenceV7({ weekKey, session }) {
  if (!weekKey || !session?.sessionId) return;
  await deleteDoc(presenceRef(weekKey, session.sessionId));
}

export function subscribePresenceV7({ weekKey, onData, onError }) {
  if (!weekKey) return () => {};
  return onSnapshot(
    presenceCollectionRef(weekKey),
    (snapshot) => {
      const rows = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      if (typeof onData === 'function') onData(rows);
    },
    onError,
  );
}

export function subscribeClaimsV7({ weekKey, onData, onError }) {
  if (!weekKey) return () => {};
  return onSnapshot(
    claimsCollectionRef(weekKey),
    (snapshot) => {
      const byOrderId = {};
      snapshot.docs.forEach((docSnap) => {
        byOrderId[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      if (typeof onData === 'function') onData(byOrderId);
    },
    onError,
  );
}

export function subscribeDraftsV7({ weekKey, onData, onError }) {
  if (!weekKey) return () => {};
  return onSnapshot(
    draftsCollectionRef(weekKey),
    (snapshot) => {
      const byOrderId = {};
      snapshot.docs.forEach((docSnap) => {
        byOrderId[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      if (typeof onData === 'function') onData(byOrderId);
    },
    onError,
  );
}

export async function claimOrderV7({
  weekKey,
  orderId,
  session,
  force = false,
}) {
  if (!weekKey || !orderId || !session?.sessionId) return { ok: false };

  return runTransaction(db, async (transaction) => {
    const ref = claimRef(weekKey, orderId);
    const snap = await transaction.get(ref);
    const existing = snap.exists() ? snap.data() : null;

    if (
      existing
      && existing.sessionId !== session.sessionId
      && !isClaimStaleV7(existing)
      && !force
    ) {
      const err = new Error('Order is already claimed by another station.');
      err.code = 'already-claimed';
      throw err;
    }

    const payload = {
      orderId,
      sessionId: session.sessionId,
      userId: session.userId || null,
      userName: session.userName || '',
      stationId: session.stationId || '',
      updatedAtIso: nowIso(),
      updatedAt: serverTimestamp(),
      claimedAtIso: existing?.claimedAtIso || nowIso(),
    };

    transaction.set(ref, payload, { merge: true });
    return payload;
  });
}

export async function releaseOrderClaimV7({
  weekKey,
  orderId,
  session,
}) {
  if (!weekKey || !orderId || !session?.sessionId) return;
  const ref = claimRef(weekKey, orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() || {};
  if (data.sessionId && data.sessionId !== session.sessionId && !isClaimStaleV7(data)) {
    return;
  }

  await deleteDoc(ref);
}

// Status-only draft updater for top-level scalar fields (status, updatedBy, etc.).
// Do NOT pass weightsByLineId or removedLineIds here — those are shared maps that
// require merge-inside-transaction semantics to be multi-station safe. Use instead:
//   setDraftLineWeightV7   — single line weight
//   clearDraftLineWeightV7 — reset one line's weight
//   bulkSetDraftWeightsV7  — overwrite many lines (merges with server state)
//   setDraftLineRemovedV7  — toggle a line's removed flag
export async function saveOrderDraftV7({
  weekKey,
  orderId,
  draftPatch,
  session,
}) {
  if (!weekKey || !orderId) return;

  const patch = draftPatch || {};
  if (Object.prototype.hasOwnProperty.call(patch, 'weightsByLineId')) {
    throw new Error(
      'saveOrderDraftV7 must not be used for weightsByLineId. Use setDraftLineWeightV7, clearDraftLineWeightV7, or bulkSetDraftWeightsV7.',
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'removedLineIds')) {
    throw new Error(
      'saveOrderDraftV7 must not be used for removedLineIds. Use setDraftLineRemovedV7.',
    );
  }

  const ref = draftRef(weekKey, orderId);
  await runTransaction(db, async (transaction) => {
    const existingSnap = await transaction.get(ref);
    const existing = existingSnap.exists() ? (existingSnap.data() || {}) : {};
    const next = {
      ...existing,
      orderId,
      ...patch,
      updatedAtIso: nowIso(),
      updatedAt: serverTimestamp(),
      updatedBySessionId: session?.sessionId || '',
      updatedByName: session?.userName || '',
      updatedByStationId: session?.stationId || '',
    };
    transaction.set(ref, next);
  });
}

export async function bulkSetDraftWeightsV7({
  weekKey,
  orderId,
  weightsByLineId: incoming,
  status,
  session,
}) {
  if (!weekKey || !orderId) return;
  const ref = draftRef(weekKey, orderId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const existing = snap.exists() ? (snap.data() || {}) : {};
    const merged = { ...(existing.weightsByLineId || {}), ...(incoming || {}) };
    const next = {
      ...existing,
      orderId,
      weightsByLineId: merged,
      updatedAtIso: nowIso(),
      updatedAt: serverTimestamp(),
      updatedBySessionId: session?.sessionId || '',
      updatedByName: session?.userName || '',
      updatedByStationId: session?.stationId || '',
    };
    if (status) next.status = status;
    transaction.set(ref, next);
  });
}

export async function setDraftLineWeightV7({
  weekKey,
  orderId,
  lineId,
  actualQuantity,
  source,
  status,
  session,
}) {
  if (!weekKey || !orderId || !lineId) return;
  const ref = draftRef(weekKey, orderId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const existing = snap.exists() ? (snap.data() || {}) : {};
    const weightsByLineId = { ...(existing.weightsByLineId || {}) };
    weightsByLineId[lineId] = { actualQuantity, source };
    const next = {
      ...existing,
      orderId,
      weightsByLineId,
      updatedAtIso: nowIso(),
      updatedAt: serverTimestamp(),
      updatedBySessionId: session?.sessionId || '',
      updatedByName: session?.userName || '',
      updatedByStationId: session?.stationId || '',
    };
    if (status) next.status = status;
    transaction.set(ref, next);
  });
}

export async function clearDraftLineWeightV7({
  weekKey,
  orderId,
  lineId,
  status,
  session,
}) {
  if (!weekKey || !orderId || !lineId) return;
  const ref = draftRef(weekKey, orderId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const existing = snap.exists() ? (snap.data() || {}) : {};
    const weightsByLineId = { ...(existing.weightsByLineId || {}) };
    weightsByLineId[lineId] = { actualQuantity: null, source: 'manual' };
    const next = {
      ...existing,
      orderId,
      weightsByLineId,
      updatedAtIso: nowIso(),
      updatedAt: serverTimestamp(),
      updatedBySessionId: session?.sessionId || '',
      updatedByName: session?.userName || '',
      updatedByStationId: session?.stationId || '',
    };
    if (status) next.status = status;
    transaction.set(ref, next);
  });
}

export async function setDraftLineRemovedV7({
  weekKey,
  orderId,
  lineId,
  removed,
  session,
}) {
  if (!weekKey || !orderId || !lineId) return;
  const ref = draftRef(weekKey, orderId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const existing = snap.exists() ? (snap.data() || {}) : {};
    const removedLineIds = { ...(existing.removedLineIds || {}) };
    if (removed) {
      removedLineIds[lineId] = true;
    } else {
      delete removedLineIds[lineId];
    }
    const next = {
      ...existing,
      orderId,
      removedLineIds,
      updatedAtIso: nowIso(),
      updatedAt: serverTimestamp(),
      updatedBySessionId: session?.sessionId || '',
      updatedByName: session?.userName || '',
      updatedByStationId: session?.stationId || '',
    };
    transaction.set(ref, next);
  });
}

export async function clearOrderDraftV7({ weekKey, orderId }) {
  if (!weekKey || !orderId) return;
  await deleteDoc(draftRef(weekKey, orderId));
}
