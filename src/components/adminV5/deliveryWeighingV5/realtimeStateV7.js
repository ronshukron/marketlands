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

export async function saveOrderDraftV7({
  weekKey,
  orderId,
  draftPatch,
  session,
}) {
  if (!weekKey || !orderId) return;

  await setDoc(draftRef(weekKey, orderId), {
    orderId,
    ...(draftPatch || {}),
    updatedAtIso: nowIso(),
    updatedAt: serverTimestamp(),
    updatedBySessionId: session?.sessionId || '',
    updatedByName: session?.userName || '',
    updatedByStationId: session?.stationId || '',
  }, { merge: true });
}

export async function clearOrderDraftV7({ weekKey, orderId }) {
  if (!weekKey || !orderId) return;
  await deleteDoc(draftRef(weekKey, orderId));
}
