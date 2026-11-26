import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { estimateRecurringLine, getQuantityDiscount } from '../utils/recurringBasket';
import {
  listIntroductionBasketProductCandidates,
  normalizeComponentLine,
  MAX_BASKET_COMMUNITIES,
  MAX_BASKET_COMPONENT_LINES,
  MAX_BASKET_DESCRIPTION_LENGTH,
  MAX_BASKET_IMAGE_LENGTH,
  MAX_BASKET_TITLE_LENGTH,
  VALID_BASKET_MEASUREMENT_TYPES,
} from './introductionBasketService';

export const SUBSCRIPTION_BASKETS_COLLECTION = 'subscriptionBaskets';

// Flip together with GROW_TOKEN_ENV=secure in the functions once Grow approves
// production. Until then the token page is Grow sandbox and only testers see baskets.
export const SUBSCRIPTIONS_OPEN_TO_ALL = true;
const SUBSCRIPTION_TESTER_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2', 'Q0bohhVCdmeMhgBbDknvLxbEzW53'];

export const canSeeSubscriptionBaskets = (user) => (
  SUBSCRIPTIONS_OPEN_TO_ALL || Boolean(user && SUBSCRIPTION_TESTER_UIDS.includes(user.uid))
);
export const DEFAULT_OPEN_LEAD_HOURS = 96;
export const MAX_OPEN_LEAD_HOURS = 24 * 14;

const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * A basket line plus the product's quantity discount, which subscription
 * orders apply (unlike introduction baskets, which share normalizeComponentLine).
 * @param {Object} line
 * @return {Object}
 */
export const normalizeSubscriptionBasketLine = (line = {}) => {
  const normalized = normalizeComponentLine(line);
  const discount = getQuantityDiscount({ ...line, price: normalized.price });
  return {
    ...normalized,
    quantityDiscountThreshold: discount ? discount.threshold : null,
    quantityDiscountPrice: discount ? discount.price : null,
    quantityDiscountLabel: discount ? String(line.quantityDiscountLabel || '').trim() : '',
  };
};

/** Rough cost of the basket at the saved prices, after quantity discounts. */
export const getSubscriptionBasketSubtotal = (componentLines = []) => (
  componentLines.reduce((sum, line) => sum + estimateRecurringLine(line, line.quantity, line.measurementType), 0)
);

export const normalizeOpenLeadHours = (value) => {
  const hours = Math.round(safeNumber(value, DEFAULT_OPEN_LEAD_HOURS));
  if (hours < 1) return DEFAULT_OPEN_LEAD_HOURS;
  return Math.min(hours, MAX_OPEN_LEAD_HOURS);
};

const normalizeBasketDoc = (basketDoc) => {
  const data = basketDoc.data ? basketDoc.data() : basketDoc;
  const componentLines = Array.isArray(data.componentLines)
    ? data.componentLines.map(normalizeSubscriptionBasketLine).filter((line) => line.productId && line.orderId)
    : [];
  return {
    id: basketDoc.id || data.id || '',
    title: data.title || '',
    description: data.description || '',
    image: data.image || '',
    active: data.active !== false,
    sortOrder: safeNumber(data.sortOrder, 0),
    communities: Array.isArray(data.communities) ? data.communities.filter(Boolean) : [],
    openLeadHours: normalizeOpenLeadHours(data.openLeadHours),
    componentLines,
    componentSubtotal: getSubscriptionBasketSubtotal(componentLines),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || '',
  };
};

const prepareBasketPayload = (payload = {}, updatedBy = '') => {
  const componentLines = Array.isArray(payload.componentLines)
    ? payload.componentLines.map(normalizeSubscriptionBasketLine).filter((line) => line.productId && line.orderId)
    : [];
  return {
    title: String(payload.title || '').trim(),
    description: String(payload.description || '').trim(),
    image: String(payload.image || '').trim(),
    active: payload.active !== false,
    sortOrder: safeNumber(payload.sortOrder, 0),
    communities: Array.isArray(payload.communities)
      ? [...new Set(payload.communities.map((name) => String(name || '').trim()).filter(Boolean))]
      : [],
    openLeadHours: normalizeOpenLeadHours(payload.openLeadHours),
    componentLines,
    componentSubtotal: getSubscriptionBasketSubtotal(componentLines),
    updatedAt: serverTimestamp(),
    updatedBy,
  };
};

