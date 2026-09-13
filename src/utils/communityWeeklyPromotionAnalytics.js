import { getEstimatedLineTotal } from './pricing';

const CANCELLED_STATUSES = new Set([
  'abandoned',
  'cancelled',
  'cancelled_by_admin',
]);
const SHIPPING_PRODUCT_ID = 'Mdean61FIezxRcMUZjVn';
const BUFFER_CATALOG_NUMBER = '999003';

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value) => Math.round(number(value) * 100) / 100;

const clean = (value) => String(value || '').trim();

const isShippingOrBufferLine = (item = {}) => (
  item.isShipping === true
  || item.catalogNumber === BUFFER_CATALOG_NUMBER
  || clean(item.productId || item.id) === SHIPPING_PRODUCT_ID
);

const breakdownItemsOf = (order = {}) => {
  const breakdown = order.orderBreakdown || order.rawData?.orderBreakdown || {};
  return Object.values(breakdown).flatMap((businessOrder) => (
    (Array.isArray(businessOrder?.items) ? businessOrder.items : []).map((item) => ({
      ...item,
      businessName: item?.businessName || businessOrder?.businessName || '',
      businessId: item?.businessId || businessOrder?.businessId || '',
    }))
  ));
};

export const flattenWeeklyPromotionOrderItems = (order = {}) => {
  const checkoutItems = breakdownItemsOf(order);
  if (checkoutItems.length > 0) return checkoutItems;
  return Array.isArray(order.items) ? order.items : [];
};

export const isCountableWeeklyPromotionOrder = (order = {}) => {
  const paymentStatus = clean(order.paymentStatus || order.delayedMeta?.paymentStatus).toLowerCase();
  const delayedStatus = clean(
    order.delayedOrderStatus || order.delayedMeta?.delayedOrderStatus,
  ).toLowerCase();
  return !CANCELLED_STATUSES.has(paymentStatus) && !CANCELLED_STATUSES.has(delayedStatus);
};

export const promotionTargetCommunities = (promotion = {}) => {
  const byCode = new Map();
  const communities = Array.isArray(promotion.targetCommunities) ? promotion.targetCommunities : [];
  communities.forEach((community, index) => {
    if (typeof community === 'string') {
      const name = clean(community);
      const code = clean(promotion.targetCommunityCodes?.[index]) || name;
      if (!code && !name) return;
      byCode.set(code || name, { communityCode: code || name, communityName: name || code });
      return;
    }
    const code = clean(community?.code);
    const name = clean(community?.name) || code;
    if (!code && !name) return;
    byCode.set(code || name, { communityCode: code || name, communityName: name });
  });
  (Array.isArray(promotion.targetCommunityCodes) ? promotion.targetCommunityCodes : []).forEach((code) => {
    const communityCode = clean(code);
    if (!communityCode || byCode.has(communityCode)) return;
    byCode.set(communityCode, { communityCode, communityName: communityCode });
  });
  return [...byCode.values()];
};

export const toCheckoutEstimateItem = (item = {}, promotionPrice = null) => {
  const quantity = number(item.requestedQuantity ?? item.quantity);
  const price = number(
    item.communityWeeklyPromotionPrice
    ?? item.communityDiscountOriginalEffectivePrice
    ?? item.communityDiscountOriginalPrice
    ?? promotionPrice
    ?? item.effectivePrice
    ?? item.price
    ?? item.pricePerUnit
  );
  return {
    ...item,
    quantity: quantity || number(item.quantity),
    price,
    effectivePrice: price,
    measurementType: item.measurementType || 'kg',
    averageWeightKg: item.averageWeightKg,
  };
};

export const weeklyPromotionLineRevenue = (item = {}, promotionPrice = null) => {
  const checkout = toCheckoutEstimateItem(item, promotionPrice);
  const original = number(item.communityDiscountOriginalEstimatedLineTotal);
  if (original > 0) return original;
  const estimated = number(item.estimatedLineTotal);
  if (estimated > 0) return estimated;
  return roundMoney(getEstimatedLineTotal(checkout));
};

const lineUnits = (item = {}) => (
  number(item.estimatedChargeQuantity ?? item.requestedQuantity ?? item.quantity)
);

const orderCustomerId = (order = {}) => (
  clean(order.userId)
  || clean(order.uid)
  || clean(order.customerDetails?.phone)
  || clean(order.customerDetails?.email)
  || clean(order.id)
);

