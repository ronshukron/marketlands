import { getEstimatedLineTotal, roundTo2 } from './pricing';
import {
  isCustomerLineExcluded,
  isSuccessfulDelayedCustomerOrder,
  isSuccessfulRegularCustomerOrder,
} from './customerOrderUtils';

const SHIPPING_PRODUCT_ID = 'Mdean61FIezxRcMUZjVn';

const numberOr = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalize = (value) => String(value || '').trim().toLowerCase();

export function parseLineId(lineId) {
  if (!lineId) return null;
  const value = String(lineId);
  const parts = value.split('::');
  if (parts[0] === 'basket') {
    return { lineId: value, kind: 'basket', basketInstanceId: parts.slice(1).join('::') };
  }
  if (parts.length < 4) return null;

  const canonical = parts.length >= 5;
  return {
    lineId: value,
    kind: 'product',
    orderId: parts[0] || '',
    itemToken: parts[1] || '',
    itemTokenNorm: normalize(parts[1]),
    businessOrderKey: canonical ? (parts[2] || '') : '',
    selectedOption: canonical
      ? parts.slice(3, -1).join('::')
      : parts.slice(2, -1).join('::'),
    optionNorm: normalize(canonical
      ? parts.slice(3, -1).join('::')
      : parts.slice(2, -1).join('::')),
    lineSeed: parts[parts.length - 1] || '',
  };
}

export function isPaidWeeklySummaryOrder(order = {}, isDelayed = false) {
  return isDelayed
    ? isSuccessfulDelayedCustomerOrder(order)
    : isSuccessfulRegularCustomerOrder(order);
}

function checkoutTotal(item) {
  const saved = Number(item?.estimatedLineTotal);
  return roundTo2(Number.isFinite(saved) ? saved : getEstimatedLineTotal(item));
}

function flattenCheckoutLines(order) {
  const lines = [];
  Object.entries(order?.orderBreakdown || {}).forEach(([businessOrderKey, businessOrder]) => {
    (businessOrder?.items || []).forEach((item, index) => {
      if (item?.isShipping || item?.productId === SHIPPING_PRODUCT_ID || isCustomerLineExcluded(order, item)) return;
      lines.push({
        ...item,
        checkoutIndex: index,
        businessOrderKey,
        businessId: item?.businessId || businessOrder?.businessId || '',
        businessName: item?.businessName || businessOrder?.businessName || '',
        productId: item?.productId || item?.id || '',
        productName: item?.productName || item?.name || 'פריט',
        selectedOption: item?.selectedOption || '',
        estimatedTotal: checkoutTotal(item),
        estimatedQuantity: numberOr(item?.estimatedChargeQuantity, numberOr(item?.quantity)),
      });
    });
  });
  return lines;
}

function parsedLineMatches(invoiceLine, checkoutLine) {
  const parsed = parseLineId(invoiceLine?.lineId);
  if (!parsed || parsed.kind !== 'product') return false;
  if (parsed.businessOrderKey && parsed.businessOrderKey !== checkoutLine.businessOrderKey) return false;
  const itemTokens = [
    checkoutLine.productId,
    checkoutLine.id,
    checkoutLine.productName,
    checkoutLine.name,
  ].map(normalize).filter(Boolean);
  return itemTokens.includes(parsed.itemTokenNorm)
    && parsed.optionNorm === normalize(checkoutLine.selectedOption);
}

function findCheckoutIndex(invoiceLine, checkoutLines, usedIndexes) {
  if (invoiceLine?.lineId) {
    const exact = checkoutLines.findIndex(
      (line, index) => !usedIndexes.has(index) && line.lineId === invoiceLine.lineId,
    );
    if (exact >= 0) return exact;
  }
  return checkoutLines.findIndex(
    (line, index) => !usedIndexes.has(index) && parsedLineMatches(invoiceLine, line),
  );
}

function chargedLine(invoiceLine, checkoutLine = null) {
  const parsed = parseLineId(invoiceLine?.lineId);
  return {
    lineId: invoiceLine?.lineId || '',
    productId: invoiceLine?.productId || checkoutLine?.productId || parsed?.itemToken || '',
    productName: invoiceLine?.productName || checkoutLine?.productName || 'פריט נוסף בשקילה',
    selectedOption: invoiceLine?.selectedOption || checkoutLine?.selectedOption || '',
    businessOrderKey: checkoutLine?.businessOrderKey || parsed?.businessOrderKey || '',
    businessId: invoiceLine?.businessId || checkoutLine?.businessId || '',
    businessName: invoiceLine?.businessName || checkoutLine?.businessName || '',
    measurementType: invoiceLine?.measurementType || checkoutLine?.measurementType || 'kg',
    actualQuantity: numberOr(invoiceLine?.actualQuantity),
    estimatedQuantity: numberOr(checkoutLine?.estimatedQuantity),
    estimatedTotal: checkoutLine?.estimatedTotal || 0,
    chargedTotal: roundTo2(numberOr(invoiceLine?.linePrice)),
    source: checkoutLine ? 'weighed' : (parsed?.kind === 'basket' ? 'basket' : 'additional'),
    isAdditional: !checkoutLine,
    isIntroductionBasket: invoiceLine?.isIntroductionBasket === true || parsed?.kind === 'basket',
  };
}

