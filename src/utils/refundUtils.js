import { ensureLineIdsInBreakdown, safeNumber, roundTo } from '../components/adminV5/deliveryWeighingV5/v7/orderDraftUtils';
import { flattenCustomerOrderLines } from '../services/customerOrderService';
import { filterCustomerActiveLines } from './customerOrderUtils';
import { getEffectiveUnitPrice } from './pricing';

export function getRefundableLinesFromOrder(order = {}) {
  if (!order?.orderBreakdown) return [];
  const { breakdown } = ensureLineIdsInBreakdown(order.id, order.orderBreakdown);
  return filterCustomerActiveLines(
    order,
    flattenCustomerOrderLines({ ...order, orderBreakdown: breakdown }),
  );
}

export function computeRefundItemAmount(lineTotal, refundPercent) {
  const percent = Math.min(100, Math.max(0, safeNumber(refundPercent, 0)));
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
