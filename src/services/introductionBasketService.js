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
import { getEstimatedLineTotal } from '../utils/pricing';
import { isAlwaysOnGroceryOrder, isAlwaysOnGroceryOrderEnabled } from '../utils/deliveryScheduleUtils';
import { getEndingTimeForSpot, isOrderActiveNow } from '../utils/orderUtils';

export const INTRODUCTION_BASKETS_COLLECTION = 'introductionBaskets';
export const INTRODUCTION_BASKET_ADJUSTMENT_PREFIX = 'intro-basket-adjustment';
export const INTRODUCTION_BASKET_CATALOG_NUMBER =
  process.env.REACT_APP_INTRODUCTION_BASKET_CATALOG_NUMBER || '999004';

const PRODUCT_QUERY_CHUNK_SIZE = 10;

// Validation bounds. These are kept in sync with the Firestore security rules
// in docs/IntroductionBaskets-Firestore-Rules.snippet.txt so a client-side save
// never produces a document the rules would reject.
export const VALID_BASKET_MEASUREMENT_TYPES = ['kg', 'unit', 'package'];
export const MAX_BASKET_TITLE_LENGTH = 120;
export const MAX_BASKET_DESCRIPTION_LENGTH = 2000;
export const MAX_BASKET_IMAGE_LENGTH = 2000;
export const MAX_BASKET_COMMUNITIES = 100;
export const MAX_BASKET_COMPONENT_LINES = 50;

const safeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeComponentLine = (line = {}) => {
  const rawMeasurementType = line.measurementType || 'kg';
  const measurementType = VALID_BASKET_MEASUREMENT_TYPES.includes(rawMeasurementType)
    ? rawMeasurementType
    : 'kg';
  const rawQuantity = safeNumber(line.quantity, measurementType === 'kg' ? safeNumber(line.unitSize, 1) : 1);
  const quantity = rawQuantity > 0 ? rawQuantity : 0;
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
    images: Array.isArray(line.images) ? line.images.filter(Boolean) : [],
    stockAmount: safeNumber(line.stockAmount, 0),
    catalogNumber: line.catalogNumber || '',
    vatType: line.vatType ?? 3,
    measurementType,
    unitSize: safeNumber(line.unitSize, 1),
    averageWeightKg: safeNumber(line.averageWeightKg, 1),
    minimumOrderAmount: safeNumber(line.minimumOrderAmount, 0),
    pickupSpots: Array.isArray(line.pickupSpots) ? line.pickupSpots.filter(Boolean) : [],
    orderType: line.orderType || '',
    orderMode: line.orderMode || '',
  };
};

export const getIntroductionBasketComponentSubtotal = (componentLines = []) => (
  componentLines.reduce((sum, line) => sum + getEstimatedLineTotal({
    measurementType: line.measurementType || 'kg',
    quantity: safeNumber(line.quantity, 0),
    price: safeNumber(line.price ?? line.priceSnapshot, 0),
    averageWeightKg: safeNumber(line.averageWeightKg, 1),
  }), 0)
);

const normalizeBasketDoc = (basketDoc) => {
  const data = basketDoc.data ? basketDoc.data() : basketDoc;
  const componentLines = Array.isArray(data.componentLines)
    ? data.componentLines.map(normalizeComponentLine).filter((line) => line.productId && line.orderId)
    : [];

  return {
    id: basketDoc.id || data.id || '',
    title: data.title || '',
    description: data.description || '',
    image: data.image || '',
    active: data.active !== false,
    sortOrder: safeNumber(data.sortOrder, 0),
    communities: Array.isArray(data.communities) ? data.communities.filter(Boolean) : [],
    displayPrice: safeNumber(data.displayPrice, 0),
    componentLines,
    componentSubtotal: getIntroductionBasketComponentSubtotal(componentLines),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || '',
  };
};