function reconcileDelayed(order, checkoutLines, deliveryFee) {
  const invoiceLines = Array.isArray(order?.weighing?.finalInvoiceLines)
    ? order.weighing.finalInvoiceLines
    : (Array.isArray(order?.finalInvoiceLines) ? order.finalInvoiceLines : []);
  const usedIndexes = new Set();
  const coveredLineIds = new Set();

  invoiceLines.forEach((line) => {
    (line?.componentLineIds || []).forEach((lineId) => coveredLineIds.add(lineId));
  });

  const lines = invoiceLines.map((invoiceLine) => {
    const index = findCheckoutIndex(invoiceLine, checkoutLines, usedIndexes);
    if (index >= 0) usedIndexes.add(index);
    const matched = index >= 0 ? checkoutLines[index] : null;

    if (!matched && (invoiceLine?.isIntroductionBasket || parseLineId(invoiceLine?.lineId)?.kind === 'basket')) {
      const basketId = invoiceLine?.basketInstanceId || parseLineId(invoiceLine?.lineId)?.basketInstanceId;
      const basketItems = checkoutLines.filter((line, checkoutIndex) => {
        const belongs = line?.basketInstanceId && line.basketInstanceId === basketId;
        if (belongs) usedIndexes.add(checkoutIndex);
        return belongs;
      });
      const aggregate = basketItems.length ? {
        productId: invoiceLine?.productId || basketItems[0]?.basketId || '',
        productName: invoiceLine?.productName || basketItems[0]?.basketTitle || 'סל היכרות',
        businessOrderKey: '',
        businessId: '',
        businessName: 'סלי היכרות',
        selectedOption: '',
        measurementType: 'package',
        estimatedQuantity: 1,
        estimatedTotal: roundTo2(basketItems.reduce((sum, item) => sum + item.estimatedTotal, 0)),
      } : null;
      return chargedLine(invoiceLine, aggregate);
    }
    return chargedLine(invoiceLine, matched);
  });

  const missingLines = checkoutLines
    .filter((line, index) => !usedIndexes.has(index) && !coveredLineIds.has(line.lineId))
    .map((line) => ({ ...line, missingTotal: line.estimatedTotal }));
  const productCharges = roundTo2(lines.reduce((sum, line) => sum + line.chargedTotal, 0));
  const reportedProductTotal = numberOr(
    order?.weighing?.finalSum,
    numberOr(order?.finalSum, productCharges),
  );

  return {
    lines,
    missingLines,
    productCharges,
    deliveryFee,
    totalPaid: roundTo2(productCharges + deliveryFee),
    estimatedFulfilled: roundTo2(lines.reduce((sum, line) => sum + line.estimatedTotal, 0)),
    missingEstimated: roundTo2(missingLines.reduce((sum, line) => sum + line.estimatedTotal, 0)),
    reportedProductTotal,
    discrepancy: roundTo2(productCharges - reportedProductTotal),
  };
}

export function reconcileChargedOrder(order = {}, options = {}) {
  const isDelayed = options.isDelayed ?? order.isDelayed ?? order.source === 'customerOrdersDelayed';
  const checkoutLines = flattenCheckoutLines(order);
  const deliveryFee = roundTo2(numberOr(order?.customerDetails?.deliveryDetails?.deliveryFee));
  const core = isDelayed
    ? reconcileDelayed(order, checkoutLines, deliveryFee)
    : (() => {
      const lines = checkoutLines.map((line) => ({
        ...line,
        actualQuantity: line.estimatedQuantity,
        chargedTotal: line.estimatedTotal,
        source: 'checkout',
        isAdditional: false,
      }));
      const productCharges = roundTo2(lines.reduce((sum, line) => sum + line.chargedTotal, 0));
      const reportedProductTotal = roundTo2(numberOr(order?.grandTotal, productCharges + deliveryFee) - deliveryFee);
      return {
        lines,
        missingLines: [],
        productCharges,
        deliveryFee,
        totalPaid: roundTo2(productCharges + deliveryFee),
        estimatedFulfilled: productCharges,
        missingEstimated: 0,
        reportedProductTotal,
        discrepancy: roundTo2(productCharges - reportedProductTotal),
      };
    })();

  return {
    ...order,
    ...core,
    isDelayed,
    successful: isPaidWeeklySummaryOrder(order, isDelayed),
    actualProductTotal: core.productCharges,
    actualVsEstimated: roundTo2(core.productCharges - core.estimatedFulfilled),
    hasDiscrepancy: Math.abs(core.discrepancy) > 0.02,
  };
}

export function reconcileWeeklyOrders(orders = []) {
  const reconciledOrders = orders.map((order) => reconcileChargedOrder(order, {
    isDelayed: order.isDelayed,
  }));
  return reconciledOrders.reduce((summary, order) => {
    summary.orders.push(order);
    summary.successfulCount += order.successful ? 1 : 0;
    summary.productCharges += order.productCharges;
    summary.deliveryFees += order.deliveryFee;
    summary.totalPaid += order.totalPaid;
    summary.estimatedFulfilled += order.estimatedFulfilled;
    summary.actualProductTotal += order.actualProductTotal;
    summary.missingEstimated += order.missingEstimated;
    summary.missingLines.push(...order.missingLines.map((line) => ({ ...line, orderId: order.id })));
    return summary;
  }, {
    orders: [],
    successfulCount: 0,
    productCharges: 0,
    deliveryFees: 0,
    totalPaid: 0,
    estimatedFulfilled: 0,
    actualProductTotal: 0,
    missingEstimated: 0,
    missingLines: [],
  });
}
