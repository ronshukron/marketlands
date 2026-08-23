import {
  addDoc,
  collection,
  doc,
  getDocs,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { getEstimatedChargeableQuantity, getEstimatedLineTotal } from '../utils/pricing';
import { sha256Hex } from '../utils/sha256';
import { ensureLineIdsInBreakdown } from '../components/adminV5/deliveryWeighingV5/v7/orderDraftUtils';

export const COMPENSATION_RECIPIENTS_COLLECTION = 'compensationRecipients';
export const COMPENSATION_STATUSES = {
  ACTIVE: 'active',
  REDEEMED: 'redeemed',
  REVOKED: 'revoked',
};

export const MAX_COMPENSATION_REASON_LENGTH = 500;
export const MAX_COMPENSATION_QUANTITY = 100;

const VALID_MEASUREMENT_TYPES = ['kg', 'unit', 'package'];

const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nowIso = () => new Date().toISOString();

export function normalizePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('972') && digits.length >= 11) {
    digits = `0${digits.slice(3)}`;
  }
  return digits;
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function buildIdentityRecord({ uid, phone, email } = {}, type, value, hashFn = sha256Hex) {
  return {
    type,
    key: type === 'uid' ? `uid_${value}` : `${type}_${hashFn(value)}`,
    userId: String(uid || '').trim(),
    phone: normalizePhone(phone),
    email: normalizeEmail(email),
  };
}

export function resolveRecipientIdentity(fields = {}, hashFn = sha256Hex) {
  const userId = String(fields.uid || fields.userId || '').trim();
  if (userId) return buildIdentityRecord(fields, 'uid', userId, hashFn);

  const phone = normalizePhone(fields.phone);
  if (phone) return buildIdentityRecord(fields, 'phone', phone, hashFn);

  const email = normalizeEmail(fields.email);
  if (email) return buildIdentityRecord(fields, 'email', email, hashFn);

  return null;
}

export function resolveRecipientIdentities(fields = {}, hashFn = sha256Hex) {
  const identities = [];
  const seen = new Set();
  const userId = String(fields.uid || fields.userId || '').trim();
  const phone = normalizePhone(fields.phone);
  const email = normalizeEmail(fields.email);

  const push = (identity) => {
    if (!identity || seen.has(identity.key)) return;
    seen.add(identity.key);
    identities.push(identity);
  };

  if (userId) push(buildIdentityRecord(fields, 'uid', userId, hashFn));
  if (phone) push(buildIdentityRecord(fields, 'phone', phone, hashFn));
  if (email) push(buildIdentityRecord(fields, 'email', email, hashFn));
  return identities;
}

export function normalizeProductSnapshot(line = {}, quantityOverride) {
  const rawMeasurementType = line.measurementType || 'kg';
  const measurementType = VALID_MEASUREMENT_TYPES.includes(rawMeasurementType)
    ? rawMeasurementType
    : 'kg';
  const defaultQuantity = measurementType === 'kg' ? safeNumber(line.unitSize, 1) : 1;
  const rawQuantity = quantityOverride ?? line.quantity ?? defaultQuantity;
  const quantity = safeNumber(rawQuantity, 0);
  const price = Math.max(0, safeNumber(line.price ?? line.priceSnapshot, 0));

  return {
    productId: line.productId || line.id || '',
    productName: line.productName || line.name || '',
    orderId: line.orderId || '',
    businessId: line.businessId || '',
    businessName: line.businessName || '',
    selectedOption: line.selectedOption || '',
    quantity,
    price,
    priceSnapshot: price,
    images: Array.isArray(line.images) ? line.images.filter(Boolean).slice(0, 5) : [],
    catalogNumber: line.catalogNumber || '',
    vatType: line.vatType ?? 3,
    measurementType,
    unitSize: safeNumber(line.unitSize, 1),
    averageWeightKg: safeNumber(line.averageWeightKg, 1),
  };
}

