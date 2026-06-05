import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { MARKETPLACE_PRODUCTS_COLLECTION } from '../constants/marketplaceProducts';
import { auth, db } from '../firebase/firebase';
import { functionsEndpoint } from '../utils/functionsClient';
import { getSellerAccountProfile } from '../utils/sellerAccount';
import {
  cleanShortDescription,
  extractStoreContentFields,
  normalizeWhatsappContacts,
} from '../constants/marketplaceStoreContent';
import {
  isCommunityServed,
  normalizeStoreFulfillment,
  preparePromotionFulfillmentForSave,
  promotionToCustomerFulfillment,
} from '../constants/marketplaceFulfillment';
import {
  normalizeMarketplaceGlobalSettings,
  normalizeStorePaymentLinks,
} from '../constants/marketplacePaymentLinks';
import {
  getApprovedMarketplaceProductsForBusiness,
  getMarketplaceProductsByIds,
  getMarketplaceProductApprovalStatus,
  getStoreCatalogProductsForBusiness,
  isMarketplaceProductApproved,
} from './marketplaceProductService';
import {
  getProductStockLimit,
  isMarketplaceProductInStock,
} from '../utils/marketplaceProductStock';

export {
  getMarketplaceProductApprovalStatus as getProductApprovalStatus,
  isMarketplaceProductApproved as isProductApproved,
};

export const MARKETPLACE_COLLECTIONS = {
  stores: 'marketplaceStores',
  promotions: 'marketplacePromotions',
  orders: 'marketplaceOrders',
  settings: 'marketplaceSettings',
  futureVolunteers: 'marketplacePromotionVolunteers',
};

/** Set REACT_APP_MARKETPLACE_CLOUD_FUNCTIONS=true after deploying HTTPS functions with CORS. */
const useMarketplaceCloudFunctions =
  process.env.REACT_APP_MARKETPLACE_CLOUD_FUNCTIONS === 'true';

/** Must match Firebase Auth token email for Firestore read rules. */
export const resolveOrderCustomerEmail = (customer = {}) => {
  const authEmail = auth.currentUser?.email?.trim();
  if (authEmail) return authEmail;
  return String(customer.email || '').trim().toLowerCase();
};

export const MARKETPLACE_FUNCTIONS = {
  createStore: functionsEndpoint('createMarketplaceStore'),
  updateStore: functionsEndpoint('updateMarketplaceStore'),
  createPromotion: functionsEndpoint('createMarketplacePromotion'),
  updatePromotion: functionsEndpoint('updateMarketplacePromotion'),
  placeManualOrder: functionsEndpoint('placeMarketplaceManualOrder'),
  placeStoreCartOrder: functionsEndpoint('placeMarketplaceStoreCartOrder'),
  notifyNewOrder: functionsEndpoint('notifyMarketplaceNewOrder'),
  notifyOrderCompleted: functionsEndpoint('notifyMarketplaceOrderCompleted'),
  createPaymentIntent: functionsEndpoint('createMarketplacePaymentIntent'),
};

export const DEFAULT_MANUAL_PAYMENT_METHODS = ['bit', 'cash', 'paybox', 'bank_transfer'];

export const PAYMENT_METHOD_LABELS = {
  bit: 'Bit',
  cash: 'מזומן',
  paybox: 'PayBox',
  bank_transfer: 'העברה בנקאית',
  other: 'אחר',
};

const cleanObject = (value) => {
  if (Array.isArray(value)) {
    return value.map(cleanObject).filter((item) => item !== undefined);
  }

  if (!value || typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  if (typeof value.toDate === 'function') {
    return value;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }

  return Object.entries(value).reduce((acc, [key, entry]) => {
    if (entry !== undefined) {
      acc[key] = cleanObject(entry);
    }
    return acc;
  }, {});
};

export const normalizeList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

export const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

const toTimestamp = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  return Timestamp.fromDate(new Date(value));
};

