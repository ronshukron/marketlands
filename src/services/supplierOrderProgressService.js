import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const PROGRESS_COLLECTION = 'supplierOrderProgress';
const OVERRIDES_COLLECTION = 'procurementOverrides';

export const getSafeDocId = (businessId, businessName) => {
  const sanitize = (value) => String(value || '')
    .replace(/[/\\#?[\]]+/g, '-')
    .trim()
    .slice(0, 120) || 'unknown';
  if (businessId && !/[/\\#?[\]]/.test(String(businessId))) return String(businessId);
  return sanitize(businessName);
};

export const buildProgressDocId = (weekKey, deliveryDate, businessId, businessName) => (
  `${weekKey}__${deliveryDate}__${getSafeDocId(businessId, businessName)}`
);

const progressRef = ({ weekKey, deliveryDate, businessId, businessName }) => (
  doc(db, PROGRESS_COLLECTION, buildProgressDocId(weekKey, deliveryDate, businessId, businessName))
);

const createBatchId = () => `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export async function fetchProgressForBusinesses(weekKey, deliveryDate, businesses = []) {
  if (!weekKey || !deliveryDate || businesses.length === 0) return {};
  const entries = await Promise.all(businesses.map(async ({ businessId, businessName }) => {
    const snap = await getDoc(progressRef({ weekKey, deliveryDate, businessId, businessName }));
    return [businessId, snap.exists() ? snap.data() : null];
  }));
  return Object.fromEntries(entries.filter(([, data]) => data));
}

export async function fetchSupplierOrderProgress(scope) {
  const snap = await getDoc(progressRef(scope));
  return snap.exists() ? snap.data() : null;
}

// scope: { weekKey, deliveryDate, businessId, businessName }
// batch: { supplierLabel, note, lines, textSnapshot, createdBy }
export async function appendSupplierOrderBatch(scope, batch) {
  const ref = progressRef(scope);
  const now = new Date().toISOString();
  const newBatch = {
    id: createBatchId(),
    createdAt: now,
    createdBy: batch.createdBy || null,
    supplierLabel: batch.supplierLabel || '',
    note: batch.note || '',
    lines: batch.lines || {},
    textSnapshot: batch.textSnapshot || '',
  };
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const existing = snap.exists() ? snap.data() : {};
    const next = {
      weekKey: scope.weekKey,
      deliveryDate: scope.deliveryDate,
      businessId: scope.businessId || '',
      businessName: scope.businessName || '',
      batches: [...(existing.batches || []), newBatch],
      createdAt: existing.createdAt || now,
      updatedAt: now,
    };
    transaction.set(ref, next);
    return next;
  });
}

export async function removeSupplierOrderBatch(scope, batchId) {
  const ref = progressRef(scope);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return null;
    const existing = snap.data();
    const next = {
      ...existing,
      batches: (existing.batches || []).filter((batch) => batch.id !== batchId),
      updatedAt: new Date().toISOString(),
    };
    transaction.set(ref, next);
    return next;
  });
}

export async function fetchProcurementOverrides(weekKeys = []) {
  const uniqueKeys = Array.from(new Set(weekKeys.filter(Boolean)));
  const snaps = await Promise.all(uniqueKeys.map((weekKey) => getDoc(doc(db, OVERRIDES_COLLECTION, weekKey))));
  return snaps.flatMap((snap, index) => (
    snap.exists()
      ? (snap.data().overrides || []).map((entry) => ({ ...entry, weekKey: uniqueKeys[index] }))
      : []
  ));
}

const updateOverrides = (weekKey, mutate) => {
  const ref = doc(db, OVERRIDES_COLLECTION, weekKey);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const current = snap.exists() ? (snap.data().overrides || []) : [];
    const overrides = mutate(current);
    transaction.set(ref, { weekKey, overrides, updatedAt: new Date().toISOString() });
    return overrides;
  });
};

const isSameOverride = (entry, community, originalDeliveryDate) => (
  entry.community === community && entry.originalDeliveryDate === originalDeliveryDate
);

export function setProcurementOverride(weekKey, { community, originalDeliveryDate, procureOnDate, setBy = null }) {
  return updateOverrides(weekKey, (current) => [
    ...current.filter((entry) => !isSameOverride(entry, community, originalDeliveryDate)),
    {
      community,
      originalDeliveryDate,
      procureOnDate,
      setAt: new Date().toISOString(),
      setBy,
    },
  ]);
}

export function clearProcurementOverride(weekKey, { community, originalDeliveryDate }) {
  return updateOverrides(weekKey, (current) => (
    current.filter((entry) => !isSameOverride(entry, community, originalDeliveryDate))
  ));
}