const prepareBasketPayload = (payload = {}, updatedBy = '') => {
  const componentLines = Array.isArray(payload.componentLines)
    ? payload.componentLines.map(normalizeComponentLine).filter((line) => line.productId && line.orderId)
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
    displayPrice: safeNumber(payload.displayPrice, 0),
    componentLines,
    componentSubtotal: getIntroductionBasketComponentSubtotal(componentLines),
    updatedAt: serverTimestamp(),
    updatedBy,
  };
};

// Throws a stable error code when a prepared payload violates the basket
// contract. Mirrors the Firestore rules so invalid data fails fast on the client.
export function validatePreparedBasket(prepared = {}) {
  if (!prepared.title || prepared.title.length === 0) throw new Error('TITLE_REQUIRED');
  if (prepared.title.length > MAX_BASKET_TITLE_LENGTH) throw new Error('TITLE_TOO_LONG');
  if ((prepared.description || '').length > MAX_BASKET_DESCRIPTION_LENGTH) throw new Error('DESCRIPTION_TOO_LONG');
  if ((prepared.image || '').length > MAX_BASKET_IMAGE_LENGTH) throw new Error('IMAGE_TOO_LONG');

  if (!Array.isArray(prepared.communities) || prepared.communities.length === 0) {
    throw new Error('COMMUNITIES_REQUIRED');
  }
  if (prepared.communities.length > MAX_BASKET_COMMUNITIES) throw new Error('TOO_MANY_COMMUNITIES');

  if (!Number.isFinite(prepared.displayPrice) || prepared.displayPrice < 0) {
    throw new Error('DISPLAY_PRICE_INVALID');
  }

  if (!Array.isArray(prepared.componentLines) || prepared.componentLines.length === 0) {
    throw new Error('COMPONENTS_REQUIRED');
  }
  if (prepared.componentLines.length > MAX_BASKET_COMPONENT_LINES) throw new Error('TOO_MANY_COMPONENTS');

  prepared.componentLines.forEach((line) => {
    if (!line.productId || !line.orderId || !line.businessId) throw new Error('COMPONENT_REFERENCE_INVALID');
    if (!(safeNumber(line.quantity, 0) > 0)) throw new Error('COMPONENT_QUANTITY_INVALID');
    if (safeNumber(line.price, 0) < 0) throw new Error('COMPONENT_PRICE_INVALID');
    if (!VALID_BASKET_MEASUREMENT_TYPES.includes(line.measurementType)) throw new Error('COMPONENT_MEASUREMENT_INVALID');
  });
}

export async function listIntroductionBaskets() {
  const snap = await getDocs(collection(db, INTRODUCTION_BASKETS_COLLECTION));
  return snap.docs
    .map(normalizeBasketDoc)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.title.localeCompare(b.title, 'he'));
}

export async function listActiveIntroductionBasketsForCommunity(communityName) {
  if (!communityName) return [];
  const basketsQuery = query(
    collection(db, INTRODUCTION_BASKETS_COLLECTION),
    where('active', '==', true),
    where('communities', 'array-contains', communityName)
  );
  const snap = await getDocs(basketsQuery);
  return snap.docs
    .map(normalizeBasketDoc)
    .filter((basket) => basket.componentLines.length > 0)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.title.localeCompare(b.title, 'he'));
}

export async function saveIntroductionBasket(basketId, payload, updatedBy = '') {
  const basketsRef = collection(db, INTRODUCTION_BASKETS_COLLECTION);
  const prepared = prepareBasketPayload(payload, updatedBy);

  validatePreparedBasket(prepared);

  if (basketId) {
    await setDoc(doc(db, INTRODUCTION_BASKETS_COLLECTION, basketId), prepared, { merge: true });
    return basketId;
  }

  const created = await addDoc(basketsRef, {
    ...prepared,
    createdAt: serverTimestamp(),
  });
  return created.id;
}

