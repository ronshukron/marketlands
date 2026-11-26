import {
  generateAvailableDeliveryDates,
  getWeekKey,
  isAlwaysOnGroceryOrder,
  isAlwaysOnGroceryOrderLive,
  isDeliveryDateOrderable,
  orderServesCommunity,
} from './deliveryScheduleUtils';
import { getEstimatedLineTotal } from './pricing';

/**
 * True when this farmer's order form cannot deliver on dateKey to the community
 * (its cutoff passed, it does not deliver that day, it is off, or it does not
 * serve the community). Forms without a delivery schedule never close.
 */
export function isCartOrderClosedOnDate(orderData, dateKey, { scheduleDoc, communityName = '', now = new Date() } = {}) {
  if (!orderData || !isAlwaysOnGroceryOrder(orderData)) return false;
  if (!isAlwaysOnGroceryOrderLive(orderData, communityName, now)) return true;
  if (communityName && !orderServesCommunity(orderData, communityName)) return true;
  if (!scheduleDoc || !dateKey || !communityName) return false;
  return !isDeliveryDateOrderable(dateKey, scheduleDoc, now, orderData, communityName);
}

/**
 * Splits the cart (grouped by farmer order form) for one delivery date.
 *
 * - Items of a farmer that is closed for the date are left out.
 * - A basket is sold whole: when any of its products comes from a closed farmer,
 *   every line of that basket is left out.
 * - Delivery-fee lines are never left out; when their farmer has nothing left,
 *   they move to the first farmer that still has products.
 *
 * @param {Object} itemsByOrder {orderId: {items, businessId, total, ...}}
 * @param {function(string): boolean} isOrderClosed
 * @return {{includedByOrder: Object, excludedItems: Array, excludedBaskets: Array,
 *   closedOrderIds: Array, excludedTotal: number, hasProducts: boolean}}
 */
export function splitCartForDeliveryDate(itemsByOrder = {}, isOrderClosed = () => false) {
  const entries = Object.entries(itemsByOrder || {});
  const closedOrderIds = entries.map(([orderId]) => orderId).filter((orderId) => isOrderClosed(orderId));
  const closed = new Set(closedOrderIds);
  const groupBusinessName = (group) => {
    const items = group?.items || [];
    return (items.find((item) => !item.isShipping) || items[0] || {}).businessName || '';
  };

  const closedBaskets = new Map();
  entries.forEach(([orderId, group]) => {
    if (!closed.has(orderId)) return;
    (group?.items || []).forEach((item) => {
      if (!item.basketInstanceId || item.isShipping) return;
      const basket = closedBaskets.get(item.basketInstanceId) || {
        basketInstanceId: item.basketInstanceId,
        title: item.basketTitle || 'סל',
        closedBusinessNames: [],
      };
      const name = item.businessName || groupBusinessName(group);
      if (name && !basket.closedBusinessNames.includes(name)) basket.closedBusinessNames.push(name);
      closedBaskets.set(item.basketInstanceId, basket);
    });
  });

  const includedByOrder = {};
  const excludedItems = [];
  const strayShipping = [];
  entries.forEach(([orderId, group]) => {
    const businessName = groupBusinessName(group);
    const kept = [];
    (group?.items || []).forEach((item) => {
      const excluded = !item.isShipping
        && (closed.has(orderId) || Boolean(item.basketInstanceId && closedBaskets.has(item.basketInstanceId)));
      if (excluded) {
        excludedItems.push({ ...item, orderId, businessName: item.businessName || businessName });
      } else {
        kept.push(item);
      }
    });
    if (kept.some((item) => !item.isShipping)) {
      includedByOrder[orderId] = { ...group, items: kept };
    } else {
      strayShipping.push(...kept);
    }
  });

  const [hostOrderId] = Object.keys(includedByOrder);
  if (hostOrderId && strayShipping.length > 0) {
    const host = includedByOrder[hostOrderId];
    const hostItem = host.items.find((item) => !item.isShipping) || {};
    host.items = [
      ...host.items,
      ...strayShipping.map((item) => ({
        ...item,
        orderId: hostOrderId,
        businessId: host.businessId || hostItem.businessId || item.businessId,
        businessName: hostItem.businessName || item.businessName,
      })),
    ];
  }
  Object.values(includedByOrder).forEach((group) => {
    group.total = group.items.reduce((sum, item) => sum + getEstimatedLineTotal(item), 0);
  });

  return {
    includedByOrder,
    excludedItems,
    excludedBaskets: Array.from(closedBaskets.values()),
    closedOrderIds,
    excludedTotal: excludedItems.reduce((sum, item) => sum + getEstimatedLineTotal(item), 0),
    hasProducts: Object.keys(includedByOrder).length > 0,
  };
}

/**
 * Delivery dates to offer at checkout. Each farmer closes on its own: a date is
 * offered while at least one product in the cart can still arrive on it, and the
 * products that cannot are left out of the order. The cart moves to next week
 * only when nothing in it can arrive this week.
 *
 * @return {{dates: Array<string>, completeDates: Array<string>}} dates in the shown
 *   week, and those of them on which nothing is left out.
 */
export function planCartDeliveryDates({
  scheduleDoc,
  ordersById = {},
  itemsByOrder = {},
  communityName = '',
  now = new Date(),
} = {}) {
  if (!scheduleDoc || scheduleDoc.active === false) return { dates: [], completeDates: [] };

  const datedOrders = Object.values(ordersById || {}).filter((orderData) => (
    isAlwaysOnGroceryOrder(orderData)
    && isAlwaysOnGroceryOrderLive(orderData, communityName, now)
    && orderServesCommunity(orderData, communityName)
  ));
  const candidates = datedOrders.length === 0
    ? generateAvailableDeliveryDates(scheduleDoc, { now })
    : Array.from(new Set(datedOrders.flatMap((orderData) => (
      generateAvailableDeliveryDates(scheduleDoc, { now, orderData, communityName })
    )))).sort();

  const options = candidates
    .map((dateKey) => ({
      dateKey,
      split: splitCartForDeliveryDate(itemsByOrder, (orderId) => isCartOrderClosedOnDate(
        ordersById?.[orderId],
        dateKey,
        { scheduleDoc, communityName, now }
      )),
    }))
    .filter((option) => option.split.hasProducts);
  if (options.length === 0) return { dates: [], completeDates: [] };

  const currentWeekKey = getWeekKey(now);
  const shownWeekKey = options.some((option) => getWeekKey(option.dateKey) === currentWeekKey)
    ? currentWeekKey
    : getWeekKey(options[0].dateKey);
  const shown = options.filter((option) => getWeekKey(option.dateKey) === shownWeekKey);
  return {
    dates: shown.map((option) => option.dateKey),
    completeDates: shown.filter((option) => option.split.excludedItems.length === 0).map((option) => option.dateKey),
  };
}
