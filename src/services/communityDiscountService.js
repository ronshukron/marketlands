import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { getWeekKey } from '../utils/deliveryScheduleUtils';

const DISCOUNT_CONFIG_PATH = 'settings/communityDiscount';
const DELAYED_ORDERS_COLLECTION = 'customerOrdersDelayed';
const PROGRESS_COLLECTION = 'communityDiscountProgress';
const SHIPPING_PRODUCT_ID = 'Mdean61FIezxRcMUZjVn';
const BUFFER_CATALOG_NUMBER = '999003';

// ──────────────────────────────────────────────
// Default tiers (used when no Firestore doc yet)
// ──────────────────────────────────────────────
const DEFAULT_TIERS = [
  { displayThreshold: 1000, realThreshold: 800, discountPercent: 1 },
  { displayThreshold: 2000, realThreshold: 1600, discountPercent: 2.5 },
  { displayThreshold: 5000, realThreshold: 4000, discountPercent: 5 },
];

const DEFAULT_CONFIG = {
  enabled: true,
  autoApplyInV7: false,
  availabilityMode: 'all',
  pilotCommunities: [],
  tiers: DEFAULT_TIERS,
  communityOverrides: {},
  vipCommunities: {},
};

export const normalizeDiscountConfig = (config = {}) => ({
  ...DEFAULT_CONFIG,
  ...config,
  autoApplyInV7: config.autoApplyInV7 === true,
  availabilityMode: config.availabilityMode === 'selected' ? 'selected' : 'all',
  pilotCommunities: Array.isArray(config.pilotCommunities)
    ? [...new Set(config.pilotCommunities.filter((name) => typeof name === 'string' && name.trim()))]
    : [],
  tiers: Array.isArray(config.tiers) ? config.tiers : DEFAULT_TIERS,
  communityOverrides: config.communityOverrides || {},
  vipCommunities: config.vipCommunities || {},
});

export const getCommunityDiscountProgressDocId = (communityName, deliveryWeekKey) => (
  `${communityName}__${deliveryWeekKey}`
);

const getDeliveryWeekRange = (deliveryWeekKey) => {
  const weekStart = deliveryWeekKey ? new Date(`${deliveryWeekKey}T00:00:00`) : null;
  const weekEnd = weekStart ? new Date(weekStart) : null;
  if (weekEnd) {
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
  }
  return { weekStart, weekEnd };
};

export const isCommunityDiscountAvailable = (communityName, rawConfig = {}) => {
  const config = normalizeDiscountConfig(rawConfig);
  if (config.enabled !== true) return false;
  if (config.availabilityMode !== 'selected') return true;
  return Boolean(communityName && config.pilotCommunities.includes(communityName));
};

// ──────────────────────────────────────────────
// In-memory cache for order data (avoid re-fetching
// from Firestore on every widget mount)
// ──────────────────────────────────────────────
let _ordersCache = null;
let _ordersCacheTimestamp = 0;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Fetch delayed orders with caching. The community discount is intentionally
 * scoped to the delayed-payment/V7 flow.
 */
const fetchAllOrders = async () => {
  const now = Date.now();
  if (_ordersCache && (now - _ordersCacheTimestamp) < CACHE_TTL_MS) {
    return _ordersCache;
  }

  const delayedSnap = await getDocs(collection(db, DELAYED_ORDERS_COLLECTION));
  const allOrders = delayedSnap.docs.map((d) => ({
    id: d.id,
    source: DELAYED_ORDERS_COLLECTION,
    ...d.data(),
  }));

  _ordersCache = allOrders;
  _ordersCacheTimestamp = now;
  return allOrders;
};

/** Invalidate cache (call after creating an order, etc.) */
export const invalidateOrdersCache = () => {
  _ordersCache = null;
  _ordersCacheTimestamp = 0;
};

// ──────────────────────────────────────────────
// Date / week helpers
// ──────────────────────────────────────────────

/** Sunday 00:00 of the week containing `date`. */
export const getWeekStart = (date = new Date()) => {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Friday 23:59:59 of the same week. */
export const getWeekEnd = (date = new Date()) => {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 5);
  end.setHours(23, 59, 59, 999);
  return end;
};

// ──────────────────────────────────────────────
// Filtering helpers
// ──────────────────────────────────────────────

const getOffsetWeekKey = (weekOffset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - (Number(weekOffset) || 0) * 7);
  return getWeekKey(date);
};

const getOrderCommunity = (order = {}) => (
  order.customerDetails?.pickupSpot
  || order.fulfillment?.community
  || order.community
  || order.pickupSpot
  || ''
);

const getOrderDeliveryWeekKey = (order = {}) => (
  order.deliveryWeekKey
  || order.fulfillment?.deliveryWeekKey
  || order.weekKey
  || ''
);