const orderCommunityName = (order = {}) => (
  clean(order.fulfillment?.community)
  || clean(order.community)
  || clean(order.customerDetails?.pickupSpot)
);

export const isAppliedWeeklyPromotionLine = (item = {}, promotionId, productIds = new Set()) => {
  if (!item || isShippingOrBufferLine(item) || item.communityWeeklyPromotionApplied !== true) {
    return false;
  }
  const linePromotionId = clean(item.communityWeeklyPromotionId);
  if (linePromotionId) return linePromotionId === promotionId;
  const productId = clean(item.productId || item.id);
  return productIds.size === 0 || productIds.has(productId);
};

const lineProductId = (item = {}) => clean(item.productId || item.id);

const snapshotPriceByProductId = (promotion = {}) => {
  const prices = new Map();
  (Array.isArray(promotion.productSnapshots) ? promotion.productSnapshots : []).forEach((product) => {
    const productId = clean(product?.productId || product?.id);
    if (!productId || prices.has(productId)) return;
    const price = number(product?.promotionPrice);
    if (price > 0) prices.set(productId, price);
  });
  return prices;
};

const emptyCommunityRow = ({ communityCode, communityName }) => ({
  communityCode,
  communityName,
  code: communityCode,
  name: communityName,
  unlocked: false,
  unlocks: 0,
  orders: 0,
  units: 0,
  revenue: 0,
  customers: 0,
  customerIds: new Set(),
});

const emptyProductRow = ({ productId, productName, businessName }) => ({
  productId,
  productName,
  name: productName,
  businessName: businessName || '',
  units: 0,
  orders: 0,
  revenue: 0,
  orderIds: new Set(),
});

export const emptyCommunityWeeklyPromotionAnalytics = () => ({
  views: 0,
  uniqueVisits: 0,
  unlocks: 0,
  unlockCount: 0,
  unlockConfirmations: 0,
  targetCommunityCount: 0,
  orders: 0,
  orderCount: 0,
  units: 0,
  revenue: 0,
  customers: 0,
  customerCount: 0,
  products: [],
  communities: [],
});

const resolveCommunityKey = (communityRows, codeOrName) => {
  const value = clean(codeOrName);
  if (!value) return '';
  if (communityRows.has(value)) return value;
  const byName = [...communityRows.values()].find((row) => row.communityName === value);
  return byName?.communityCode || value;
};