export function computeOriginalValue(snapshot = {}) {
  return getEstimatedLineTotal({
    measurementType: snapshot.measurementType || 'kg',
    quantity: safeNumber(snapshot.quantity, 0),
    price: safeNumber(snapshot.price ?? snapshot.priceSnapshot, 0),
    averageWeightKg: safeNumber(snapshot.averageWeightKg, 1),
  });
}

export function validateCompensationAssignment({ snapshot, quantity, reason } = {}) {
  if (!snapshot?.productId) throw new Error('PRODUCT_REQUIRED');
  if (!(safeNumber(quantity, 0) > 0)) throw new Error('QUANTITY_INVALID');
  if (safeNumber(quantity, 0) > MAX_COMPENSATION_QUANTITY) throw new Error('QUANTITY_TOO_LARGE');
  if ((reason || '').length > MAX_COMPENSATION_REASON_LENGTH) throw new Error('REASON_TOO_LONG');
}

export function normalizeCompensationGrant(docSnapOrData, fallbackIdentityKey = '') {
  const data = docSnapOrData?.data ? docSnapOrData.data() : (docSnapOrData || {});
  const snapshot = normalizeProductSnapshot(data.productSnapshot || {}, data.quantity);
  return {
    id: docSnapOrData?.id || data.id || '',
    identityKey: data.identityKey || fallbackIdentityKey,
    status: data.status || COMPENSATION_STATUSES.ACTIVE,
    quantity: snapshot.quantity,
    originalPrice: safeNumber(data.originalPrice ?? snapshot.price, 0),
    originalValue: safeNumber(data.originalValue, computeOriginalValue(snapshot)),
    reason: data.reason || '',
    productSnapshot: snapshot,
    assignedBy: data.assignedBy || '',
    assignedByName: data.assignedByName || '',
    assignedAt: data.assignedAt || null,
    redeemedAt: data.redeemedAt || null,
    redeemedOrderId: data.redeemedOrderId || '',
    redeemedOrderCollection: data.redeemedOrderCollection || '',
    redeemedByIdentity: data.redeemedByIdentity || '',
    revokedAt: data.revokedAt || null,
    revokedBy: data.revokedBy || '',
    restoredAt: data.restoredAt || null,
    restoredBy: data.restoredBy || '',
  };
}

export function buildCompensationOrderLine(grant) {
  const snapshot = grant.productSnapshot || {};
  const quantity = safeNumber(grant.quantity ?? snapshot.quantity, 0);
  const chargeable = getEstimatedChargeableQuantity({
    ...snapshot,
    quantity,
  });

  return {
    productId: snapshot.productId || '',
    productName: snapshot.productName || '',
    quantity,
    estimatedChargeQuantity: chargeable,
    estimatedLineTotal: 0,
    price: 0,
    basePrice: 0,
    effectivePrice: 0,
    originalPrice: safeNumber(grant.originalPrice ?? snapshot.price, 0),
    selectedOption: snapshot.selectedOption || 'None',
    catalogNumber: snapshot.catalogNumber || '',
    vatType: snapshot.vatType ?? 3,
    isShipping: false,
    isCompensation: true,
    compensationId: grant.id || '',
    compensationIdentityKey: grant.identityKey || '',
    measurementType: snapshot.measurementType || 'kg',
    unitSize: snapshot.unitSize || 1,
    averageWeightKg: snapshot.averageWeightKg || 1,
  };
}

export function injectCompensationLines(orderBreakdown = {}, grants = []) {
  const next = {};
  Object.entries(orderBreakdown || {}).forEach(([key, group]) => {
    next[key] = {
      ...(group || {}),
      items: Array.isArray(group?.items) ? [...group.items] : [],
    };
  });

  const compensationItems = [];
  const extraBusinessIds = [];

  grants.forEach((grant) => {
    if (!grant || grant.status !== COMPENSATION_STATUSES.ACTIVE) return;
    const snapshot = grant.productSnapshot || {};
    const line = buildCompensationOrderLine(grant);
    const groupKey = snapshot.orderId || `compensation:${grant.id}`;
    if (!next[groupKey]) {
      next[groupKey] = {
        businessId: snapshot.businessId || '',
        businessName: snapshot.businessName || 'פיצוי',
        subTotal: 0,
        items: [],
      };
    }
    next[groupKey].items.push(line);
    if (snapshot.businessId && !extraBusinessIds.includes(snapshot.businessId)) {
      extraBusinessIds.push(snapshot.businessId);
    }
    compensationItems.push({
      compensationId: grant.id,
      identityKey: grant.identityKey || '',
      productId: snapshot.productId || '',
      productName: snapshot.productName || '',
      quantity: line.quantity,
      originalPrice: line.originalPrice,
      originalValue: safeNumber(grant.originalValue, computeOriginalValue(snapshot)),
    });
  });

  return { breakdown: next, compensationItems, extraBusinessIds };
}

