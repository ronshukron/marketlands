import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const DISCOUNT_CONFIG_PATH = 'settings/communityDiscount';

// ──────────────────────────────────────────────
// Default tiers (used when no Firestore doc yet)
// ──────────────────────────────────────────────
const DEFAULT_TIERS = [
  { displayThreshold: 1000, realThreshold: 800, discountPercent: 1 },
  { displayThreshold: 2000, realThreshold: 1600, discountPercent: 2.5 },
  { displayThreshold: 5000, realThreshold: 4000, discountPercent: 5 },
];

// ──────────────────────────────────────────────
// In-memory cache for order data (avoid re-fetching
// from Firestore on every widget mount)
// ──────────────────────────────────────────────
let _ordersCache = null;
let _ordersCacheTimestamp = 0;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Fetch ALL customer orders from both collections, with caching.
 * This mirrors the approach used in WeeklyOrderSummaryV3.
 */
const fetchAllOrders = async () => {
  const now = Date.now();
  if (_ordersCache && (now - _ordersCacheTimestamp) < CACHE_TTL_MS) {
    return _ordersCache;
  }

  const ordersRef = collection(db, 'customerOrders');
  const delayedOrdersRef = collection(db, 'customerOrdersDelayed');

  const [ordersSnap, delayedSnap] = await Promise.all([
    getDocs(ordersRef),
    getDocs(delayedOrdersRef),
  ]);

  const allOrders = [];

  // Process regular orders
  ordersSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.paymentStatus !== 'completed') return;
    const createdDate = parseDate(data.createdAt);
    if (!createdDate) return;
    allOrders.push({ id: d.id, source: 'customerOrders', createdDate, ...data });
  });

  // Process delayed orders
  delayedSnap.docs.forEach((d) => {
    const data = d.data();
    // Exclude abandoned
    if (data.paymentStatus === 'abandoned' || data.paymentStatus === 'cancelled') return;
    if (data.delayedOrderStatus === 'abandoned') return;
    // Exclude already-settled/charged
    const ds = data.delayedOrderStatus || '';
    const ps = data.paymentStatus || '';
    if (['settled', 'completed', 'charged'].includes(ds)) return;
    if (['charged', 'settled'].includes(ps)) return;
    const createdDate = parseDate(data.createdAt);
    if (!createdDate) return;
    allOrders.push({ id: d.id, source: 'customerOrdersDelayed', createdDate, ...data });
  });

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

function parseDate(val) {
  if (!val) return null;
  if (typeof val === 'string') return new Date(val);
  if (val.toDate) return val.toDate();
  return null;
}

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

function ordersForCommunityAndWeek(allOrders, communityName, weekOffset = 0) {
  const now = new Date();
  now.setDate(now.getDate() - weekOffset * 7);
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);

  return {
    orders: allOrders.filter((o) => {
      const spot = o.customerDetails?.pickupSpot;
      if (spot !== communityName) return false;
      return o.createdDate >= weekStart && o.createdDate <= weekEnd;
    }),
    weekStart,
    weekEnd,
  };
}

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
    const data = snap.exists()
      ? snap.data()
      : { enabled: true, tiers: DEFAULT_TIERS, communityOverrides: {}, vipCommunities: {} };
    _configCache = data;
    _configCacheTimestamp = now;
    return data;
  } catch (error) {
    console.error('Error fetching discount config:', error);
    return { enabled: true, tiers: DEFAULT_TIERS, communityOverrides: {}, vipCommunities: {} };
  }
};

export const invalidateConfigCache = () => {
  _configCache = null;
  _configCacheTimestamp = 0;
};

export const saveDiscountConfig = async (config) => {
  try {
    const ref = doc(db, DISCOUNT_CONFIG_PATH);
    await setDoc(ref, { ...config, updatedAt: new Date().toISOString() }, { merge: true });
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
  const { orders, weekStart, weekEnd } = ordersForCommunityAndWeek(allOrders, communityName, weekOffset);

  let total = 0;
  let orderCount = 0;
  orders.forEach((o) => {
    total += o.grandTotal || 0;
    orderCount += 1;
  });

  return { total, orderCount, weekStart, weekEnd };
};

/**
 * Get weekly totals for the last N weeks.
 */
export const getCommunityWeeklyHistory = async (communityName, weeks = 8) => {
  const allOrders = await fetchAllOrders();
  const results = [];
  for (let i = 0; i < weeks; i++) {
    const { orders, weekStart, weekEnd } = ordersForCommunityAndWeek(allOrders, communityName, i);
    let total = 0;
    let orderCount = 0;
    orders.forEach((o) => {
      total += o.grandTotal || 0;
      orderCount += 1;
    });
    results.push({ total, orderCount, weekStart, weekEnd });
  }
  return results.reverse(); // oldest first
};

/**
 * Get aggregated popular items for a community in a given week.
 */
export const getCommunityPopularItems = async (communityName, weekOffset = 0) => {
  const allOrders = await fetchAllOrders();
  const { orders } = ordersForCommunityAndWeek(allOrders, communityName, weekOffset);

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
    if (o.customerDetails?.pickupSpot !== communityName) return;
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
export const calculateCommunityDiscount = async (communityName) => {
  const config = await getDiscountConfig();
  if (!config.enabled) {
    return { discountPercent: 0, currentTier: null, nextTier: null, weeklyTotal: 0, tiers: [], isVip: false };
  }

  const tiers = config.communityOverrides?.[communityName]?.tiers || config.tiers || DEFAULT_TIERS;
  const sorted = [...tiers].sort((a, b) => a.realThreshold - b.realThreshold);
  const { total: weeklyTotal } = await getCommunityWeeklyTotal(communityName);

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
    tiers: sorted,
    isVip,
    vipPerks: vip?.perks || {},
  };
};

/**
 * Get display-facing discount info (shows displayThreshold to users).
 * Also includes VIP info.
 */
export const getDisplayDiscountInfo = async (communityName) => {
  // Reuse the core calculation — it already handles VIP
  return calculateCommunityDiscount(communityName);
};
