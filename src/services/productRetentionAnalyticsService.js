import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import {
  isSuccessfulDelayedCustomerOrder,
  isSuccessfulRegularCustomerOrder,
} from '../utils/customerOrderUtils';

export const RETENTION_ORDER_SOURCES = ['customerOrders', 'customerOrdersDelayed'];
export const RETENTION_LOOKAHEAD_WEEKS = 6;
export const RETENTION_LOADER_LIMIT_PER_COLLECTION = 5000;

const SHIPPING_PRODUCT_ID = 'Mdean61FIezxRcMUZjVn';
const SHIPPING_CATALOG_NUMBER = '118';
const CACHE_TTL_MS = 5 * 60 * 1000;
let ordersCache = null;
let ordersCacheAt = 0;
let ordersCacheLimit = 0;
let ordersRequest = null;

const pad2 = (value) => String(value).padStart(2, '0');

export function normalizeRetentionText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function parseRetentionDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value);
  }
  if (typeof value?.toDate === 'function') {
    try {
      const parsed = value.toDate();
      return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
    } catch (error) {
      return null;
    }
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getRetentionWeekKey(value) {
  const parsed = parseRetentionDate(value);
  if (!parsed) return '';
  const sunday = new Date(parsed);
  sunday.setDate(parsed.getDate() - parsed.getDay());
  sunday.setHours(0, 0, 0, 0);
  return `${sunday.getFullYear()}-${pad2(sunday.getMonth() + 1)}-${pad2(sunday.getDate())}`;
}

export function addRetentionWeeks(weekKey, weeks) {
  const parsed = parseRetentionDate(weekKey);
  if (!parsed) return '';
  parsed.setDate(parsed.getDate() + (Number(weeks) || 0) * 7);
  return getRetentionWeekKey(parsed);
}

export function normalizeRetentionPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  if (digits.length > 10 && digits.startsWith('0')) digits = digits.slice(-10);
  return digits;
}

export function normalizeCustomerIdentity(order = {}) {
  const details = order.customerDetails || {};
  const phone = normalizeRetentionPhone(details.phone || order.phone);
  const email = normalizeRetentionText(details.email || order.email);
  const userId = normalizeRetentionText(order.userId || details.userId);
  const aliases = [
    phone && `phone:${phone}`,
    email && `email:${email}`,
    userId && `user:${userId}`,
  ].filter(Boolean);

  return {
    id: aliases[0] || '',
    aliases,
    name: String(details.name || order.customerName || '').trim(),
    phone: String(details.phone || order.phone || '').trim(),
    email: String(details.email || order.email || '').trim(),
  };
}

function normalizeOption(value) {
  const normalized = normalizeRetentionText(value);
  return ['none', 'ללא אופציות', 'ללא אפשרויות'].includes(normalized) ? '' : normalized;
}

function getOrderSource(order, source) {
  return source || order._source || order.customerOrderSource || order.source || '';
}

export function isFulfilledRetentionOrder(order = {}, source = '') {
  const resolvedSource = getOrderSource(order, source);
  if (!RETENTION_ORDER_SOURCES.includes(resolvedSource)) return false;

  if (resolvedSource === 'customerOrders') {
    return isSuccessfulRegularCustomerOrder(order);
  }

  return isSuccessfulDelayedCustomerOrder(order);
}

function getOrderDeliveryDate(order = {}) {
  return order.deliveryDate
    || order.fulfillment?.deliveryDate
    || order.customerDetails?.deliveryDate
    || order.createdAt;
}

function getOrderCommunity(order = {}) {
  return order.customerDetails?.pickupSpot
    || order.pickupSpotName
    || order.community
    || order.fulfillment?.community
    || '';
}

function isShippingLine(item = {}) {
  return item.isShipping === true
    || String(item.productId || item.id || '') === SHIPPING_PRODUCT_ID
    || String(item.catalogNumber || '') === SHIPPING_CATALOG_NUMBER;
}

export function makeRetentionProductKey({ businessId, productId, selectedOption } = {}) {
  const normalizedBusinessId = normalizeRetentionText(businessId);
  const normalizedProductId = normalizeRetentionText(productId);
  if (!normalizedBusinessId || !normalizedProductId) return '';
  return JSON.stringify([
    normalizedBusinessId,
    normalizedProductId,
    normalizeOption(selectedOption),
  ]);
}