export const buildCommunityWeeklyPromotionAnalytics = ({
  promotion = null,
  unlocks = [],
  orders = [],
} = {}) => {
  const promotionId = clean(promotion?.id);
  const stats = emptyCommunityWeeklyPromotionAnalytics();
  if (!promotionId) return stats;

  const communityRows = new Map();
  promotionTargetCommunities(promotion).forEach((community) => {
    communityRows.set(community.communityCode, emptyCommunityRow(community));
  });

  const unlockedCodes = new Set();
  (Array.isArray(unlocks) ? unlocks : []).forEach((unlock) => {
    if (unlock?.unlocked !== true) return;
    const communityCode = clean(unlock.communityCode);
    if (!communityCode) return;
    unlockedCodes.add(communityCode);
    const current = communityRows.get(communityCode) || emptyCommunityRow({
      communityCode,
      communityName: communityCode,
    });
    current.unlocked = true;
    current.unlocks = 1;
    communityRows.set(communityCode, current);
  });

  const productRows = new Map();
  const snapshotProductIds = new Set();
  const snapshotPrices = snapshotPriceByProductId(promotion);
  const snapshotProducts = Array.isArray(promotion.productSnapshots) ? promotion.productSnapshots : [];
  snapshotProducts.forEach((product) => {
    const productId = clean(product?.productId || product?.id);
    if (!productId) return;
    snapshotProductIds.add(productId);
    productRows.set(productId, emptyProductRow({
      productId,
      productName: clean(product?.name) || 'מוצר',
      businessName: clean(product?.businessName || product?.supplierName),
    }));
  });

  const customerIds = new Set();
  const countedOrders = new Set();
  const lineCommunityKey = (item, order) => resolveCommunityKey(
    communityRows,
    clean(item.communityWeeklyPromotionCommunityCode)
    || clean(order.communityWeeklyPromotionAttribution?.communityCode)
    || orderCommunityName(order),
  );
  const isCountablePromoLine = (item, order) => {
    const linePromotionId = clean(item.communityWeeklyPromotionId);
    if (linePromotionId && linePromotionId !== promotionId) return false;
    if (isAppliedWeeklyPromotionLine(item, promotionId, snapshotProductIds)) return true;
    const productId = lineProductId(item);
    if (!productId || !snapshotProductIds.has(productId) || isShippingOrBufferLine(item)) return false;
    const communityKey = lineCommunityKey(item, order);
    return Boolean(
      communityKey
      && (
        unlockedCodes.has(communityKey)
        || clean(order.communityWeeklyPromotionAttribution?.promotionId) === promotionId
      )
    );
  };

  (Array.isArray(orders) ? orders : []).forEach((order) => {
    if (!isCountableWeeklyPromotionOrder(order)) return;
    const orderId = clean(order.id) || `${orderCustomerId(order)}-${countedOrders.size}`;
    if (countedOrders.has(orderId)) return;

    const items = flattenWeeklyPromotionOrderItems(order)
      .filter((item) => isCountablePromoLine(item, order));
    if (items.length === 0) return;

    countedOrders.add(orderId);
    const customerId = orderCustomerId(order) || orderId;
    customerIds.add(customerId);

    let communityCode = '';
    items.forEach((item) => {
      const productId = lineProductId(item);
      const productName = clean(item.productName || item.name) || 'מוצר';
      const revenue = weeklyPromotionLineRevenue(item, snapshotPrices.get(productId));
      const units = lineUnits(item);
      stats.units += units;
      stats.revenue += revenue;
      if (!communityCode) {
        communityCode = clean(item.communityWeeklyPromotionCommunityCode)
          || clean(order.communityWeeklyPromotionAttribution?.communityCode);
      }

      if (productId) {
        const product = productRows.get(productId) || emptyProductRow({
          productId,
          productName,
          businessName: clean(item.businessName || item.supplierName),
        });
        product.productName = product.productName || productName;
        product.units += units;
        product.revenue += revenue;
        product.orderIds.add(orderId);
        productRows.set(productId, product);
      }
    });

    if (!communityCode) communityCode = orderCommunityName(order);
    communityCode = resolveCommunityKey(communityRows, communityCode);
    if (communityCode) {
      const current = communityRows.get(communityCode) || emptyCommunityRow({
        communityCode,
        communityName: communityCode,
      });
      current.orders += 1;
      current.units += items.reduce((sum, item) => sum + lineUnits(item), 0);
      current.revenue += items.reduce((sum, item) => (
        sum + weeklyPromotionLineRevenue(item, snapshotPrices.get(lineProductId(item)))
      ), 0);
      current.customerIds.add(customerId);
      communityRows.set(communityCode, current);
    }
  });

  stats.unlocks = unlockedCodes.size;
  stats.unlockCount = stats.unlocks;
  stats.unlockConfirmations = stats.unlocks;
  stats.targetCommunityCount = promotionTargetCommunities(promotion).length;
  stats.orders = countedOrders.size;
  stats.orderCount = stats.orders;
  stats.revenue = roundMoney(stats.revenue);
  stats.customers = customerIds.size;
  stats.customerCount = stats.customers;
  stats.products = [...productRows.values()]
    .map((product) => ({
      productId: product.productId,
      productName: product.productName,
      name: product.productName,
      businessName: product.businessName,
      units: product.units,
      orders: product.orderIds.size,
      orderCount: product.orderIds.size,
      revenue: roundMoney(product.revenue),
    }))
    .filter((product) => product.units > 0 || product.orders > 0)
    .sort((left, right) => right.revenue - left.revenue || right.units - left.units);
  stats.communities = [...communityRows.values()]
    .map((community) => ({
      communityCode: community.communityCode,
      code: community.communityCode,
      communityName: community.communityName,
      name: community.communityName,
      unlocked: community.unlocked,
      unlocks: community.unlocks,
      orders: community.orders,
      orderCount: community.orders,
      units: community.units,
      revenue: roundMoney(community.revenue),
      customers: community.customerIds.size,
      customerCount: community.customerIds.size,
    }))
    .sort((left, right) => (
      Number(right.unlocked) - Number(left.unlocked)
      || right.orders - left.orders
      || String(left.communityName || '').localeCompare(String(right.communityName || ''), 'he')
    ));

  return stats;
};
