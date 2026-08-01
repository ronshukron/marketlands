import { normalizeCustomerOrderStatus } from './customerOrderUtils';

export const PRODUCT_FEEDBACK_MIN_LENGTH = 10;
export const PRODUCT_FEEDBACK_MAX_LENGTH = 1000;

const PURCHASED_STATUSES = new Set(['paid', 'completed', 'charged', 'settled']);

export const normalizeFeedbackText = (value) => String(value || '').trim();

export const validateProductFeedback = ({ rating, feedback } = {}) => {
  const numericRating = Number(rating);
  const text = normalizeFeedbackText(feedback);

  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    return 'יש לבחור דירוג בין 1 ל־5';
  }
  if (text.length < PRODUCT_FEEDBACK_MIN_LENGTH) {
    return `כדי שהמשוב יהיה מועיל, יש לכתוב לפחות ${PRODUCT_FEEDBACK_MIN_LENGTH} תווים`;
  }
  if (text.length > PRODUCT_FEEDBACK_MAX_LENGTH) {
    return `המשוב יכול להכיל עד ${PRODUCT_FEEDBACK_MAX_LENGTH} תווים`;
  }
  return '';
};

export const isPurchasedOrder = (order = {}) => {
  const paymentStatus = normalizeCustomerOrderStatus(order.paymentStatus || order.status);
  const delayedStatus = normalizeCustomerOrderStatus(order.delayedOrderStatus);
  return PURCHASED_STATUSES.has(paymentStatus) || PURCHASED_STATUSES.has(delayedStatus);
};

export const isProductFeedbackEligible = ({
  order,
  line,
  userId,
} = {}) => Boolean(
  userId
  && order?.userId === userId
  && isPurchasedOrder(order)
  && line?.lineId
  && line?.productId
  && line?.isShipping !== true
  && order?.customerExcludedLineIds?.[line.lineId] !== true
);

export const buildProductFeedbackId = (orderId, lineId) => {
  const normalizedOrderId = String(orderId || '');
  const normalizedLineId = String(lineId || '');
  if (!normalizedOrderId || !normalizedLineId || normalizedOrderId.includes('/') || normalizedLineId.includes('/')) {
    throw new Error('מזהה שורת ההזמנה אינו תקין');
  }
  return `${normalizedOrderId}~${normalizedLineId}`;
};