export async function deleteIntroductionBasket(basketId) {
  if (!basketId) return;
  await deleteDoc(doc(db, INTRODUCTION_BASKETS_COLLECTION, basketId));
}

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isOrderCurrentlyActive = (orderData = {}) => {
  if (orderData.archived === true) return false;
  if (isAlwaysOnGroceryOrder(orderData)) return isAlwaysOnGroceryOrderEnabled(orderData);

  const endingTimeByPickupSpot = orderData.endingTimeByPickupSpot || {};
  const pickupSpots = Array.isArray(orderData.pickupSpots) ? orderData.pickupSpots : [];
  const nowWithBuffer = new Date(Date.now() + 60 * 60 * 1000);

  if (Object.keys(endingTimeByPickupSpot).length > 0) {
    return pickupSpots.some((spot) => {
      const endingTime = getEndingTimeForSpot(orderData, spot);
      return endingTime && endingTime > nowWithBuffer;
    });
  }

  const endingTime = toDate(orderData.endingTime || orderData.Ending_Time);
  if (endingTime) return endingTime > nowWithBuffer;

  if (orderData.schedule) return isOrderActiveNow(orderData.schedule);
  return orderData.orderType === 'recurring';
};

export async function listIntroductionBasketProductCandidates() {
  const ordersSnap = await getDocs(collection(db, 'Orders'));
  const activeOrders = ordersSnap.docs
    .map((orderDoc) => ({ id: orderDoc.id, data: orderDoc.data() || {} }))
    .filter(({ data }) => data.businessId && Array.isArray(data.selectedProducts) && isOrderCurrentlyActive(data));

  const businessIds = [...new Set(activeOrders.map(({ data }) => data.businessId).filter(Boolean))];
  const businessEntries = await Promise.all(
    businessIds.map(async (businessId) => {
      const snap = await getDoc(doc(db, 'businesses', businessId));
      return [businessId, snap.exists() ? snap.data() : {}];
    })
  );
  const businessById = Object.fromEntries(businessEntries);
  const candidates = [];

  for (const { id: orderId, data: orderData } of activeOrders) {
    const selectedProductIds = [...new Set(orderData.selectedProducts.filter(Boolean))];
    for (let i = 0; i < selectedProductIds.length; i += PRODUCT_QUERY_CHUNK_SIZE) {
      const chunk = selectedProductIds.slice(i, i + PRODUCT_QUERY_CHUNK_SIZE);
      // eslint-disable-next-line no-await-in-loop
      const productsSnap = await getDocs(query(
        collection(db, 'Products'),
        where('Owner_ID', '==', orderData.businessId),
        where('__name__', 'in', chunk)
      ));

      productsSnap.docs.forEach((productDoc) => {
        const product = productDoc.data() || {};
        const business = businessById[orderData.businessId] || {};
        const measurementType = product.measurementType || 'kg';
        candidates.push(normalizeComponentLine({
          productId: productDoc.id,
          productName: product.name || '',
          orderId,
          businessId: orderData.businessId,
          businessName: business.businessName || orderData.businessName || '',
          selectedOption: Array.isArray(product.options) && product.options.length > 0 ? product.options[0] : '',
          quantity: measurementType === 'kg' ? safeNumber(product.unitSize, 1) : 1,
          price: safeNumber(product.price, 0),
          images: product.images || [],
          stockAmount: product.stockAmount,
          catalogNumber: product.catalogNumber,
          vatType: product.vatType ?? 3,
          measurementType,
          unitSize: safeNumber(product.unitSize, 1),
          averageWeightKg: safeNumber(product.averageWeightKg, 1),
          minimumOrderAmount: safeNumber(orderData.minimumOrderAmount, 0),
          pickupSpots: Array.isArray(orderData.pickupSpots) ? orderData.pickupSpots : [],
          orderType: isAlwaysOnGroceryOrder(orderData) ? 'always_on_grocery' : (orderData.orderType || ''),
          orderMode: orderData.orderMode || '',
        }));
      });
    }
  }

  return candidates.sort((a, b) => (
    a.productName.localeCompare(b.productName, 'he')
    || a.businessName.localeCompare(b.businessName, 'he')
  ));
}