export function mergeBusinessIds(existing = [], extra = []) {
  return [...new Set([...(existing || []), ...(extra || [])].filter(Boolean))];
}

function recipientDocRef(identityKey) {
  return doc(db, COMPENSATION_RECIPIENTS_COLLECTION, identityKey);
}

function itemsCollectionRef(identityKey) {
  return collection(db, COMPENSATION_RECIPIENTS_COLLECTION, identityKey, 'items');
}

function itemDocRef(identityKey, itemId) {
  return doc(db, COMPENSATION_RECIPIENTS_COLLECTION, identityKey, 'items', itemId);
}

export async function assignCompensation({
  uid,
  phone,
  email,
  displayName = '',
  product,
  quantity,
  reason = '',
  assignedBy = '',
  assignedByName = '',
} = {}) {
  const identity = resolveRecipientIdentity({ uid, phone, email });
  if (!identity) throw new Error('IDENTITY_REQUIRED');

  const snapshot = normalizeProductSnapshot(product, quantity);
  validateCompensationAssignment({ snapshot, quantity: snapshot.quantity, reason });

  const assignedAt = nowIso();
  await setDoc(recipientDocRef(identity.key), {
    identityType: identity.type,
    userId: identity.userId,
    phone: identity.phone,
    email: identity.email,
    displayName: displayName || '',
    updatedAt: assignedAt,
    createdAt: assignedAt,
  }, { merge: true });

  const payload = {
    identityKey: identity.key,
    status: COMPENSATION_STATUSES.ACTIVE,
    quantity: snapshot.quantity,
    originalPrice: snapshot.price,
    originalValue: computeOriginalValue(snapshot),
    reason: String(reason || '').trim(),
    productSnapshot: snapshot,
    assignedBy,
    assignedByName,
    assignedAt,
    redeemedAt: null,
    redeemedOrderId: '',
    redeemedOrderCollection: '',
    redeemedByIdentity: '',
    revokedAt: null,
    revokedBy: '',
    restoredAt: null,
    restoredBy: '',
  };

  const created = await addDoc(itemsCollectionRef(identity.key), payload);
  return normalizeCompensationGrant({ id: created.id, data: () => payload }, identity.key);
}

export async function listCompensationsForIdentity(fields) {
  const identities = resolveRecipientIdentities(fields);
  const grants = [];
  await Promise.all(identities.map(async (identity) => {
    const snap = await getDocs(itemsCollectionRef(identity.key));
    snap.docs.forEach((itemDoc) => {
      grants.push(normalizeCompensationGrant(itemDoc, identity.key));
    });
  }));
  return grants.sort((a, b) => String(b.assignedAt || '').localeCompare(String(a.assignedAt || '')));
}

export async function listActiveCompensationsForIdentity(fields) {
  const grants = await listCompensationsForIdentity(fields);
  return grants.filter((grant) => grant.status === COMPENSATION_STATUSES.ACTIVE);
}