const COMPLETED_PAYMENT_STATUSES = new Set(['completed', 'charged', 'settled']);
const COMPLETED_DELAYED_STATUSES = new Set(['completed', 'charged', 'settled']);

export const isEligibleCommunityDiscountOrder = (order = {}) => {
  const paymentStatus = String(order.paymentStatus || order.delayedMeta?.paymentStatus || '').toLowerCase();
  const delayedStatus = String(order.delayedOrderStatus || order.delayedMeta?.delayedOrderStatus || '').toLowerCase();

  if (['abandoned', 'cancelled'].includes(paymentStatus)) return false;
  if (['abandoned', 'cancelled', 'cancelled_by_admin'].includes(delayedStatus)) return false;
  if (paymentStatus === 'held' && delayedStatus === 'pending_weighing') return true;
  return COMPLETED_PAYMENT_STATUSES.has(paymentStatus)
    && (COMPLETED_DELAYED_STATUSES.has(delayedStatus) || delayedStatus === '');
};

const getExcludedLineIds = (order = {}) => {
  const raw = order.customerExcludedLineIds || order.rawData?.customerExcludedLineIds || [];
  if (Array.isArray(raw)) return new Set(raw);
  return new Set(Object.entries(raw).filter(([, excluded]) => excluded).map(([lineId]) => lineId));
};

export const flattenOrderItems = (order = {}) => {
  if (Array.isArray(order.items)) return order.items;
  const breakdown = order.orderBreakdown || order.rawData?.orderBreakdown || {};
  return Object.values(breakdown).flatMap((businessOrder) => businessOrder?.items || []);
};

const isShippingLine = (item = {}) => (
  item.isShipping === true
  || item.productId === SHIPPING_PRODUCT_ID
  || item.catalogNumber === BUFFER_CATALOG_NUMBER
);

const getEstimatedLineTotal = (item = {}) => {
  const savedTotal = Number(
    item.communityDiscountOriginalEstimatedLineTotal ?? item.estimatedLineTotal,
  );
  if (Number.isFinite(savedTotal)) return savedTotal;
  const quantity = Number(item.estimatedChargeQuantity ?? item.quantity ?? item.requestedQuantity) || 0;
  const price = Number(
    item.communityDiscountOriginalEffectivePrice
    ?? item.communityDiscountOriginalPrice
    ?? item.effectivePrice
    ?? item.price
    ?? item.pricePerUnit,
  ) || 0;
  return quantity * price;
};

export const getEstimatedCommunityProductSubtotal = (order = {}) => {
  const excludedLineIds = getExcludedLineIds(order);
  const countedBaskets = new Set();
  let total = 0;

  flattenOrderItems(order).forEach((item = {}) => {
    if (excludedLineIds.has(item.lineId) || item.isBasketAdjustment === true || isShippingLine(item)) return;
    if (item.isBasketComponent === true && item.basketInstanceId) {
      if (countedBaskets.has(item.basketInstanceId)) return;
      countedBaskets.add(item.basketInstanceId);
      total += Number(
        item.communityDiscountOriginalBasketPrice ?? item.basketPrice,
      ) || 0;
      return;
    }
    total += getEstimatedLineTotal(item);
  });

  return Math.round(total * 100) / 100;
};

export const getCommunityOrdersForDeliveryWeek = (
  allOrders = [],
  communityName,
  deliveryWeekKey,
) => allOrders.filter((order) => (
  isEligibleCommunityDiscountOrder(order)
  && getOrderCommunity(order) === communityName
  && getOrderDeliveryWeekKey(order) === deliveryWeekKey
));

export const aggregateCommunityDeliveryWeek = ({
  orders = [],
  communityName,
  deliveryWeekKey,
}) => {
  const eligibleOrders = getCommunityOrdersForDeliveryWeek(orders, communityName, deliveryWeekKey);
  const total = eligibleOrders.reduce(
    (sum, order) => sum + getEstimatedCommunityProductSubtotal(order),
    0,
  );
  return {
    total: Math.round(total * 100) / 100,
    orderCount: eligibleOrders.length,
    orders: eligibleOrders,
    deliveryWeekKey,
    ...getDeliveryWeekRange(deliveryWeekKey),
  };
};

// ──────────────────────────────────────────────
// Config helpers
// ──────────────────────────────────────────────

let _configCache = null;
let _configCacheTimestamp = 0;
const CONFIG_CACHE_TTL_MS = 60 * 1000; // 1 minute

export const getDiscountConfig = async () => {
  const now = Date.now();
  if (_configCache && (now - _configCacheTimestamp) < CONFIG_CACHE_TTL_MS) {
    return _configCache;
  }
  try {
    const ref = doc(db, DISCOUNT_CONFIG_PATH);
    const snap = await getDoc(ref);
    const data = normalizeDiscountConfig(snap.exists() ? snap.data() : DEFAULT_CONFIG);
    _configCache = data;
    _configCacheTimestamp = now;
    return data;
  } catch (error) {
    console.error('Error fetching discount config:', error);
    return normalizeDiscountConfig(DEFAULT_CONFIG);
  }
};