export function normalizeRetentionOrder(order = {}, source = '') {
  const resolvedSource = getOrderSource(order, source);
  if (!isFulfilledRetentionOrder(order, resolvedSource)) return null;

  const customer = normalizeCustomerIdentity(order);
  if (!customer.id) return null;

  const defaultDate = getOrderDeliveryDate(order);
  const defaultCommunity = getOrderCommunity(order);
  const excludedLineIds = order.customerExcludedLineIds || {};
  const purchases = [];

  Object.entries(order.orderBreakdown || {}).forEach(([businessKey, businessOrder = {}]) => {
    const businessId = businessOrder.businessId || businessKey;
    const businessName = String(businessOrder.businessName || businessId || '').trim();
    const deliveryDate = businessOrder.deliveryDate || defaultDate;
    const explicitWeekKey = businessOrder.deliveryWeekKey
      || order.fulfillment?.deliveryWeekKey
      || order.deliveryWeekKey;
    const weekKey = getRetentionWeekKey(explicitWeekKey || deliveryDate);
    const community = String(businessOrder.community || defaultCommunity || '').trim();
    if (!weekKey) return;

    (businessOrder.items || []).forEach((item = {}) => {
      if (isShippingLine(item)) return;
      if (item.lineId && excludedLineIds[item.lineId]) return;
      if ((Number(item.quantity) || 0) <= 0) return;

      const productId = item.productId || item.id || '';
      const selectedOption = normalizeOption(item.selectedOption);
      const productKey = makeRetentionProductKey({ businessId, productId, selectedOption });
      if (!productKey) return;

      purchases.push({
        productKey,
        businessId: String(businessId),
        businessName,
        productId: String(productId),
        productName: String(item.productName || item.name || productId).trim(),
        selectedOption: String(
          ['none', 'ללא אופציות', 'ללא אפשרויות'].includes(normalizeRetentionText(item.selectedOption))
            ? ''
            : (item.selectedOption || ''),
        ).trim(),
        weekKey,
        community,
        communityKey: normalizeRetentionText(community),
      });
    });
  });

  if (purchases.length === 0) return null;
  return {
    id: order.id || '',
    source: resolvedSource,
    customer,
    purchases,
  };
}