export function validatePreparedSubscriptionBasket(prepared = {}) {
  if (!prepared.title) throw new Error('TITLE_REQUIRED');
  if (prepared.title.length > MAX_BASKET_TITLE_LENGTH) throw new Error('TITLE_TOO_LONG');
  if ((prepared.description || '').length > MAX_BASKET_DESCRIPTION_LENGTH) throw new Error('DESCRIPTION_TOO_LONG');
  if ((prepared.image || '').length > MAX_BASKET_IMAGE_LENGTH) throw new Error('IMAGE_TOO_LONG');
  if (!Array.isArray(prepared.communities) || prepared.communities.length === 0) {
    throw new Error('COMMUNITIES_REQUIRED');
  }
  if (prepared.communities.length > MAX_BASKET_COMMUNITIES) throw new Error('TOO_MANY_COMMUNITIES');
  // An empty basket is allowed: customers build their own on the signup page.
  if (!Array.isArray(prepared.componentLines)) throw new Error('COMPONENTS_REQUIRED');
  if (prepared.componentLines.length > MAX_BASKET_COMPONENT_LINES) throw new Error('TOO_MANY_COMPONENTS');
  prepared.componentLines.forEach((line) => {
    if (!line.productId || !line.orderId || !line.businessId) throw new Error('COMPONENT_REFERENCE_INVALID');
    if (!(safeNumber(line.quantity, 0) > 0)) throw new Error('COMPONENT_QUANTITY_INVALID');
    if (!VALID_BASKET_MEASUREMENT_TYPES.includes(line.measurementType)) throw new Error('COMPONENT_MEASUREMENT_INVALID');
  });
}

export async function listSubscriptionBaskets() {
  const snap = await getDocs(collection(db, SUBSCRIPTION_BASKETS_COLLECTION));
  return snap.docs
    .map(normalizeBasketDoc)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.title.localeCompare(b.title, 'he'));
}

export async function listActiveSubscriptionBasketsForCommunity(communityName) {
  if (!communityName) return [];
  const snap = await getDocs(query(
    collection(db, SUBSCRIPTION_BASKETS_COLLECTION),
    where('active', '==', true),
    where('communities', 'array-contains', communityName),
  ));
  return snap.docs
    .map(normalizeBasketDoc)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.title.localeCompare(b.title, 'he'));
}

export async function getSubscriptionBasket(basketId) {
  if (!basketId) return null;
  try {
    const snap = await getDoc(doc(db, SUBSCRIPTION_BASKETS_COLLECTION, basketId));
    return snap.exists() ? normalizeBasketDoc(snap) : null;
  } catch (error) {
    if (error?.code === 'permission-denied') return null;
    throw error;
  }
}

export async function saveSubscriptionBasket(basketId, payload, updatedBy = '') {
  const prepared = prepareBasketPayload(payload, updatedBy);
  validatePreparedSubscriptionBasket(prepared);
  if (basketId) {
    await setDoc(doc(db, SUBSCRIPTION_BASKETS_COLLECTION, basketId), prepared, { merge: true });
    return basketId;
  }
  const created = await addDoc(collection(db, SUBSCRIPTION_BASKETS_COLLECTION), {
    ...prepared,
    createdAt: serverTimestamp(),
  });
  return created.id;
}

export async function deleteSubscriptionBasket(basketId) {
  if (!basketId) return;
  await deleteDoc(doc(db, SUBSCRIPTION_BASKETS_COLLECTION, basketId));
}

/** Community names that have an active delivery schedule (subscriptions need fixed delivery dates). */
export async function listCommunitiesWithDeliverySchedule() {
  const snap = await getDocs(collection(db, 'deliverySchedules'));
  return new Set(
    snap.docs
      .filter((scheduleDoc) => (scheduleDoc.data() || {}).active !== false)
      .map((scheduleDoc) => scheduleDoc.id),
  );
}

export const listSubscriptionBasketProductCandidates = () => (
  listIntroductionBasketProductCandidates({ includeQuantityDiscount: true })
);

/**
 * The line with today's price and quantity discount from the product list,
 * when the product is still offered through the same farmer form.
 * @param {Object} line
 * @param {Array<Object>} candidates listSubscriptionBasketProductCandidates()
 * @return {Object}
 */
export const refreshBasketLinePrice = (line, candidates = []) => {
  const current = candidates.find((candidate) => (
    candidate.productId === line.productId && candidate.orderId === line.orderId
  ));
  if (!current) return line;
  return {
    ...line,
    price: current.price,
    priceSnapshot: current.price,
    quantityDiscountThreshold: current.quantityDiscountThreshold ?? null,
    quantityDiscountPrice: current.quantityDiscountPrice ?? null,
    quantityDiscountLabel: current.quantityDiscountLabel || '',
  };
};