const mapDoc = (docSnap) => ({
  id: docSnap.id,
  ...docSnap.data(),
});

const isActiveInDateWindow = (item, now = new Date()) => {
  const startsAt = toDate(item.startsAt);
  const endsAt = toDate(item.endsAt);

  if (startsAt && startsAt > now) return false;
  if (endsAt && endsAt < now) return false;
  return true;
};

export const matchesCommunityScope = (item, communityName, mode = 'own') => {
  if (!communityName || mode === 'all') return true;
  return isCommunityServed(normalizeStoreFulfillment(item), communityName);
};

export const matchesPromotionCommunityScope = (promotion, communityName, mode = 'own') => {
  if (!communityName || mode === 'all') return true;
  return isCommunityServed(promotionToCustomerFulfillment(promotion), communityName);
};

export const getBusinessProfile = async (businessId) => {
  return getSellerAccountProfile(businessId);
};

export const getMarketplaceStore = async (businessId) => {
  if (!businessId) return null;
  const snap = await getDoc(doc(db, MARKETPLACE_COLLECTIONS.stores, businessId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const getMarketplaceSettings = async () => {
  const snap = await getDoc(doc(db, MARKETPLACE_COLLECTIONS.settings, 'global'));
  const raw = snap.exists() ? snap.data() : {};
  return {
    ...normalizeMarketplaceGlobalSettings(raw),
    defaultPaymentMethods: DEFAULT_MANUAL_PAYMENT_METHODS,
  };
};

export const saveMarketplaceSettings = async (settings = {}) => {
  const payload = normalizeMarketplaceGlobalSettings(settings);
  await setDoc(doc(db, MARKETPLACE_COLLECTIONS.settings, 'global'), {
    ...payload,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return payload;
};

export const getMarketplaceStores = async ({ communityName = '', communityMode = 'own' } = {}) => {
  const storesQuery = query(
    collection(db, MARKETPLACE_COLLECTIONS.stores),
    where('visible', '==', true),
    where('status', '==', 'active')
  );
  const snap = await getDocs(storesQuery);

  return snap.docs
    .map(mapDoc)
    .filter((store) => matchesCommunityScope(store, communityName, communityMode))
    .sort((a, b) => (a.sortRank ?? 0) - (b.sortRank ?? 0));
};

export const getMarketplacePromotions = async ({
  communityName = '',
  communityMode = 'own',
  includeInactive = false,
} = {}) => {
  const promotionsQuery = includeInactive
    ? collection(db, MARKETPLACE_COLLECTIONS.promotions)
    : query(collection(db, MARKETPLACE_COLLECTIONS.promotions), where('status', '==', 'active'));

  const snap = await getDocs(promotionsQuery);
  const now = new Date();

  return snap.docs
    .map(mapDoc)
    .filter((promotion) => includeInactive || isActiveInDateWindow(promotion, now))
    .filter((promotion) => matchesPromotionCommunityScope(promotion, communityName, communityMode))
    .sort((a, b) => (a.sortRank ?? 0) - (b.sortRank ?? 0));
};

export const getProductsByIds = getMarketplaceProductsByIds;

export const getApprovedProductsForBusiness = getApprovedMarketplaceProductsForBusiness;

export const getMarketplacePromotion = async (promotionId) => {
  if (!promotionId) return null;
  const snap = await getDoc(doc(db, MARKETPLACE_COLLECTIONS.promotions, promotionId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const getMarketplacePromotionWithProducts = async (promotionId) => {
  const promotion = await getMarketplacePromotion(promotionId);
  if (!promotion) return null;

  const products = await getProductsByIds(promotion.productIds || []);
  return {
    ...promotion,
    products: products.filter(isMarketplaceProductApproved),
  };
};

export const saveMarketplaceStore = async ({ businessId, businessData = {}, storeData = {} }) => {
  if (!businessId) {
    throw new Error('Missing businessId');
  }

  const storeRef = doc(db, MARKETPLACE_COLLECTIONS.stores, businessId);
  const existing = await getDoc(storeRef);
  const fulfillment = normalizeStoreFulfillment(storeData);
  const payload = cleanObject({
    businessId,
    businessName: businessData.businessName || storeData.businessName || '',
    businessKind: businessData.businessKind || storeData.businessKind || '',
    ownerEmail: businessData.email || storeData.ownerEmail || '',
    title: storeData.title || businessData.businessName || '',
    shortDescription: cleanShortDescription(storeData.shortDescription) || '',
    coverImageUrl: storeData.coverImageUrl || businessData.backgroundImageUrl || '',
    profileImageUrl: storeData.profileImageUrl || businessData.profileImageUrl || '',
    phone: storeData.phone || businessData.phone || '',
    tags: normalizeList(storeData.tags),
    homeCommunity: storeData.homeCommunity || businessData.communityName || '',
    ...fulfillment,
    targetCommunities:
      fulfillment.pickupScope === 'selected' ? fulfillment.pickupCommunities : [],
    serviceRegions: fulfillment.deliveryCommunities,
    manualPaymentMethods: normalizeList(storeData.manualPaymentMethods).length > 0
      ? normalizeList(storeData.manualPaymentMethods)
      : DEFAULT_MANUAL_PAYMENT_METHODS,
    ...extractStoreContentFields(storeData, { clean: true }),
    whatsappContacts: normalizeWhatsappContacts(storeData.whatsappContacts),
    paymentLinks: normalizeStorePaymentLinks(storeData),
    visible: storeData.visible !== false,
    storeCartEnabled: storeData.storeCartEnabled !== false,
    status: storeData.status || 'active',
    updatedAt: serverTimestamp(),
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
  });

  await setDoc(storeRef, payload, { merge: true });
  return { id: businessId, ...payload };
};

export const saveMarketplacePromotion = async ({ businessId, businessData = {}, promotionData = {} }) => {
  if (!businessId) {
    throw new Error('Missing businessId');
  }

  const approvedProducts = await getApprovedProductsForBusiness(businessId);
  const approvedProductIds = new Set(approvedProducts.map((product) => product.id));
  const productIds = normalizeList(promotionData.productIds).filter((id) => approvedProductIds.has(id));

  if (productIds.length === 0) {
    throw new Error('Promotion must include at least one approved product');
  }

  const storeSnap = await getMarketplaceStore(businessId);
  const promoFulfillment = preparePromotionFulfillmentForSave(promotionData, storeSnap);
  const deliveryMode = promoFulfillment.deliveryEnabled
    ? promoFulfillment.allowSelfPickup
      ? 'both'
      : 'delivery'
    : 'pickup';

  const payload = cleanObject({
    businessId,
    businessName: businessData.businessName || promotionData.businessName || '',
    title: promotionData.title || '',
    description: promotionData.description || '',
    productIds,
    status: promotionData.status || 'active',
    startsAt: toTimestamp(promotionData.startsAt),
    endsAt: toTimestamp(promotionData.endsAt),
    ...promoFulfillment,
    targetCommunities:
      promoFulfillment.pickupScope === 'selected' ? promoFulfillment.pickupCommunities : [],
    serviceRegions: promoFulfillment.deliveryCommunities,
    deliveryMode,
    deliveryDate: promotionData.deliveryDate || '',
    availableWeekDays: Array.isArray(promotionData.availableWeekDays)
      ? promotionData.availableWeekDays.map(Number).filter((day) => Number.isInteger(day))
      : [],
    pickupInstructions: promoFulfillment.pickupInstructions || promotionData.pickupInstructions || '',
    manualPaymentMethods: normalizeList(promotionData.manualPaymentMethods).length > 0
      ? normalizeList(promotionData.manualPaymentMethods)
      : DEFAULT_MANUAL_PAYMENT_METHODS,
    allowVolunteerPickup: false,
    sortRank: Number(promotionData.sortRank || 0),
    updatedAt: serverTimestamp(),
  });

  if (promotionData.id) {
    await setDoc(doc(db, MARKETPLACE_COLLECTIONS.promotions, promotionData.id), payload, { merge: true });
    return { id: promotionData.id, ...payload };
  }

  const created = await addDoc(collection(db, MARKETPLACE_COLLECTIONS.promotions), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return { id: created.id, ...payload };
};

export const getSellerMarketplacePromotions = async (businessId) => {
  if (!businessId) return [];

  const promotionsQuery = query(
    collection(db, MARKETPLACE_COLLECTIONS.promotions),
    where('businessId', '==', businessId)
  );
  const snap = await getDocs(promotionsQuery);

  return snap.docs
    .map(mapDoc)
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
};

export const getSellerMarketplacePromotion = async (businessId, promotionId) => {
  if (!businessId || !promotionId) return null;
  const promotion = await getMarketplacePromotion(promotionId);
  if (!promotion || promotion.businessId !== businessId) return null;
  return promotion;
};

export const getSellerPromotionOrders = async (businessId, promotionId) => {
  if (!businessId || !promotionId) return [];
  const orders = await getSellerMarketplaceOrders(businessId);
  return orders.filter((order) => order.promotionId === promotionId);
};

export const updateMarketplacePromotionStatus = async ({ businessId, promotionId, status }) => {
  if (!businessId || !promotionId) {
    throw new Error('Missing promotion or business');
  }

  const promotionRef = doc(db, MARKETPLACE_COLLECTIONS.promotions, promotionId);
  const snap = await getDoc(promotionRef);
  if (!snap.exists() || snap.data().businessId !== businessId) {
    throw new Error('הקידום לא נמצא או שאין הרשאה');
  }

  await updateDoc(promotionRef, {
    status,
    updatedAt: serverTimestamp(),
  });

  return { id: promotionId, status };
};

export const getMarketplaceOrder = async (orderId) => {
  if (!orderId) return null;
  const snap = await getDoc(doc(db, MARKETPLACE_COLLECTIONS.orders, orderId));
  return snap.exists() ? mapDoc(snap) : null;
};

const READY_FROM_STATUSES = new Set(['new', 'confirmed']);

const loadSellerOwnedOrder = async ({ orderId, businessId }) => {
  if (!orderId || !businessId) {
    throw new Error('חסר מזהה הזמנה או עסק');
  }

  const orderRef = doc(db, MARKETPLACE_COLLECTIONS.orders, orderId);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) {
    throw new Error('ההזמנה לא נמצאה');
  }

  const order = mapDoc(snap);
  if (order.businessId !== businessId) {
    throw new Error('אין הרשאה לעדכן הזמנה זו');
  }

  return { orderRef, order };
};

export const markMarketplaceOrderPaid = async ({ orderId, businessId }) => {
  const { orderRef, order } = await loadSellerOwnedOrder({ orderId, businessId });

  if (order.paymentStatus === 'paid') {
    return order;
  }
  if (order.paymentStatus === 'cancelled') {
    throw new Error('לא ניתן לסמן תשלום להזמנה שבוטלה');
  }

  await updateDoc(orderRef, {
    paymentStatus: 'paid',
    paidAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { ...order, paymentStatus: 'paid' };
};

export const unmarkMarketplaceOrderPaid = async ({ orderId, businessId }) => {
  const { orderRef, order } = await loadSellerOwnedOrder({ orderId, businessId });

  if (order.paymentStatus !== 'paid') {
    return order;
  }

  await updateDoc(orderRef, {
    paymentStatus: 'manual_pending',
    paidAt: deleteField(),
    updatedAt: serverTimestamp(),
  });

  return { ...order, paymentStatus: 'manual_pending', paidAt: null };
};

export const markMarketplaceOrderReady = async ({ orderId, businessId }) => {
  const { orderRef, order } = await loadSellerOwnedOrder({ orderId, businessId });

  if (order.fulfillmentStatus === 'cancelled') {
    throw new Error('לא ניתן לעדכן הזמנה שבוטלה');
  }
  if (order.fulfillmentStatus === 'ready') {
    return order;
  }
  if (order.fulfillmentStatus === 'completed') {
    throw new Error('ההזמנה כבר הושלמה');
  }
  if (!READY_FROM_STATUSES.has(order.fulfillmentStatus)) {
    throw new Error('ניתן לסמן מוכנה רק להזמנות חדשות או מאושרות');
  }

  await updateDoc(orderRef, {
    fulfillmentStatus: 'ready',
    fulfillmentStatusBeforeReady: order.fulfillmentStatus,
    readyAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    ...order,
    fulfillmentStatus: 'ready',
    fulfillmentStatusBeforeReady: order.fulfillmentStatus,
  };
};

export const unmarkMarketplaceOrderReady = async ({ orderId, businessId }) => {
  const { orderRef, order } = await loadSellerOwnedOrder({ orderId, businessId });

  if (order.fulfillmentStatus !== 'ready') {
    return order;
  }

  const previousStatus = order.fulfillmentStatusBeforeReady || 'new';

  await updateDoc(orderRef, {
    fulfillmentStatus: previousStatus,
    fulfillmentStatusBeforeReady: deleteField(),
    readyAt: deleteField(),
    updatedAt: serverTimestamp(),
  });

  return {
    ...order,
    fulfillmentStatus: previousStatus,
    fulfillmentStatusBeforeReady: null,
    readyAt: null,
  };
};

/** Final step: picked up / delivered — moves order to הושלמו */
export const markMarketplaceOrderHandoff = async ({ orderId, businessId, handoffStatus }) => {
  const { orderRef, order } = await loadSellerOwnedOrder({ orderId, businessId });

  if (order.fulfillmentStatus === 'cancelled') {
    throw new Error('לא ניתן לעדכן הזמנה שבוטלה');
  }
  if (handoffStatus !== 'picked_up' && handoffStatus !== 'delivered') {
    throw new Error('סטטוס איסוף/משלוח לא תקין');
  }
  if (order.fulfillmentStatus === 'completed') {
    return { ...order, handoffStatus: order.handoffStatus || handoffStatus };
  }
  if (order.fulfillmentStatus !== 'ready') {
    throw new Error('יש לסמן את ההזמנה כמוכנה לפני איסוף או משלוח');
  }

  await updateDoc(orderRef, {
    fulfillmentStatus: 'completed',
    fulfillmentStatusBeforeComplete: 'ready',
    handoffStatus,
    handoffAt: serverTimestamp(),
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    ...order,
    fulfillmentStatus: 'completed',
    handoffStatus,
  };
};

export const unmarkMarketplaceOrderHandoff = async ({ orderId, businessId }) => {
  const { orderRef, order } = await loadSellerOwnedOrder({ orderId, businessId });

  if (order.fulfillmentStatus !== 'completed') {
    return order;
  }

  await updateDoc(orderRef, {
    fulfillmentStatus: 'ready',
    fulfillmentStatusBeforeComplete: deleteField(),
    handoffStatus: 'pending',
    handoffAt: deleteField(),
    completedAt: deleteField(),
    updatedAt: serverTimestamp(),
  });

  return {
    ...order,
    fulfillmentStatus: 'ready',
    handoffStatus: 'pending',
    handoffAt: null,
    completedAt: null,
  };
};

/** @deprecated Use markMarketplaceOrderHandoff — completes on pickup/delivery */
export const completeMarketplaceOrder = async ({ orderId, businessId, handoffStatus }) => {
  const { order } = await loadSellerOwnedOrder({ orderId, businessId });
  if (order.fulfillmentStatus === 'ready') {
    return markMarketplaceOrderHandoff({
      orderId,
      businessId,
      handoffStatus: handoffStatus || 'picked_up',
    });
  }
  return markMarketplaceOrderReady({ orderId, businessId });
};

export const unmarkMarketplaceOrderCompleted = unmarkMarketplaceOrderHandoff;

export const getSellerMarketplaceOrders = async (businessId) => {
  if (!businessId) return [];

  const ordersQuery = query(
    collection(db, MARKETPLACE_COLLECTIONS.orders),
    where('businessId', '==', businessId)
  );
  const snap = await getDocs(ordersQuery);

  return snap.docs
    .map(mapDoc)
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
};

export const getCustomerMarketplaceOrders = async ({ email, userId } = {}) => {
  const authEmail = (auth.currentUser?.email || email || '').trim();
  if (!authEmail && !userId) return [];

  const results = new Map();
  const addSnap = (snap) => {
    snap.docs.forEach((docSnap) => {
      results.set(docSnap.id, mapDoc(docSnap));
    });
  };

  const runOrderQuery = async (label, ordersQuery, { quiet = false } = {}) => {
    try {
      const snap = await getDocs(ordersQuery);
      addSnap(snap);
      return { ok: true, count: snap.size };
    } catch (error) {
      if (error?.code === 'permission-denied') {
        if (!quiet) {
          console.warn(`getCustomerMarketplaceOrders: ${label} permission denied`, error);
        }
        return { ok: false, count: 0 };
      }
      throw error;
    }
  };

  // Primary: customerUserId (new orders after account checkout)
  if (userId) {
    await runOrderQuery(
      'customerUserId',
      query(
        collection(db, MARKETPLACE_COLLECTIONS.orders),
        where('customerUserId', '==', userId)
      )
    );
  }

  // Legacy orders without customerUserId — only if still empty; needs rules with token.email
  if (authEmail && results.size === 0) {
    await runOrderQuery(
      'customerEmail',
      query(
        collection(db, MARKETPLACE_COLLECTIONS.orders),
        where('customerEmail', '==', authEmail)
      ),
      { quiet: Boolean(userId) }
    );
  }

  return [...results.values()].sort(
    (a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)
  );
};

const buildMarketplaceOrderLines = (lines, validProductIds, priceByProductId) =>
  lines
    .filter((line) => validProductIds.has(line.productId) && Number(line.quantity) > 0)
    .map((line) => {
      const quantity = Number(line.quantity);
      const price = Number(priceByProductId.get(line.productId) ?? line.price ?? 0);
      return {
        productId: line.productId,
        name: line.name || '',
        quantity,
        price,
        total: quantity * price,
        imageUrl: line.imageUrl || '',
      };
    });

/**
 * Decrement product stock after a successful order.
 * Products without a numeric `stockAmount` (unlimited) are skipped.
 * Best-effort: failures are logged but never block the order.
 */
const decrementMarketplaceProductStock = async (orderLines = []) => {
  const decrements = orderLines
    .map((line) => ({
      productId: line.productId,
      quantity: Math.max(0, Math.floor(Number(line.quantity) || 0)),
    }))
    .filter((entry) => entry.productId && entry.quantity > 0);

  if (decrements.length === 0) return;

  await Promise.all(
    decrements.map(async ({ productId, quantity }) => {
      const ref = doc(db, MARKETPLACE_PRODUCTS_COLLECTION, productId);
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) return;
          const current = snap.data().stockAmount;
          if (current === null || current === undefined) return; // unlimited
          const amount = Number(current);
          if (!Number.isFinite(amount)) return;
          tx.update(ref, {
            stockAmount: Math.max(0, amount - quantity),
            updatedAt: serverTimestamp(),
          });
        });
      } catch (error) {
        console.warn('Failed to decrement marketplace stock', productId, error);
      }
    })
  );
};

export const placeMarketplaceStoreCartOrder = async ({
  businessId,
  businessName = '',
  ownerEmail = '',
  customer = {},
  lines = [],
  paymentMethod = 'bit',
  customerNotes = '',
}) => {
  if (!businessId) {
    throw new Error('Missing businessId');
  }

  const store = await getMarketplaceStore(businessId);
  if (store?.storeCartEnabled === false) {
    throw new Error('החנות הקבועה של הבסטה אינה פעילה כרגע');
  }

  const catalogProducts = (await getStoreCatalogProductsForBusiness(businessId)).filter(
    isMarketplaceProductInStock
  );
  const approvedProductIds = new Set(catalogProducts.map((product) => product.id));
  const priceByProductId = new Map(
    catalogProducts.map((product) => [product.id, Number(product.price || 0)])
  );
  const stockByProductId = new Map(
    catalogProducts.map((product) => [product.id, getProductStockLimit(product)])
  );

  const orderLines = buildMarketplaceOrderLines(lines, approvedProductIds, priceByProductId).map(
    (line) => {
      const stockLimit = stockByProductId.get(line.productId);
      if (stockLimit !== null && line.quantity > stockLimit) {
        throw new Error(`אין מספיק מלאי עבור ${line.name || 'מוצר'}`);
      }
      return line;
    }
  );

  if (orderLines.length === 0) {
    throw new Error('Order must include at least one approved product');
  }

  const subtotal = orderLines.reduce((sum, line) => sum + line.total, 0);
  const deliveryFee = Math.max(0, Number(customer.deliveryFee) || 0);
  const total = subtotal + deliveryFee;
  const payload = cleanObject({
    promotionId: null,
    orderSource: 'store_cart',
    businessId,
    businessName,
    ownerEmail,
    customerName: customer.name || '',
    customerPhone: customer.phone || '',
    customerEmail: resolveOrderCustomerEmail(customer),
    customerUserId: customer.userId || auth.currentUser?.uid || '',
    customerCommunity: customer.community || '',
    customerNotes: customerNotes || customer.notes || '',
    selectedDeliveryOption: customer.deliveryOption || customer.fulfillmentLabel || '',
    fulfillmentMethod: customer.fulfillmentMethod || '',
    fulfillmentLabel: customer.fulfillmentLabel || customer.deliveryOption || '',
    batchDeliveryDate: customer.batchDeliveryDate || '',
    volunteerId: null,
    lines: orderLines,
    subtotal,
    deliveryFee,
    total,
    paymentMethod,
    paymentStatus: 'manual_pending',
    handoffStatus: 'pending',
    fulfillmentStatus: 'new',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (useMarketplaceCloudFunctions) {
    try {
      const response = await fetch(MARKETPLACE_FUNCTIONS.placeStoreCartOrder, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          customer,
          lines: orderLines.map(({ productId, quantity }) => ({ productId, quantity })),
          paymentMethod,
          customerNotes: payload.customerNotes,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return { id: data.orderId || data.id, ...payload, ...data };
      }
    } catch (error) {
      console.warn('placeMarketplaceStoreCartOrder function unavailable, using Firestore fallback', error);
    }
  }

  const created = await addDoc(collection(db, MARKETPLACE_COLLECTIONS.orders), payload);
  await decrementMarketplaceProductStock(orderLines);
  return { id: created.id, ...payload };
};

export const placeMarketplaceManualOrder = async ({
  promotion,
  customer = {},
  lines = [],
  selectedDeliveryOption = '',
  paymentMethod = 'bit',
}) => {
  if (!promotion?.id || !promotion.businessId) {
    throw new Error('Missing promotion details');
  }

  const promotionProducts = await getProductsByIds(promotion.productIds || []);
  const validProductIds = new Set(promotion.productIds || []);
  const priceByProductId = new Map(
    promotionProducts.map((product) => [product.id, Number(product.price || 0)])
  );
  const stockByProductId = new Map(
    promotionProducts.map((product) => [product.id, getProductStockLimit(product)])
  );
  const orderLines = buildMarketplaceOrderLines(lines, validProductIds, priceByProductId).map(
    (line) => {
      const stockLimit = stockByProductId.get(line.productId);
      if (stockLimit !== null && line.quantity > stockLimit) {
        throw new Error(`אין מספיק מלאי עבור ${line.name || 'מוצר'}`);
      }
      return line;
    }
  );

  if (orderLines.length === 0) {
    throw new Error('Order must include at least one product');
  }

  const subtotal = orderLines.reduce((sum, line) => sum + line.total, 0);
  const deliveryFee = Math.max(0, Number(customer.deliveryFee) || 0);
  const total = subtotal + deliveryFee;
  const payload = cleanObject({
    promotionId: promotion.id,
    businessId: promotion.businessId,
    businessName: promotion.businessName || '',
    customerName: customer.name || '',
    customerPhone: customer.phone || '',
    customerEmail: resolveOrderCustomerEmail(customer),
    customerUserId: customer.userId || auth.currentUser?.uid || '',
    customerCommunity: customer.community || '',
    customerNotes: customer.notes || '',
    selectedDeliveryOption: selectedDeliveryOption || customer.fulfillmentLabel || '',
    fulfillmentMethod: customer.fulfillmentMethod || '',
    fulfillmentLabel: customer.fulfillmentLabel || selectedDeliveryOption || '',
    batchDeliveryDate: promotion.deliveryDate || '',
    volunteerId: null,
    lines: orderLines,
    subtotal,
    deliveryFee,
    total,
    paymentMethod,
    paymentStatus: 'manual_pending',
    handoffStatus: 'pending',
    fulfillmentStatus: 'new',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const created = await addDoc(collection(db, MARKETPLACE_COLLECTIONS.orders), payload);
  await decrementMarketplaceProductStock(orderLines);
  return { id: created.id, ...payload };
};

export const getPublicMarketplaceStorePage = async (businessId) => {
  if (!businessId) return null;

  const [business, store, products] = await Promise.all([
    getBusinessProfile(businessId),
    getMarketplaceStore(businessId),
    getStoreCatalogProductsForBusiness(businessId),
  ]);

  const promotionsQuery = query(
    collection(db, MARKETPLACE_COLLECTIONS.promotions),
    where('businessId', '==', businessId),
    where('status', '==', 'active')
  );
  const promotionsSnap = await getDocs(promotionsQuery);
  const now = new Date();
  const promotions = promotionsSnap.docs
    .map(mapDoc)
    .filter((promotion) => isActiveInDateWindow(promotion, now))
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));

  if (!business && !store) return null;

  const isPublished =
    store?.visible !== false &&
    (store?.status === 'active' || !store?.status);

  const storeCartEnabled = store?.storeCartEnabled !== false;

  return {
    business,
    storeCartEnabled,
    store: store || {
      businessId,
      title: business?.businessName || '',
      businessName: business?.businessName || '',
      shortDescription: '',
      coverImageUrl: business?.backgroundImageUrl || '',
      profileImageUrl: business?.profileImageUrl || '',
      homeCommunity: business?.communityName || '',
      visible: false,
    },
    products,
    promotions,
    isPublished,
  };
};

export const getSellerMarketplaceData = async (businessId) => {
  const [business, store, products, promotions, orders] = await Promise.all([
    getBusinessProfile(businessId),
    getMarketplaceStore(businessId),
    getApprovedProductsForBusiness(businessId),
    getSellerMarketplacePromotions(businessId),
    getSellerMarketplaceOrders(businessId),
  ]);

  return {
    business,
    store,
    approvedProducts: products,
    promotions,
    orders,
  };
};

