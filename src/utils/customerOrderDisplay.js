import {
  getAverageWeightKg,
  getBufferedDisplayQuantity,
  getEffectiveUnitPrice,
  getEstimatedChargeableQuantity,
} from './pricing';
import {
  filterCustomerActiveLines,
  isTerminalCustomerOrderStatus,
  normalizeCustomerOrderStatus,
} from './customerOrderUtils';
import { parseDateSafe } from './deliveryScheduleUtils';

const roundTo2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const formatDecimal = (value) => String(roundTo2(value));
const isFiniteNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

const COMPLETED_STATUSES = new Set(['completed', 'paid', 'charged', 'settled']);
const PENDING_STATUSES = new Set(['pending_payment', 'pending', 'created_in_fe', 'pending_authorization']);

export const STATUS_BADGE_CLASSES = Object.freeze({
  green: 'bg-green-100 text-green-800',
  blue: 'bg-blue-100 text-blue-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  red: 'bg-red-100 text-red-800',
  gray: 'bg-gray-100 text-gray-800',
});

export function isDelayedCustomerOrder(order = {}) {
  return order.customerOrderSource === 'customerOrdersDelayed'
    || order.isDelayedOrder === true
    || Boolean(order.delayedOrderStatus);
}

export function hasFinalCharge(order = {}) {
  return isFiniteNumber(order.weighing?.finalSum);
}

export function getCustomerOrderStatusInfo(order = {}) {
  const raw = order.paymentStatus || order.status || order.orderBreakdown?.paymentStatus || '';
  const payment = normalizeCustomerOrderStatus(raw);
  const delayed = normalizeCustomerOrderStatus(order.delayedOrderStatus);

  if (isTerminalCustomerOrderStatus(payment) || isTerminalCustomerOrderStatus(delayed)) {
    return { label: 'בוטלה', tone: 'red' };
  }
  if (payment === 'refunded') return { label: 'הוחזרה', tone: 'red' };
  if (isDelayedCustomerOrder(order)) {
    if (hasFinalCharge(order) || COMPLETED_STATUSES.has(delayed) || COMPLETED_STATUSES.has(payment)) {
      return { label: 'הושלמה וחויבה', tone: 'green' };
    }
    if (payment === 'held') return { label: 'התקבלה - תחויב לאחר שקילה', tone: 'blue' };
  }
  if (COMPLETED_STATUSES.has(payment)) return { label: 'שולמה', tone: 'green' };
  if (payment === 'held') return { label: 'התקבלה', tone: 'blue' };
  if (PENDING_STATUSES.has(payment)) return { label: 'ממתינה לתשלום', tone: 'yellow' };
  return { label: raw || 'לא ידוע', tone: 'gray' };
}

export function getCustomerLineDisplayQuantity(item = {}) {
  const qty = Number(item.quantity) || 0;
  if ((item.measurementType || 'kg') !== 'kg') return qty;
  if (Number(item.displayQuantity) > 0) return Number(item.displayQuantity);
  return getBufferedDisplayQuantity(item, item.weightBufferPercent || 0);
}

// "1.05 ק"ג" (incl. weight buffer), "2 יח' (~0.6 ק"ג)", "3 מארז". Empty for price-only lines.
export function formatCustomerLineQuantity(item = {}) {
  if (item.isBasketAdjustment) return '';
  const type = item.measurementType || 'kg';
  const qty = Number(item.quantity) || 0;
  if (type === 'package') return `${Math.round(qty)} מארז`;
  if (type === 'unit') {
    const units = Math.round(qty);
    return `${units} יח' (~${formatDecimal(units * getAverageWeightKg(item))} ק"ג)`;
  }
  return `${formatDecimal(getCustomerLineDisplayQuantity(item))} ק"ג`;
}

// Estimated line amount as shown at checkout (kg lines include the weight buffer).
export function getCustomerLineEstimatedTotal(item = {}) {
  if (isFiniteNumber(item.estimatedHoldLineTotal)) return roundTo2(item.estimatedHoldLineTotal);
  if (isFiniteNumber(item.estimatedLineTotal)) return roundTo2(item.estimatedLineTotal);
  return roundTo2(getEstimatedChargeableQuantity(item) * getEffectiveUnitPrice(item));
}

export function getWeighedLinesById(order = {}) {
  const lines = order.weighing?.finalInvoiceLines;
  if (!Array.isArray(lines)) return {};
  return Object.fromEntries(lines.filter((line) => line?.lineId).map((line) => [line.lineId, line]));
}

export function isLineRemovedAtWeighing(order = {}, lineId = '') {
  return Boolean(lineId && order.weighing?.removedLineIds?.[lineId]);
}

export function formatWeighedQuantity(line = {}) {
  const qty = Number(line.actualQuantity) || 0;
  if ((line.measurementType || 'kg') === 'package') return `${Math.round(qty)} מארז`;
  return `${formatDecimal(qty)} ק"ג`;
}

export function getCustomerOrderDisplayTotal(order = {}) {
  if (hasFinalCharge(order)) {
    return {
      amount: roundTo2(order.weighing.finalSum),
      label: 'סה"כ שחויב',
      isFinal: true,
      isEstimate: false,
    };
  }

  const breakdown = order.orderBreakdown || {};
  const hasBreakdownItems = Object.values(breakdown).some((business) => Array.isArray(business?.items));
  const deliveryFee = Number(order.customerDetails?.deliveryDetails?.deliveryFee) || 0;
  const amount = hasBreakdownItems
    ? Object.values(breakdown).reduce((sum, business) => (
      sum + filterCustomerActiveLines(order, business?.items || [])
        .reduce((inner, item) => inner + getCustomerLineEstimatedTotal(item), 0)
    ), 0) + deliveryFee
    : Number(order.grandTotal || order.totalAmount || 0);

  const isEstimate = isDelayedCustomerOrder(order) || order.isIndependent === true;
  return {
    amount: roundTo2(amount),
    label: isEstimate ? 'סכום משוער' : 'סה"כ ששולם',
    isFinal: false,
    isEstimate,
  };
}

export function formatCustomerDeliveryDate(value) {
  const date = parseDateSafe(value);
  if (!date) return value ? String(value) : '';
  return date.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