export const invalidateConfigCache = () => {
  _configCache = null;
  _configCacheTimestamp = 0;
};

export const saveDiscountConfig = async (config) => {
  try {
    const ref = doc(db, DISCOUNT_CONFIG_PATH);
    await setDoc(
      ref,
      { ...normalizeDiscountConfig(config), updatedAt: new Date().toISOString() },
      { merge: true },
    );
    invalidateConfigCache();
    return true;
  } catch (error) {
    console.error('Error saving discount config:', error);
    return false;
  }
};

// ──────────────────────────────────────────────
// VIP helpers
// ──────────────────────────────────────────────

/**
 * Get VIP config for a specific community.
 * Returns null if not VIP, or the perks object.
 */
export const getVipConfig = async (communityName) => {
  const config = await getDiscountConfig();
  const vip = config.vipCommunities?.[communityName];
  if (!vip || !vip.isVip) return null;
  return vip;
};

/**
 * Check if a community is VIP.
 */
export const isCommunityVip = async (communityName) => {
  const vip = await getVipConfig(communityName);
  return !!vip;
};

// ──────────────────────────────────────────────
// Order aggregation (public API)
// ──────────────────────────────────────────────

/**
 * Get total order amount + count for a community in a given week.
 */
export const getCommunityWeeklyTotal = async (communityName, weekOffset = 0) => {
  const allOrders = await fetchAllOrders();
  return aggregateCommunityDeliveryWeek({
    orders: allOrders,
    communityName,
    deliveryWeekKey: getOffsetWeekKey(weekOffset),
  });
};

/**
 * Get weekly totals for the last N weeks.
 */
export const getCommunityWeeklyHistory = async (communityName, weeks = 8) => {
  const allOrders = await fetchAllOrders();
  const results = [];
  for (let weekOffset = 0; weekOffset < weeks; weekOffset += 1) {
    results.push(aggregateCommunityDeliveryWeek({
      orders: allOrders,
      communityName,
      deliveryWeekKey: getOffsetWeekKey(weekOffset),
    }));
  }
  return results.reverse(); // oldest first
};

/**
 * Get aggregated popular items for a community in a given week.
 */
export const getCommunityPopularItems = async (communityName, weekOffset = 0) => {
  const allOrders = await fetchAllOrders();
  const { orders } = aggregateCommunityDeliveryWeek({
    orders: allOrders,
    communityName,
    deliveryWeekKey: getOffsetWeekKey(weekOffset),
  });

  const itemMap = {};
  orders.forEach((o) => {
    const breakdown = o.orderBreakdown || {};
    Object.values(breakdown).forEach((bizOrder) => {
      (bizOrder.items || []).forEach((item) => {
        if (item.isShipping) return; // skip shipping
        const key = `${item.productId}_${item.selectedOption || 'default'}`;
        if (!itemMap[key]) {
          itemMap[key] = {
            productId: item.productId,
            productName: item.productName,
            selectedOption: item.selectedOption,
            totalQuantity: 0,
            totalRevenue: 0,
            orderCount: 0,
            measurementType: item.measurementType || 'kg',
          };
        }
        itemMap[key].totalQuantity += item.quantity || 0;
        itemMap[key].totalRevenue += (item.quantity || 0) * (item.price || 0);
        itemMap[key].orderCount += 1;
      });
    });
  });

  return Object.values(itemMap).sort((a, b) => b.totalQuantity - a.totalQuantity);
};

/**
 * Get unique member count for a community.
 */
export const getCommunityMemberCount = async (communityName) => {
  const allOrders = await fetchAllOrders();
  const userIds = new Set();

  allOrders.forEach((o) => {
    if (!isEligibleCommunityDiscountOrder(o) || getOrderCommunity(o) !== communityName) return;
    if (o.userId) userIds.add(o.userId);
    else if (o.customerDetails?.phone) userIds.add(o.customerDetails.phone);
  });

  return userIds.size;
};

// ──────────────────────────────────────────────
// Discount calculation
// ──────────────────────────────────────────────

/**
 * Determine the active discount for a community based on real thresholds.
 * Also factors in VIP base-discount perk.
 */
