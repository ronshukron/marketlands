import {
  BUFFER_LINE_CATALOG_NUMBER,
  INTRODUCTION_BASKET_CATALOG_NUMBER,
  ensureLineIdsInBreakdown,
  safeNumber,
  roundTo,
} from '../components/adminV5/deliveryWeighingV5/v7/orderDraftUtils';
import { flattenCustomerOrderLines } from '../services/customerOrderService';
import { filterCustomerActiveLines } from './customerOrderUtils';
import { getEffectiveUnitPrice } from './pricing';

export const REFUND_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED_PRE_CHARGE: 'approved_pre_charge',
  PENDING_MANUAL_REFUND: 'pending_manual_refund',
  MANUALLY_REFUNDED: 'manually_refunded',
  REJECTED: 'rejected',
  LEGACY_COMPLETED: 'completed',
});

export const COMPLETED_REFUND_STATUSES = Object.freeze([
  REFUND_STATUSES.APPROVED_PRE_CHARGE,
  REFUND_STATUSES.MANUALLY_REFUNDED,
  REFUND_STATUSES.LEGACY_COMPLETED,
]);

export function clampRefundPercent(refundPercent) {
  return Math.min(100, Math.max(0, safeNumber(refundPercent, 0)));
}

export function calculateDiscountedUnitPrice(unitPrice, refundPercent) {
  const percent = clampRefundPercent(refundPercent);
  return roundTo(safeNumber(unitPrice, 0) * (1 - (percent / 100)), 3);
}

export function isV7OrderEditableForRefund(order = {}, draft = {}) {
  const draftStatus = String(draft?.status || '').toLowerCase();
  const isSettlementInProgress = ['settling', 'settled', 'completed', 'charged'].includes(draftStatus);
  return !isSettlementInProgress
    && String(order.paymentStatus || '').toLowerCase() === 'held'
    && String(order.delayedOrderStatus || '').toLowerCase() === 'pending_weighing';
}

export function isUnsupportedV7RefundLine(line = {}) {
  return line.isBasketComponent === true
    || !!line.basketInstanceId
    || line.catalogNumber === BUFFER_LINE_CATALOG_NUMBER
    || line.catalogNumber === INTRODUCTION_BASKET_CATALOG_NUMBER;
}

export function getRefundStatusDetails(status) {
  switch (status) {
    case REFUND_STATUSES.PENDING:
      return {
        adminLabel: 'ממתין לטיפול',
        customerLabel: 'בקשת זיכוי בטיפול',
        customerDescription: 'בקשת הזיכוי הוגשה ונמצאת בבדיקה',
        badgeClass: 'bg-yellow-100 text-yellow-800',
      };
    case REFUND_STATUSES.APPROVED_PRE_CHARGE:
      return {
        adminLabel: 'הופחת לפני החיוב',
        customerLabel: 'הזיכוי אושר',
        customerDescription: 'הזיכוי אושר ויופחת מסכום החיוב',
        badgeClass: 'bg-green-100 text-green-800',
      };
    case REFUND_STATUSES.PENDING_MANUAL_REFUND:
      return {
        adminLabel: 'ממתין להחזר ידני',
        customerLabel: 'הזיכוי אושר — ההחזר בדרך',
        customerDescription: 'ההזמנה כבר חויבה וההחזר יבוצע ידנית',
        badgeClass: 'bg-orange-100 text-orange-800',
      };
    case REFUND_STATUSES.MANUALLY_REFUNDED:
      return {
        adminLabel: 'הוחזר ידנית',
        customerLabel: 'הזיכוי הוחזר',
        customerDescription: 'ההחזר הכספי בוצע',
        badgeClass: 'bg-green-100 text-green-800',
      };
    case REFUND_STATUSES.REJECTED:
      return {
        adminLabel: 'נדחה',
        customerLabel: 'זיכוי נדחה',
        customerDescription: 'בקשת הזיכוי נדחתה',
        badgeClass: 'bg-red-100 text-red-800',
      };
    case REFUND_STATUSES.LEGACY_COMPLETED:
      return {
        adminLabel: 'הושלם (ישן)',
        customerLabel: 'זיכוי אושר',
        customerDescription: 'בקשת הזיכוי אושרה',
        badgeClass: 'bg-green-100 text-green-800',
      };
    default:
      return {
        adminLabel: status || 'לא ידוע',
        customerLabel: status || 'לא ידוע',
        customerDescription: status || 'לא ידוע',
        badgeClass: 'bg-gray-100 text-gray-800',
      };
  }
}

export function buildRefundCompletedWhatsAppMessage({
  customerName = '',
  amount = 0,
  orderId = '',
} = {}) {
  const formattedAmount = new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(safeNumber(amount, 0));
  return [
    `שלום ${customerName || ''},`.trim(),
    '',
    `רצינו לעדכן שהזיכוי בסך ${formattedAmount} בוצע בהצלחה.`,
    orderId ? `מספר הזמנה: ${String(orderId).slice(0, 8)}` : '',
    'ייתכן שיחלפו מספר ימי עסקים עד שהזיכוי יופיע באמצעי התשלום.',
    '',
    'תודה, שוק הבסטות',
  ].filter(Boolean).join('\n');
}

export function getRefundableLinesFromOrder(order = {}) {
  if (!order?.orderBreakdown) return [];
  const { breakdown } = ensureLineIdsInBreakdown(order.id, order.orderBreakdown);
  return filterCustomerActiveLines(
    order,
    flattenCustomerOrderLines({ ...order, orderBreakdown: breakdown }),
  );
}

export function computeRefundItemAmount(lineTotal, refundPercent) {
  const percent = clampRefundPercent(refundPercent);
  return roundTo(safeNumber(lineTotal, 0) * (percent / 100), 2);
}

export function buildRefundItems(selectedLines, percentByLineId) {
  return selectedLines.map((line) => {
    const refundPercent = safeNumber(percentByLineId[line.lineId], 100);
    const lineTotal = safeNumber(
      line.lineTotal,
      safeNumber(line.quantity) * getEffectiveUnitPrice(line),
    );
    return {
      lineId: line.lineId,
      productId: line.productId || '',
      productName: line.productName || '',
      businessName: line.businessName || '',
      businessOrderKey: line.businessOrderKey || '',
      lineTotal,
      refundPercent,
      refundAmount: computeRefundItemAmount(lineTotal, refundPercent),
    };
  });
}

export function sumRefundAmount(refundItems = []) {
  return roundTo(
    refundItems.reduce((sum, item) => sum + safeNumber(item.refundAmount, 0), 0),
    2,
  );
}
