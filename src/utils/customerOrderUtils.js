import { getEndingTimeForSpot, isOrderActiveNow } from './orderUtils';
import { isAlwaysOnGroceryOrder, isDeliveryDateOrderable } from './deliveryScheduleUtils';
import { resolveCommunityName } from '../services/pickupSpotsService';

const REGULAR_SUCCESSFUL_PAYMENT_STATUSES = new Set(['completed', 'paid']);
const COMPLETED_PAYMENT_STATUSES = new Set(['completed', 'paid', 'charged', 'settled']);
const COMPLETED_DELAYED_STATUSES = new Set(['completed', 'charged', 'settled']);
const TERMINAL_FAILURE_STATUSES = new Set([
  'abandoned',
  'cancelled',
  'cancelled_by_admin',
  'failed',
  'declined',
  'expired',
]);
const REGULAR_EDITABLE_PAYMENT_STATUSES = new Set(['completed', 'paid']);

export function normalizeCustomerOrderStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function isTerminalCustomerOrderStatus(value) {
  return TERMINAL_FAILURE_STATUSES.has(normalizeCustomerOrderStatus(value));
}

export function isSuccessfulRegularCustomerOrder(order = {}) {
  return REGULAR_SUCCESSFUL_PAYMENT_STATUSES.has(
    normalizeCustomerOrderStatus(order.paymentStatus),
  );
}

export function isSuccessfulDelayedCustomerOrder(order = {}) {
  const paymentStatus = normalizeCustomerOrderStatus(order.paymentStatus);
  const delayedStatus = normalizeCustomerOrderStatus(order.delayedOrderStatus);
  if (isTerminalCustomerOrderStatus(paymentStatus) || isTerminalCustomerOrderStatus(delayedStatus)) {
    return false;
  }
  if (paymentStatus === 'held' && delayedStatus === 'pending_weighing') return true;
  return COMPLETED_PAYMENT_STATUSES.has(paymentStatus)
    || COMPLETED_DELAYED_STATUSES.has(delayedStatus);
}

export function isCustomerOrderOwner(order, userId) {
  return Boolean(order?.userId && userId && order.userId === userId);
}

export function isCustomerOrderStatusEditable(order = {}) {
  const paymentStatus = normalizeCustomerOrderStatus(order.paymentStatus);
  const delayedStatus = normalizeCustomerOrderStatus(order.delayedOrderStatus);
  if (isTerminalCustomerOrderStatus(paymentStatus) || isTerminalCustomerOrderStatus(delayedStatus)) {
    return false;
  }

  const isDelayed = order.isDelayedOrder === true
    || order.delayedOrder === true
    || Boolean(delayedStatus);
  if (isDelayed) {
    return paymentStatus === 'held' && delayedStatus === 'pending_weighing';
  }
  return REGULAR_EDITABLE_PAYMENT_STATUSES.has(paymentStatus);
}

function getBusinessEndingTime(businessOrderData = {}, pickupSpot = '') {
  const resolved = resolveCommunityName(pickupSpot) || pickupSpot;
  const keys = [pickupSpot, resolved].filter(Boolean);
  const bySpot = businessOrderData.endingTimeByPickupSpot || {};
  Object.keys(bySpot).forEach((key) => {
    if ((resolveCommunityName(key) || key) === resolved) keys.push(key);
  });

  for (const key of [...new Set(keys)]) {
    const endingTime = getEndingTimeForSpot(businessOrderData, key);
    if (endingTime) return endingTime;
  }
  return getEndingTimeForSpot(businessOrderData, '');
}

export function isCustomerBusinessLineEditable({
  customerOrder,
  businessOrderData,
  deliveryDate = '',
  deliverySchedule = null,
  pickupSpot = '',
  now = new Date(),
}) {
  if (!isCustomerOrderStatusEditable(customerOrder) || !businessOrderData) return false;

  // Always-on grocery lines close with the delivery schedule. Classic lines
  // close at the business ending time, even when the order also has a delivery date.
  if (isAlwaysOnGroceryOrder(businessOrderData)) {
    if (!deliveryDate || !deliverySchedule) return false;
    return isDeliveryDateOrderable(
      deliveryDate,
      deliverySchedule,
      now,
      businessOrderData,
      pickupSpot,
    );
  }

  const businessEndingTime = getBusinessEndingTime(businessOrderData, pickupSpot);
  if (businessEndingTime) return now < businessEndingTime;

  if (businessOrderData.orderType === 'recurring' && Array.isArray(businessOrderData.schedule)) {
    return isOrderActiveNow(businessOrderData.schedule);
  }

  return false;
}

export function isCustomerLineExcluded(order = {}, lineOrId = '') {
  const lineId = typeof lineOrId === 'string' ? lineOrId : lineOrId?.lineId;
  if (!lineId) return false;
  const excludedLineIds = order.customerExcludedLineIds;
  if (Array.isArray(excludedLineIds)) return excludedLineIds.includes(lineId);
  return Boolean(excludedLineIds?.[lineId]);
}

export function filterCustomerActiveLines(order = {}, lines = []) {
  return (lines || []).filter((line) => !isCustomerLineExcluded(order, line));
}