function createDisjointSet() {
  const parent = new Map();
  const ensure = (value) => {
    if (value && !parent.has(value)) parent.set(value, value);
  };
  const find = (value) => {
    ensure(value);
    const current = parent.get(value);
    if (current !== value) parent.set(value, find(current));
    return parent.get(value);
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  return { find, union };
}

export function buildProductRetentionIndex(orders = []) {
  const normalizedOrders = (orders || [])
    .map((order) => normalizeRetentionOrder(order))
    .filter(Boolean);
  const identities = createDisjointSet();

  normalizedOrders.forEach(({ customer }) => {
    customer.aliases.forEach((alias) => identities.union(customer.id, alias));
  });

  const indexedOrders = normalizedOrders.map((order) => ({
    ...order,
    customerId: identities.find(order.customer.id),
  }));
  const customers = new Map();
  const products = new Map();
  const customerWeeks = new Map();

  indexedOrders.forEach(({ customer, customerId, purchases }) => {
    const existingCustomer = customers.get(customerId) || { ...customer, id: customerId };
    customers.set(customerId, {
      ...existingCustomer,
      name: existingCustomer.name || customer.name,
      phone: existingCustomer.phone || customer.phone,
      email: existingCustomer.email || customer.email,
    });

    purchases.forEach((purchase) => {
      if (!customerWeeks.has(customerId)) customerWeeks.set(customerId, new Map());
      const weeks = customerWeeks.get(customerId);
      if (!weeks.has(purchase.weekKey)) weeks.set(purchase.weekKey, new Set());
      weeks.get(purchase.weekKey).add(purchase.communityKey);

      if (!products.has(purchase.productKey)) {
        products.set(purchase.productKey, {
          ...purchase,
          weeks: new Map(),
        });
      }
      const product = products.get(purchase.productKey);
      if (!product.weeks.has(purchase.weekKey)) product.weeks.set(purchase.weekKey, new Map());
      const weekCustomers = product.weeks.get(purchase.weekKey);
      const previous = weekCustomers.get(customerId);
      if (!previous) {
        weekCustomers.set(customerId, {
          communities: new Set([purchase.communityKey]),
        });
      } else {
        previous.communities.add(purchase.communityKey);
      }
    });
  });

  return {
    normalizedOrders: indexedOrders,
    customers,
    products,
    customerWeeks,
  };
}

export function calculateProductRetention(index, {
  anchorWeek,
  community = '',
  minimumCohortSize = 1,
  activityLookbackWeeks = 6,
  minimumActivityRate = 0.5,
} = {}) {
  const anchorWeekKey = getRetentionWeekKey(anchorWeek);
  if (!anchorWeekKey || !index?.products || !index?.customerWeeks) return [];
  const communityKey = normalizeRetentionText(community);
  const minimum = Math.max(1, Number(minimumCohortSize) || 1);
  const lookbackWeeks = Math.max(1, Math.min(52, Number(activityLookbackWeeks) || 6));
  const activityRate = Math.max(0, Math.min(1, Number(minimumActivityRate) || 0.5));
  const requiredActiveWeeks = Math.max(1, Math.ceil(lookbackWeeks * activityRate));
  const activityWeekKeys = Array.from(
    { length: lookbackWeeks },
    (_, position) => addRetentionWeeks(anchorWeekKey, -(position + 1)),
  );
  const nextWeekKey = addRetentionWeeks(anchorWeekKey, 1);
  const lookaheadWeekKeys = Array.from(
    { length: RETENTION_LOOKAHEAD_WEEKS },
    (_, position) => addRetentionWeeks(anchorWeekKey, position + 1),
  );
  const metrics = [];

  index.products.forEach((product) => {
    const anchorCustomers = product.weeks.get(anchorWeekKey);
    if (!anchorCustomers) return;

    const productBuyerIds = Array.from(anchorCustomers.entries())
      .filter(([, purchase]) => !communityKey || purchase.communities.has(communityKey))
      .map(([customerId]) => customerId);
    const cohortIds = productBuyerIds.filter((customerId) => {
      const customerActivity = index.customerWeeks.get(customerId);
      const activeWeekCount = activityWeekKeys.filter(
        (weekKey) => customerActivity?.has(weekKey),
      ).length;
      return activeWeekCount >= requiredActiveWeeks;
    });
    if (cohortIds.length < minimum) return;

    const missedCustomerIds = cohortIds.filter(
      (customerId) => !index.customerWeeks.get(customerId)?.has(nextWeekKey),
    );
    const lapsedCustomerIds = cohortIds.filter((customerId) => (
      !lookaheadWeekKeys.some(
        (weekKey) => index.customerWeeks.get(customerId)?.has(weekKey),
      )
    ));

    metrics.push({
      productKey: product.productKey,
      productName: product.productName,
      businessName: product.businessName,
      selectedOption: product.selectedOption,
      buyers: cohortIds.length,
      productBuyers: productBuyerIds.length,
      missedNextWeek: missedCustomerIds.length,
      missedRate: missedCustomerIds.length / cohortIds.length,
      sixWeekLapsed: lapsedCustomerIds.length,
      requiredActiveWeeks,
      activityLookbackWeeks: lookbackWeeks,
      customers: cohortIds.map((customerId) => ({
        ...(index.customers.get(customerId) || { id: customerId }),
        activeWeekCount: activityWeekKeys.filter(
          (weekKey) => index.customerWeeks.get(customerId)?.has(weekKey),
        ).length,
        missedNextWeek: missedCustomerIds.includes(customerId),
        sixWeekLapsed: lapsedCustomerIds.includes(customerId),
      })),
    });
  });

  return metrics;
}

export function calculateMissedWeekProductCorrelation(index, {
  targetWeek,
  community = '',
  lookbackWeeks = 6,
  minimumActivityRate = 0.5,
} = {}) {
  const targetWeekKey = getRetentionWeekKey(targetWeek);
  if (
    !targetWeekKey
    || !index?.normalizedOrders
    || !index?.customers
    || !index?.customerWeeks
  ) {
    return {
      activeCustomers: 0,
      missedCustomers: [],
      missedCount: 0,
      products: [],
      commonProducts: [],
    };
  }

  const communityKey = normalizeRetentionText(community);
  const boundedLookback = Math.max(1, Math.min(52, Number(lookbackWeeks) || 6));
  const activityRate = Math.max(0, Math.min(1, Number(minimumActivityRate) || 0.5));
  const requiredActiveWeeks = Math.max(1, Math.ceil(boundedLookback * activityRate));
  const lookbackWeekKeys = new Set(Array.from(
    { length: boundedLookback },
    (_, position) => addRetentionWeeks(targetWeekKey, -(position + 1)),
  ));

  const candidateCustomerIds = new Set();
  const targetWeekCustomerIds = new Set();
  const customerProducts = new Map();
  const productDetails = new Map();

  index.normalizedOrders.forEach(({ customerId, purchases }) => {
    purchases.forEach((purchase) => {
      if (purchase.weekKey === targetWeekKey) {
        targetWeekCustomerIds.add(customerId);
      }

      if (!lookbackWeekKeys.has(purchase.weekKey)) return;
      if (communityKey && purchase.communityKey !== communityKey) return;

      candidateCustomerIds.add(customerId);
      if (!customerProducts.has(customerId)) customerProducts.set(customerId, new Set());
      customerProducts.get(customerId).add(purchase.productKey);
      if (!productDetails.has(purchase.productKey)) {
        productDetails.set(purchase.productKey, {
          productKey: purchase.productKey,
          productName: purchase.productName,
          businessName: purchase.businessName,
          selectedOption: purchase.selectedOption,
        });
      }
    });
  });

  const activeCustomerIds = Array.from(candidateCustomerIds).filter((customerId) => {
    const customerActivity = index.customerWeeks.get(customerId);
    const activeWeekCount = Array.from(lookbackWeekKeys).filter((weekKey) => {
      const communities = customerActivity?.get(weekKey);
      return communities && (!communityKey || communities.has(communityKey));
    }).length;
    return activeWeekCount >= requiredActiveWeeks;
  });
  const missedCustomerIds = activeCustomerIds
    .filter((customerId) => !targetWeekCustomerIds.has(customerId));
  const productCustomerCounts = new Map();

  missedCustomerIds.forEach((customerId) => {
    (customerProducts.get(customerId) || new Set()).forEach((productKey) => {
      productCustomerCounts.set(
        productKey,
        (productCustomerCounts.get(productKey) || 0) + 1,
      );
    });
  });

  const products = Array.from(productCustomerCounts.entries())
    .map(([productKey, customerCount]) => ({
      ...(productDetails.get(productKey) || { productKey }),
      customerCount,
      coverage: missedCustomerIds.length > 0
        ? customerCount / missedCustomerIds.length
        : 0,
    }))
    .sort((left, right) => (
      right.coverage - left.coverage
      || right.customerCount - left.customerCount
      || left.productName.localeCompare(right.productName, 'he')
    ));

  return {
    activeCustomers: activeCustomerIds.length,
    requiredActiveWeeks,
    lookbackWeeks: boundedLookback,
    missedCustomers: missedCustomerIds.map((customerId) => (
      index.customers.get(customerId) || { id: customerId }
    )),
    missedCount: missedCustomerIds.length,
    products,
    commonProducts: products.filter((product) => product.coverage === 1),
  };
}

function mapSnapshot(snapshot, source) {
  return snapshot.docs.map((document) => {
    const data = document.data() || {};
    return {
      id: document.id,
      ...data,
      _source: source,
      createdAt: parseRetentionDate(data.createdAt),
      grandTotal: Number(data.grandTotal || 0),
    };
  });
}

export async function loadLegacyRetentionOrders({
  force = false,
  maxPerCollection = RETENTION_LOADER_LIMIT_PER_COLLECTION,
} = {}) {
  const boundedLimit = Math.max(1, Math.min(
    RETENTION_LOADER_LIMIT_PER_COLLECTION,
    Number(maxPerCollection) || RETENTION_LOADER_LIMIT_PER_COLLECTION,
  ));
  const now = Date.now();
  if (
    !force
    && ordersCache
    && ordersCacheLimit === boundedLimit
    && now - ordersCacheAt < CACHE_TTL_MS
  ) {
    return ordersCache;
  }
  if (!force && ordersRequest && ordersCacheLimit === boundedLimit) return ordersRequest;

  ordersCacheLimit = boundedLimit;
  ordersRequest = Promise.all(RETENTION_ORDER_SOURCES.map(async (source) => {
    const snapshot = await getDocs(query(
      collection(db, source),
      orderBy('createdAt', 'desc'),
      limit(boundedLimit),
    ));
    return mapSnapshot(snapshot, source);
  }))
    .then((collections) => {
      ordersCache = collections.flat();
      ordersCacheAt = Date.now();
      return ordersCache;
    })
    .finally(() => {
      ordersRequest = null;
    });

  return ordersRequest;
}

export function invalidateLegacyRetentionOrdersCache() {
  ordersCache = null;
  ordersCacheAt = 0;
  ordersCacheLimit = 0;
  ordersRequest = null;
}