export async function revokeCompensation(identityKey, itemId, revokedBy = '') {
  if (!identityKey || !itemId) throw new Error('GRANT_REQUIRED');
  await runTransaction(db, async (transaction) => {
    const ref = itemDocRef(identityKey, itemId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('GRANT_NOT_FOUND');
    if (snap.data().status !== COMPENSATION_STATUSES.ACTIVE) throw new Error('GRANT_NOT_ACTIVE');
    transaction.update(ref, {
      status: COMPENSATION_STATUSES.REVOKED,
      revokedAt: nowIso(),
      revokedBy,
    });
  });
}

export async function restoreCompensation(identityKey, itemId, restoredBy = '') {
  if (!identityKey || !itemId) throw new Error('GRANT_REQUIRED');
  await runTransaction(db, async (transaction) => {
    const ref = itemDocRef(identityKey, itemId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('GRANT_NOT_FOUND');
    const data = snap.data() || {};
    if (data.status === COMPENSATION_STATUSES.ACTIVE) return;
    transaction.update(ref, {
      status: COMPENSATION_STATUSES.ACTIVE,
      redeemedAt: null,
      redeemedOrderId: '',
      redeemedOrderCollection: '',
      redeemedByIdentity: '',
      revokedAt: null,
      revokedBy: '',
      restoredAt: nowIso(),
      restoredBy,
    });
  });
}

export function buildRedeemedOrderPayload(orderData, orderId, grants) {
  const { breakdown, compensationItems, extraBusinessIds } = injectCompensationLines(
    orderData.orderBreakdown || {},
    grants
  );
  const persisted = ensureLineIdsInBreakdown(orderId, breakdown).breakdown;
  return {
    orderData: {
      ...orderData,
      orderBreakdown: persisted,
      businessIds: mergeBusinessIds(orderData.businessIds, extraBusinessIds),
      ...(compensationItems.length > 0 ? {
        compensationItems,
        compensationClaimedAt: nowIso(),
      } : {}),
    },
    compensationItems,
  };
}

export async function persistCustomerOrderWithCompensation({
  collectionName,
  orderRef,
  orderId,
  orderData,
  identity,
  merge = false,
} = {}) {
  if (!orderRef || !orderId || !orderData) {
    throw new Error('ORDER_REQUIRED');
  }

  const identities = resolveRecipientIdentities(identity || {});
  const writeOrder = async (payload) => {
    if (merge) {
      await setDoc(orderRef, payload, { merge: true });
      return;
    }
    await setDoc(orderRef, payload);
  };

  if (identities.length === 0) {
    await writeOrder(orderData);
    return { claimed: [], compensationItems: [] };
  }

  let candidateGrants = [];
  try {
    candidateGrants = await listActiveCompensationsForIdentity(identity);
  } catch (error) {
    console.error('Failed to load compensation grants; saving order without claim', error);
    await writeOrder(orderData);
    return { claimed: [], compensationItems: [] };
  }
  if (candidateGrants.length === 0) {
    await writeOrder(orderData);
    return { claimed: [], compensationItems: [] };
  }

  const claimed = [];
  let compensationItems = [];

  try {
  await runTransaction(db, async (transaction) => {
    const snapshots = [];
    for (const grant of candidateGrants) {
      const ref = itemDocRef(grant.identityKey, grant.id);
      // Reads must stay before writes.
      // eslint-disable-next-line no-await-in-loop
      const snap = await transaction.get(ref);
      snapshots.push({ grant, ref, snap });
    }

    const stillActive = snapshots
      .filter(({ snap }) => snap.exists() && snap.data()?.status === COMPENSATION_STATUSES.ACTIVE)
      .map(({ grant, ref }) => ({ ...grant, ref }));

    const built = buildRedeemedOrderPayload(orderData, orderId, stillActive);
    compensationItems = built.compensationItems;
    transaction.set(orderRef, built.orderData, merge ? { merge: true } : {});

    stillActive.forEach((grant) => {
      transaction.update(grant.ref, {
        status: COMPENSATION_STATUSES.REDEEMED,
        redeemedAt: nowIso(),
        redeemedOrderId: orderId,
        redeemedOrderCollection: collectionName || '',
        redeemedByIdentity: grant.identityKey,
      });
      claimed.push(grant);
    });
  });
  } catch (error) {
    console.error('Failed to claim compensation; saving order without claim', error);
    await writeOrder(orderData);
    return { claimed: [], compensationItems: [] };
  }

  return { claimed, compensationItems };
}
