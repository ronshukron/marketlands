// Subscriber mode for the storefront: which delivery the customer is shopping
// for, and the weekly order's lines in the cart's item shape. Pure functions,
// so the rules can be tested without Firestore.
import { parseDateSafe, toLocalDateKey } from './deliveryScheduleUtils';

export const SUBSCRIBER_STATES = {
  NONE: 'none',
  AWAITING: 'awaiting',
  OPEN: 'open',
  SKIPPED: 'skipped',
  CLOSED: 'closed',
};

// Recent orderIds per subscription worth reading; the upcoming one is among them.
export const RECENT_ORDER_COUNT = 3;

export const todayDateKey = (now = new Date()) => toLocalDateKey(now);

export const isSubscriptionOrderOpen = (order) => Boolean(
  order
  && order.paymentStatus === 'held'
  && order.delayedOrderStatus === 'pending_weighing',
);

export const recentOrderIds = (subscription) => (
  Array.isArray(subscription?.orderIds) ? subscription.orderIds.slice(-RECENT_ORDER_COUNT) : []
);

/**
 * The delivery the storefront works on, out of the customer's active
 * subscriptions: the generated order for the nearest date from today, or, when
 * none exists yet, the subscription's next delivery date.
 * @param {Object} params
 * @param {Array<Object>} params.subscriptions basketSubscriptions docs with id
 * @param {Object} params.ordersById generated orders read so far, keyed by id
 * @param {string} params.todayKey YYYY-MM-DD
 * @return {Object} {state, subscription, order, deliveryDate, skippedDate, nextDeliveryDate}
 */
export function deriveSubscriberDelivery({ subscriptions = [], ordersById = {}, todayKey }) {
  const active = (subscriptions || []).filter((sub) => sub?.status === 'active');
  if (active.length === 0) return { state: SUBSCRIBER_STATES.NONE };

  const candidates = active.map((subscription) => {
    const upcoming = recentOrderIds(subscription)
      .map((orderId) => ordersById[orderId])
      .filter((order) => order && order.deliveryDate && order.deliveryDate >= todayKey)
      .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0] || null;
    const nextDeliveryDate = subscription.nextDeliveryDate || '';

    if (upcoming) {
      let state = SUBSCRIBER_STATES.CLOSED;
      if (upcoming.paymentStatus === 'canceled') state = SUBSCRIBER_STATES.SKIPPED;
      else if (isSubscriptionOrderOpen(upcoming)) state = SUBSCRIBER_STATES.OPEN;
      return {
        state,
        subscription,
        order: state === SUBSCRIBER_STATES.SKIPPED ? null : upcoming,
        deliveryDate: upcoming.deliveryDate,
        skippedDate: state === SUBSCRIBER_STATES.SKIPPED ? upcoming.deliveryDate : '',
        nextDeliveryDate: state === SUBSCRIBER_STATES.SKIPPED ? nextDeliveryDate : '',
      };
    }

    const skipped = Boolean(nextDeliveryDate) && (subscription.skipDates || []).includes(nextDeliveryDate);
    return {
      state: skipped ? SUBSCRIBER_STATES.SKIPPED : SUBSCRIBER_STATES.AWAITING,
      subscription,
      order: null,
      deliveryDate: nextDeliveryDate,
      skippedDate: skipped ? nextDeliveryDate : '',
      // After a skip that has no order yet, the following date is not known.
      nextDeliveryDate: skipped ? '' : nextDeliveryDate,
    };
  });

  candidates.sort((a, b) => (a.deliveryDate || '9999').localeCompare(b.deliveryDate || '9999'));
  return candidates[0];
}

const isExcluded = (order, lineId) => {
  const excluded = order?.customerExcludedLineIds;
  if (!lineId || !excluded) return false;
  return Array.isArray(excluded) ? excluded.includes(lineId) : excluded[lineId] === true;
};

export const subscriptionItemKey = (productId, selectedOption) => (
  `${productId || ''}|${selectedOption && selectedOption !== 'None' ? selectedOption : ''}`
);

/**
 * The weekly order's lines as cart items, one per product and option (lines of
 * the same product are summed, as the server merges them on the next edit).
 * @param {Object} order customerOrdersDelayed doc
 * @param {Object} [options]
 * @param {Set<string>} [options.lockedFormIds] farmer forms that are closed
 * @return {Array<Object>}
 */