export const calculateCommunityDiscountFromOrders = ({
  communityName,
  deliveryWeekKey,
  orders = [],
  weeklyTotal: weeklyTotalOverride,
  orderCount: orderCountOverride,
  config: rawConfig = DEFAULT_CONFIG,
}) => {
  const config = normalizeDiscountConfig(rawConfig);
  if (!isCommunityDiscountAvailable(communityName, config)) {
    return {
      discountPercent: 0,
      currentTier: null,
      nextTier: null,
      weeklyTotal: 0,
      orderCount: 0,
      tiers: [],
      isVip: false,
      deliveryWeekKey,
      tierIndex: -1,
      enabled: false,
      autoApplyInV7: false,
    };
  }

  const tiers = config.communityOverrides?.[communityName]?.tiers || config.tiers || DEFAULT_TIERS;
  const sorted = [...tiers].sort((a, b) => a.realThreshold - b.realThreshold);
  const hasProgressOverride = weeklyTotalOverride != null;
  const cohort = hasProgressOverride
    ? {
      total: Math.max(0, Math.round(Number(weeklyTotalOverride) * 100) / 100 || 0),
      orderCount: Math.max(0, Math.round(Number(orderCountOverride) || 0)),
      ...getDeliveryWeekRange(deliveryWeekKey),
    }
    : aggregateCommunityDeliveryWeek({ orders, communityName, deliveryWeekKey });
  const weeklyTotal = cohort.total;

  // VIP: check for base-discount perk
  const vip = config.vipCommunities?.[communityName];
  const isVip = !!(vip?.isVip);
  const baseDiscountPerk = vip?.perks?.baseDiscount;
  let guaranteedTierIndex = -1;
  if (isVip && baseDiscountPerk?.enabled && typeof baseDiscountPerk.guaranteedTierIndex === 'number') {
    guaranteedTierIndex = baseDiscountPerk.guaranteedTierIndex;
  }

  // Find the highest qualifying tier from actual orders
  let currentTier = null;
  let nextTier = sorted[0] || null;

  for (let i = 0; i < sorted.length; i++) {
    if (weeklyTotal >= sorted[i].realThreshold) {
      currentTier = sorted[i];
      nextTier = sorted[i + 1] || null;
    }
  }

  // Apply VIP guaranteed tier if it's higher
  const currentTierIndex = currentTier ? sorted.indexOf(currentTier) : -1;
  if (guaranteedTierIndex > currentTierIndex && guaranteedTierIndex < sorted.length) {
    currentTier = sorted[guaranteedTierIndex];
    nextTier = sorted[guaranteedTierIndex + 1] || null;
  }

  return {
    discountPercent: currentTier?.discountPercent || 0,
    currentTier,
    nextTier,
    weeklyTotal,
    orderCount: cohort.orderCount,
    tiers: sorted,
    isVip,
    vipPerks: vip?.perks || {},
    deliveryWeekKey,
    weekStart: cohort.weekStart,
    weekEnd: cohort.weekEnd,
    tierIndex: currentTier ? sorted.indexOf(currentTier) : -1,
    enabled: true,
    autoApplyInV7: config.autoApplyInV7 === true,
  };
};

export const calculateCommunityDiscount = async (
  communityName,
  deliveryWeekKey = getOffsetWeekKey(0),
) => {
  const [config, orders] = await Promise.all([getDiscountConfig(), fetchAllOrders()]);
  return calculateCommunityDiscountFromOrders({
    communityName,
    deliveryWeekKey,
    orders,
    config,
  });
};

/**
 * Get display-facing discount info (shows displayThreshold to users).
 * Also includes VIP info.
 */
export const getDisplayDiscountInfo = async (
  communityName,
  deliveryWeekKey = getOffsetWeekKey(0),
) => calculateCommunityDiscount(communityName, deliveryWeekKey);

export const subscribeDisplayDiscountInfo = ({
  communityName,
  deliveryWeekKey = getOffsetWeekKey(0),
  onValue,
  onError,
}) => {
  if (!communityName || !deliveryWeekKey) return () => {};

  let config = null;
  let progress = { total: 0, orderCount: 0 };
  const emit = () => {
    if (!config) return;
    onValue?.(calculateCommunityDiscountFromOrders({
      communityName,
      deliveryWeekKey,
      weeklyTotal: progress.total,
      orderCount: progress.orderCount,
      config,
    }));
  };
  const unsubscribeConfig = onSnapshot(
    doc(db, DISCOUNT_CONFIG_PATH),
    (snapshot) => {
      config = normalizeDiscountConfig(snapshot.exists() ? snapshot.data() : DEFAULT_CONFIG);
      emit();
    },
    (error) => onError?.(error),
  );
  const unsubscribeProgress = onSnapshot(
    doc(db, PROGRESS_COLLECTION, getCommunityDiscountProgressDocId(communityName, deliveryWeekKey)),
    (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      progress = {
        total: Number(data.total) || 0,
        orderCount: Number(data.orderCount) || 0,
      };
      emit();
    },
    (error) => {
      console.warn('Community discount progress is using config only:', error?.message || error);
      progress = { total: 0, orderCount: 0 };
      emit();
    },
  );

  return () => {
    unsubscribeConfig();
    unsubscribeProgress();
  };
};
