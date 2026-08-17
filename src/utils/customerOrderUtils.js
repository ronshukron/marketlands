import { getEndingTimeForSpot } from './orderUtils';
import { isDeliveryDateOrderable } from './deliveryScheduleUtils';

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

export function isCustomerBusinessLineEditable({
  customerOrder,
  businessOrderData,
  deliveryDate = '',
  deliverySchedule = null,
  pickupSpot = '',
  now = new Date(),
}) {
  if (!isCustomerOrderStatusEditable(customerOrder) || !businessOrderData) return false;

  const businessEndingTime = getEndingTimeForSpot(businessOrderData, pickupSpot);
  if (businessEndingTime && now >= businessEndingTime) return false;

  if (deliveryDate) {
    if (!deliverySchedule) return false;
    if (!isDeliveryDateOrderable(
      deliveryDate,
      deliverySchedule,
      now,
      businessOrderData,
      pickupSpot,
    )) {
      return false;
    }
  }

  // Fail closed when neither the classic business deadline nor a delivery
  // schedule establishes an edit window.
  return Boolean(businessEndingTime || deliveryDate);
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
