import {
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import {
  ensureLineIdsInBreakdown,
  flattenOrderBreakdown,
  recomputeBreakdownTotals,
  roundTo,
  safeNumber,
} from '../components/adminV5/deliveryWeighingV5/v7/orderDraftUtils';
import { filterCustomerActiveLines } from '../utils/customerOrderUtils';
import {
  REFUND_STATUSES,
  calculateDiscountedUnitPrice,
  isUnsupportedV7RefundLine,
  isV7OrderEditableForRefund,
  sumRefundAmount,
} from '../utils/refundUtils';

const MANUAL_REASONS = Object.freeze({
  EXTERNAL_ORDER: 'external_order',
  ORDER_NOT_FOUND: 'order_not_found',
  ORDER_NOT_EDITABLE: 'order_not_editable',
  NO_LINE_ITEMS: 'no_line_items',
  LINE_NOT_FOUND: 'line_not_found',
  UNSUPPORTED_LINE: 'unsupported_line',
});

function locateLine(orderBreakdown, lineId) {
  for (const [businessOrderKey, businessOrder] of Object.entries(orderBreakdown || {})) {
    const itemIndex = (businessOrder?.items || []).findIndex((item) => item.lineId === lineId);
    if (itemIndex !== -1) return { businessOrderKey, itemIndex };
  }
  return null;
}

function buildManualPlan(reason) {
  return { canApply: false, reason };
}

export function buildV7RefundDiscountPlan({
  orderId,
  orderData,
  draftData,
  refundId,
  refundItems = [],
}) {
  if (!orderId) return buildManualPlan(MANUAL_REASONS.EXTERNAL_ORDER);
  if (!orderData) return buildManualPlan(MANUAL_REASONS.ORDER_NOT_FOUND);
  if (orderData.communityDiscountPreparation?.status === 'prepared') {
    return buildManualPlan(MANUAL_REASONS.ORDER_NOT_EDITABLE);
  }
  if (!isV7OrderEditableForRefund(orderData, draftData)) {
    return buildManualPlan(MANUAL_REASONS.ORDER_NOT_EDITABLE);
  }
  if (!Array.isArray(refundItems) || refundItems.length === 0) {
    return buildManualPlan(MANUAL_REASONS.NO_LINE_ITEMS);
  }

  const { breakdown } = ensureLineIdsInBreakdown(orderId, orderData.orderBreakdown || {});
  const targets = [];
  const seenLineIds = new Set();

  for (const refundItem of refundItems) {
    if (!refundItem?.lineId || seenLineIds.has(refundItem.lineId)) {
      return buildManualPlan(MANUAL_REASONS.LINE_NOT_FOUND);
    }
    seenLineIds.add(refundItem.lineId);
    const location = locateLine(breakdown, refundItem.lineId);
    if (!location) return buildManualPlan(MANUAL_REASONS.LINE_NOT_FOUND);
    const line = breakdown[location.businessOrderKey].items[location.itemIndex];
    if (isUnsupportedV7RefundLine(line)) {
      return buildManualPlan(MANUAL_REASONS.UNSUPPORTED_LINE);
    }
    targets.push({ refundItem, location });
  }

  const nextBreakdown = { ...breakdown };
  const appliedItems = [];

  targets.forEach(({ refundItem, location }) => {
    const businessOrder = nextBreakdown[location.businessOrderKey];
    const items = [...businessOrder.items];
    const line = items[location.itemIndex];
    const alreadyApplied = line.refundRequestId === refundId;
    const originalUnitPrice = alreadyApplied
      ? safeNumber(line.refundOriginalUnitPrice, line.price)
      : safeNumber(line.price);
    const discountedUnitPrice = alreadyApplied
      ? safeNumber(line.price)
      : calculateDiscountedUnitPrice(originalUnitPrice, refundItem.refundPercent);
    const estimatedChargeQuantity = safeNumber(
      line.estimatedChargeQuantity ?? line.quantity,
      0,
    );

    items[location.itemIndex] = {
      ...line,
      price: discountedUnitPrice,
      effectivePrice: discountedUnitPrice,
      estimatedLineTotal: roundTo(estimatedChargeQuantity * discountedUnitPrice, 2),
      refundOriginalUnitPrice: originalUnitPrice,
      refundAppliedPercent: safeNumber(refundItem.refundPercent, 0),
      refundRequestId: refundId,
    };
    nextBreakdown[location.businessOrderKey] = { ...businessOrder, items };
    appliedItems.push({
      ...refundItem,
      originalUnitPrice,
      discountedUnitPrice,
    });
  });

  const orderBreakdown = recomputeBreakdownTotals(nextBreakdown);
  const items = flattenOrderBreakdown(orderBreakdown);
  const activeItems = filterCustomerActiveLines(orderData, items);
  const deliveryFee = safeNumber(orderData.customerDetails?.deliveryDetails?.deliveryFee, 0);
  const grandTotal = roundTo(
    activeItems.reduce(
      (sum, item) => sum + (safeNumber(item.quantity) * safeNumber(item.price)),
      0,
    ) + deliveryFee,
    2,
  );

  return {
    canApply: true,
    orderBreakdown,
    items,
    grandTotal,
    appliedItems,
  };
}

export async function approveRefundRequest({ refundId, adminId, refundItemsOverride }) {
  if (!refundId || !adminId) throw new Error('Refund and admin IDs are required.');

  return runTransaction(db, async (transaction) => {
    const refundRef = doc(db, 'refunds', refundId);
    const refundSnap = await transaction.get(refundRef);
    if (!refundSnap.exists()) throw new Error('Refund request not found.');

    const refund = refundSnap.data() || {};
    if (refund.status !== REFUND_STATUSES.PENDING) {
      return { status: refund.status, alreadyProcessed: true };
    }

    const refundItems = Array.isArray(refundItemsOverride)
      ? refundItemsOverride
      : refund.refundItems;
    const approvedRefundAmount = Array.isArray(refundItems) && refundItems.length > 0
      ? sumRefundAmount(refundItems)
      : safeNumber(refund.requestedRefundAmount ?? refund.orderAmount, 0);

    let orderRef = null;
    let orderData = null;
    let draftData = null;
    if (refund.orderId) {
      orderRef = doc(db, 'customerOrdersDelayed', refund.orderId);
      const orderSnap = await transaction.get(orderRef);
      if (orderSnap.exists()) {
        orderData = orderSnap.data() || {};
        if (orderData.deliveryWeekKey) {
          const draftRef = doc(
            db,
            'deliveryRealtimeV7',
            orderData.deliveryWeekKey,
            'drafts',
            refund.orderId,
          );
          const draftSnap = await transaction.get(draftRef);
          if (draftSnap.exists()) draftData = draftSnap.data() || {};
        }
      }
    }

    const plan = buildV7RefundDiscountPlan({
      orderId: refund.orderId,
      orderData,
      draftData,
      refundId,
      refundItems,
    });

    if (!plan.canApply) {
      transaction.update(refundRef, {
        status: REFUND_STATUSES.PENDING_MANUAL_REFUND,
        approvedRefundAmount,
        refundItems: Array.isArray(refundItems) ? refundItems : [],
        manualRefundReason: plan.reason,
        processedAt: serverTimestamp(),
        processedBy: adminId,
      });
      return {
        status: REFUND_STATUSES.PENDING_MANUAL_REFUND,
        approvedRefundAmount,
        reason: plan.reason,
      };
    }

    transaction.update(orderRef, {
      orderBreakdown: plan.orderBreakdown,
      items: plan.items,
      grandTotal: plan.grandTotal,
      refundAdjustedAt: serverTimestamp(),
      refundAdjustedBy: adminId,
      refundRequestId: refundId,
    });
    transaction.update(refundRef, {
      status: REFUND_STATUSES.APPROVED_PRE_CHARGE,
      approvedRefundAmount,
      refundItems: plan.appliedItems,
      processedAt: serverTimestamp(),
      processedBy: adminId,
      appliedToOrderAt: serverTimestamp(),
    });

    return {
      status: REFUND_STATUSES.APPROVED_PRE_CHARGE,
      approvedRefundAmount,
      grandTotal: plan.grandTotal,
      refundItems: plan.appliedItems,
    };
  });
}

export async function markManualRefundCompleted({ refundId, adminId }) {
  if (!refundId || !adminId) throw new Error('Refund and admin IDs are required.');
  await runTransaction(db, async (transaction) => {
    const refundRef = doc(db, 'refunds', refundId);
    const refundSnap = await transaction.get(refundRef);
    if (!refundSnap.exists()) throw new Error('Refund request not found.');
    if (refundSnap.data()?.status !== REFUND_STATUSES.PENDING_MANUAL_REFUND) {
      throw new Error('Refund request is not awaiting a manual refund.');
    }
    transaction.update(refundRef, {
      status: REFUND_STATUSES.MANUALLY_REFUNDED,
      manualRefundCompletedAt: serverTimestamp(),
      manualRefundCompletedBy: adminId,
    });
  });
}

export { MANUAL_REASONS };