export function orderToCartItems(order, { lockedFormIds = new Set() } = {}) {
  if (!order?.orderBreakdown) return [];
  const byKey = new Map();
  Object.keys(order.orderBreakdown).sort().forEach((formId) => {
    const entry = order.orderBreakdown[formId] || {};
    (entry.items || []).forEach((line, index) => {
      if (!line || line.isShipping || isExcluded(order, line.lineId)) return;
      const quantity = Number(line.quantity) || 0;
      if (quantity <= 0) return;
      const selectedOption = line.selectedOption && line.selectedOption !== 'None' ? line.selectedOption : '';
      const key = subscriptionItemKey(line.productId, selectedOption);
      const existing = byKey.get(key);
      if (existing) {
        existing.quantity = Math.round((existing.quantity + quantity) * 1000) / 1000;
        return;
      }
      byKey.set(key, {
        uid: `sub::${line.lineId || `${formId}::${line.productId}::${index}`}`,
        key,
        id: line.productId,
        name: line.productName || '',
        price: Number(line.basePrice ?? line.price) || 0,
        basePrice: Number(line.basePrice ?? line.price) || 0,
        quantityDiscountThreshold: line.quantityDiscountThreshold ?? null,
        quantityDiscountPrice: line.quantityDiscountPrice ?? null,
        selectedOption,
        quantity,
        images: Array.isArray(line.images) ? line.images : [],
        businessId: line.businessId || entry.businessId || '',
        businessName: line.businessName || entry.businessName || '',
        catalogNumber: line.catalogNumber || '',
        vatType: line.vatType ?? 3,
        measurementType: line.measurementType || 'kg',
        unitSize: Number(line.unitSize) || 1,
        averageWeightKg: Number(line.averageWeightKg) || 1,
        orderId: formId,
        lineId: line.lineId || '',
        locked: lockedFormIds.has(formId),
        isSubscriptionLine: true,
      });
    });
  });
  return [...byKey.values()];
}

/**
 * Cart items with quantities the customer set but the server has not
 * confirmed yet. A pending 0 hides the item; a pending new product is added.
 * @param {Array<Object>} items orderToCartItems result
 * @param {Object} pending key -> {item, quantity}
 * @return {Array<Object>}
 */
export function applyPendingQuantities(items, pending = {}) {
  const seen = new Set();
  const result = [];
  (items || []).forEach((item) => {
    seen.add(item.key);
    const change = pending[item.key];
    if (!change) {
      result.push(item);
      return;
    }
    if (change.quantity > 0) result.push({ ...item, quantity: change.quantity, saving: true });
  });
  Object.entries(pending).forEach(([key, change]) => {
    if (seen.has(key) || !(change.quantity > 0) || !change.item) return;
    result.push({ ...change.item, key, uid: `sub::pending::${key}`, quantity: change.quantity, saving: true });
  });
  return result;
}

const DELIVERY_OPTION_PLACES = {
  pickup: (community) => `איסוף ב${community}`,
  homeDelivery: () => 'משלוח עד הבית',
  boxCollection: (community) => `איסוף מארגז ב${community}`,
};

export function describeDeliveryPlace(subscription) {
  const community = subscription?.community || '';
  const describe = DELIVERY_OPTION_PLACES[subscription?.deliveryOption] || DELIVERY_OPTION_PLACES.pickup;
  return describe(community);
}

/** "יום רביעי, 25.11" for a YYYY-MM-DD date. */
export function formatDeliveryDay(dateKey) {
  const date = parseDateSafe(dateKey);
  if (!date) return '';
  const weekday = date.toLocaleDateString('he-IL', { weekday: 'long' });
  return `${weekday}, ${date.getDate()}.${date.getMonth() + 1}`;
}

/** "יום שני, 23.11 בשעה 20:00" for a Date. */
export function formatDeadline(value) {
  const date = parseDateSafe(value);
  if (!date) return '';
  const time = date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${formatDeliveryDay(toLocalDateKey(date))} בשעה ${time}`;
}

/** The final amount once an order is weighed, or null. */
export function getWeighedAmount(order) {
  const fromPayment = Number(order?.subscriptionPayment?.chargedSum);
  if (Number.isFinite(fromPayment) && order?.paymentStatus === 'completed') return fromPayment;
  const fromWeighing = Number(order?.weighing?.finalSum);
  return Number.isFinite(fromWeighing) && order?.weighing?.finalizedAt ? fromWeighing : null;
}
