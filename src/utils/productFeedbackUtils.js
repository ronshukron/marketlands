import { normalizeCustomerOrderStatus } from './customerOrderUtils';

export const PRODUCT_FEEDBACK_MIN_LENGTH = 10;
export const PRODUCT_FEEDBACK_MAX_LENGTH = 1000;
export const PRODUCT_FEEDBACK_MAX_TAGS = 6;
export const PRODUCT_FEEDBACK_DISMISS_REASON_MAX = 300;

export const PRODUCT_FEEDBACK_DISMISS_PRESETS = Object.freeze([
  'בדיקה',
  'הלקוח קיבל מוצר אחר',
  'ביקורת לא רלוונטית',
]);

export const PRODUCT_FEEDBACK_TAGS = Object.freeze([
  'טרי',
  'טעים',
  'כמו בתמונה',
  'לא טרי',
  'קטן מהצפוי',
  'הגיע פגום',
]);

export const PRODUCT_FEEDBACK_SOURCES = Object.freeze(['homepage', 'order_detail']);

const PURCHASED_STATUSES = new Set(['paid', 'completed', 'charged', 'settled']);

export const normalizeFeedbackText = (value) => String(value || '').trim();

export const normalizeFeedbackTags = (tags) => {
  const allowed = new Set(PRODUCT_FEEDBACK_TAGS);
  const unique = [];
  (Array.isArray(tags) ? tags : []).forEach((tag) => {
    const value = String(tag || '').trim();
    if (!allowed.has(value) || unique.includes(value)) return;
    unique.push(value);
  });
  return unique;
};

export const isDismissedProductFeedback = (review = {}) => review?.dismissed === true;

export const validateDismissReason = (reason) => {
  const text = String(reason || '').trim();
  if (!text) return 'יש לכתוב למה הביקורת מנוטרלת';
  if (text.length > PRODUCT_FEEDBACK_DISMISS_REASON_MAX) {
    return `הסיבה יכולה להכיל עד ${PRODUCT_FEEDBACK_DISMISS_REASON_MAX} תווים`;
  }
  return '';
};

export const validateProductFeedback = ({ rating, feedback, tags } = {}) => {
  const numericRating = Number(rating);
  const text = normalizeFeedbackText(feedback);

  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    return 'יש לבחור דירוג בין 1 ל־5';
  }
  if (text.length > 0 && text.length < PRODUCT_FEEDBACK_MIN_LENGTH) {
    return `כדי שהמשוב יהיה מועיל, יש לכתוב לפחות ${PRODUCT_FEEDBACK_MIN_LENGTH} תווים`;
  }
  if (text.length > PRODUCT_FEEDBACK_MAX_LENGTH) {
    return `המשוב יכול להכיל עד ${PRODUCT_FEEDBACK_MAX_LENGTH} תווים`;
  }
  if (tags != null) {
    if (!Array.isArray(tags) || tags.length > PRODUCT_FEEDBACK_MAX_TAGS) {
      return `ניתן לבחור עד ${PRODUCT_FEEDBACK_MAX_TAGS} תגיות`;
    }
    const allowed = new Set(PRODUCT_FEEDBACK_TAGS);
    if (tags.some((tag) => !allowed.has(String(tag || '').trim()))) {
      return 'תגית לא תקינה';
    }
  }
  return '';
};

export const isPurchasedOrder = (order = {}) => {
  const paymentStatus = normalizeCustomerOrderStatus(order.paymentStatus || order.status);
  const delayedStatus = normalizeCustomerOrderStatus(order.delayedOrderStatus);
  // Weekly orders stay "held" until weighing, including after the cartons are packed.
  if (paymentStatus === 'held' && delayedStatus === 'pending_weighing') return true;
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

const textValue = (value) => String(value || '').trim();

export const attachProductFeedbackContext = (review = {}, {
  order = null,
  refunds = [],
  refundsLoaded = true,
} = {}) => {
  const details = order?.customerDetails || {};
  const relatedRefunds = (Array.isArray(refunds) ? refunds : [])
    .filter((refund) => refund?.orderId && refund.orderId === review.orderId);
  const lineRefund = relatedRefunds.find((refund) => (
    Array.isArray(refund.refundItems)
    && refund.refundItems.some((item) => item?.lineId && item.lineId === review.lineId)
  )) || null;
  const orderRefund = lineRefund || relatedRefunds[0] || null;
  const lineItem = lineRefund?.refundItems?.find((item) => item?.lineId === review.lineId) || null;

  return {
    ...review,
    customerName: textValue(details.name) || textValue(orderRefund?.userName),
    customerPhone: textValue(details.phone) || textValue(orderRefund?.userPhone),
    customerEmail: textValue(details.email) || textValue(orderRefund?.userEmail),
    pickupSpot: textValue(details.pickupSpot) || textValue(order?.community) || textValue(order?.fulfillment?.community),
    refundsLoaded,
    refundRequested: refundsLoaded && relatedRefunds.length > 0,
    refundForThisLine: refundsLoaded && Boolean(lineRefund),
    refundStatus: orderRefund?.status || '',
    refundReason: textValue(orderRefund?.reason),
    refundId: orderRefund?.id || '',
    refundAmount: lineItem?.refundAmount ?? null,
  };
};

export const buildProductFeedbackId = (orderId, lineId) => {
  const normalizedOrderId = String(orderId || '');
  const normalizedLineId = String(lineId || '');
  if (!normalizedOrderId || !normalizedLineId || normalizedOrderId.includes('/') || normalizedLineId.includes('/')) {
    throw new Error('מזהה שורת ההזמנה אינו תקין');
  }
  return `${normalizedOrderId}~${normalizedLineId}`;
};
