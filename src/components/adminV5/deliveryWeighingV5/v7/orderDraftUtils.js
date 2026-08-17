export const BUFFER_LINE_CATALOG_NUMBER = process.env.REACT_APP_BUFFER_LINE_CATALOG_NUMBER || '999003';
export const INTRODUCTION_BASKET_CATALOG_NUMBER =
  process.env.REACT_APP_INTRODUCTION_BASKET_CATALOG_NUMBER || '999004';

export function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function roundTo(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(safeNumber(value) * factor) / factor;
}

function generateLineSeed(occurrenceIndex) {
  return `s${occurrenceIndex}`;
}

export function buildStableLineId({
  orderId,
  businessOrderKey = '',
  productId,
  productName,
  selectedOption = '',
  lineSeed = '',
}) {
  return `${orderId || 'order'}::${productId || productName || 'item'}::${businessOrderKey || ''}::${selectedOption || ''}::${lineSeed}`;
}

function getCanonicalBusinessEntries(orderBreakdown) {
  return Object.entries(orderBreakdown || {}).sort(([a], [b]) => String(a).localeCompare(String(b)));
}

export function flattenOrderBreakdown(orderBreakdown) {
  const out = [];
  if (!orderBreakdown || typeof orderBreakdown !== 'object') return out;

  getCanonicalBusinessEntries(orderBreakdown).forEach(([businessOrderKey, businessOrder]) => {
    const businessName = businessOrder?.businessName || '';
    const businessId = businessOrder?.businessId || '';
    (businessOrder?.items || []).forEach((item) => {
      out.push({
        ...item,
        businessOrderKey,
        businessName: item?.businessName || businessName,
        businessId: item?.businessId || businessId,
      });
    });
  });

  return out;
}

export function ensureLineIdsInBreakdown(orderId, orderBreakdown = {}) {
  const next = {};
  let newSeedsAssigned = false;

  getCanonicalBusinessEntries(orderBreakdown).forEach(([businessOrderKey, businessOrder]) => {
    const items = (businessOrder?.items || []).map((item, idx) => {
      const hadSeed = !!item?.lineSeed;
      const lineSeed = item?.lineSeed || generateLineSeed(idx);
      if (!hadSeed) newSeedsAssigned = true;
      return {
        ...item,
        businessOrderKey,
        lineSeed,
        lineId: buildStableLineId({
          orderId,
          businessOrderKey,
          productId: item?.productId || item?.id || '',
          productName: item?.productName || item?.name || 'item',
          selectedOption: item?.selectedOption || '',
          lineSeed,
        }),
      };
    });
    next[businessOrderKey] = {
      ...(businessOrder || {}),
      items,
    };
  });

  return { breakdown: next, newSeedsAssigned };
}

export function sumItemsTotal(orderBreakdown = {}) {
  return Object.values(orderBreakdown || {}).reduce((sum, businessOrder) => {
    const subtotal = (businessOrder?.items || []).reduce((inner, item) => {
      return inner + (safeNumber(item?.quantity) * safeNumber(item?.price));
    }, 0);
    return sum + subtotal;
  }, 0);
}

export function recomputeBreakdownTotals(orderBreakdown = {}) {
  const next = {};

  Object.entries(orderBreakdown || {}).forEach(([businessOrderKey, businessOrder]) => {
    const items = Array.isArray(businessOrder?.items) ? businessOrder.items : [];
    const subTotal = roundTo(items.reduce((sum, item) => {
      return sum + (safeNumber(item?.quantity) * safeNumber(item?.price));
    }, 0), 2);

    next[businessOrderKey] = {
      ...(businessOrder || {}),
      items,
      subTotal,
    };
  });

  return next;
}

export function mergeProductDetailsIntoItems(items = [], productDetails = {}) {
  return (items || []).map((item) => {
    const pd = item?.productId ? productDetails[item.productId] : null;
    return {
      ...item,
      images: pd?.images || item?.images || [],
      thaiName: pd?.thaiName || item?.thaiName || '',
      measurementType: pd?.measurementType || item?.measurementType || 'kg',
      unitSize: safeNumber(pd?.unitSize ?? item?.unitSize, 1),
      averageWeightKg: safeNumber(pd?.averageWeightKg ?? item?.averageWeightKg, 1),
      pricePerUnit: safeNumber(item?.pricePerUnit ?? item?.price, 0),
    };
  });
}

function normalizeDraftToken(value) {
  return String(value || '').trim().toLowerCase();
}

function parseLineId(lineId) {
  if (!lineId) return null;
  const parts = String(lineId).split('::');
  if (parts.length < 4) return null;
  const hasBusinessOrderKey = parts.length >= 5;
  const orderId = parts[0] || '';
  const itemToken = parts[1] || '';
  const businessOrderKey = hasBusinessOrderKey ? (parts[2] || '') : '';
  const selectedOption = hasBusinessOrderKey ? parts.slice(3, -1).join('::') : parts.slice(2, -1).join('::');
  const rawIndex = Number(parts[parts.length - 1]);
  return {
    lineId: String(lineId),
    orderId,
    itemToken,
    businessOrderKey,
    itemTokenNorm: normalizeDraftToken(itemToken),
    selectedOption,
    optionNorm: normalizeDraftToken(selectedOption),
    index: Number.isFinite(rawIndex) ? rawIndex : null,
  };
}

export function isCanonicalLineIdV7(lineId) {
  const parts = String(lineId || '').split('::');
  if (parts.length < 5) return false;
  const lastPart = parts[parts.length - 1];
  return lastPart.length > 0 && !/^\d+$/.test(lastPart);
}

export function sanitizeDraftForItems(draft = {}, items = []) {
  const allowedLineIds = new Set(
    (items || [])
      .map((item) => item?.lineId)
      .filter(Boolean),
  );
  const weightsByLineId = Object.fromEntries(
    Object.entries(draft?.weightsByLineId || {}).filter(([lineId]) => allowedLineIds.has(lineId)),
  );
  const removedLineIds = Object.fromEntries(
    Object.entries(draft?.removedLineIds || {}).filter(([lineId]) => allowedLineIds.has(lineId)),
  );
  return {
    ...(draft || {}),
    weightsByLineId,
    removedLineIds,
  };
}

export function resolveActualQuantity(item, weightsByLineId = {}) {
  const weighed = weightsByLineId?.[item?.lineId];
  if (weighed && weighed.actualQuantity != null && weighed.actualQuantity !== '') {
    return safeNumber(weighed.actualQuantity);
  }
  return null;
}

export function resolveActualQuantityForSettlement(item, weightsByLineId = {}) {
  const weighed = weightsByLineId?.[item?.lineId];
  if (weighed && weighed.actualQuantity != null && weighed.actualQuantity !== '') {
    return safeNumber(weighed.actualQuantity);
  }
  if ((item?.measurementType || 'kg') === 'package') {
    return safeNumber(item?.requestedQuantity ?? item?.quantity, 0);
  }
  return null;
}

export function getNextUnweighedIndex(items = [], weightsByLineId = {}, removedLineIds = {}) {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item?.lineId) continue;
    if (removedLineIds?.[item.lineId]) continue;
    if (resolveActualQuantity(item, weightsByLineId) == null) return i;
  }
  return -1;
}

export function buildSettlementPayload({
  selectedOrder,
  items = [],
  draft = {},
  weighingAudit = null,
  communityDiscount = null,
}) {
  const weightsByLineId = draft?.weightsByLineId || {};
  const removedLineIds = draft?.removedLineIds || {};
  const hasWeighingAudit = weighingAudit && typeof weighingAudit === 'object';
  const finalizedWeightsByLineId = Object.fromEntries(
    Object.entries(weightsByLineId).map(([lineId, value]) => [
      lineId,
      hasWeighingAudit && value?.actualQuantity != null
        ? { ...(value || {}), audit: value?.audit || weighingAudit }
        : value,
    ]),
  );

  const basketGroups = {};
  (items || []).forEach((item) => {
    if (!item?.basketInstanceId || item?.isBasketComponent !== true) return;
    if (removedLineIds?.[item?.lineId]) return;

    if (!basketGroups[item.basketInstanceId]) {
      basketGroups[item.basketInstanceId] = {
        basketId: item.basketId || '',
        basketInstanceId: item.basketInstanceId,
        title: item.basketTitle || 'סל היכרות',
        displayPrice: safeNumber(item.basketPrice, 0),
        componentSubtotal: safeNumber(item.basketComponentSubtotal, 0),
        componentLineIds: [],
      };
    }
    basketGroups[item.basketInstanceId].componentLineIds.push(item.lineId);
  });

  const normalInvoiceLines = (items || [])
    .filter((item) => item?.catalogNumber !== BUFFER_LINE_CATALOG_NUMBER)
    .filter((item) => !removedLineIds?.[item?.lineId])
    .filter((item) => !(item?.basketInstanceId && item?.isBasketComponent === true))
    .map((item) => {
      const actualQuantity = resolveActualQuantityForSettlement(item, weightsByLineId);
      const pricePerUnit = safeNumber(item?.pricePerUnit ?? item?.price, 0);
      const linePrice = roundTo(safeNumber(actualQuantity) * pricePerUnit, 2);
      const measurementType = item?.measurementType || 'kg';
      const weighSource = weightsByLineId?.[item?.lineId]?.source || (measurementType === 'package' ? 'package' : 'manual');
      const lineAudit = weightsByLineId?.[item?.lineId]?.audit || weighingAudit;

      return {
        lineId: item?.lineId,
        productId: item?.productId || '',
        productName: item?.productName || item?.name || 'Item',
        catalogNumber: item?.catalogNumber || '',
        vatType: item?.vatType ?? 3,
        requestedQuantity: safeNumber(item?.requestedQuantity ?? item?.quantity, 0),
        actualQuantity: safeNumber(actualQuantity, 0),
        pricePerUnit,
        linePrice,
        measurementType,
        weighSource,
        ...(lineAudit && typeof lineAudit === 'object' ? { audit: lineAudit } : {}),
      };
    });

  const basketInvoiceLines = Object.values(basketGroups).map((basket) => ({
    lineId: `basket::${basket.basketInstanceId}`,
    productId: basket.basketId || '',
    productName: `סל היכרות - ${basket.title}`,
    catalogNumber: INTRODUCTION_BASKET_CATALOG_NUMBER,
    vatType: 3,
    requestedQuantity: 1,
    actualQuantity: 1,
    pricePerUnit: safeNumber(basket.displayPrice, 0),
    linePrice: roundTo(safeNumber(basket.displayPrice, 0), 2),
    measurementType: 'package',
    weighSource: 'basket_fixed_price',
    isIntroductionBasket: true,
    basketInstanceId: basket.basketInstanceId,
    componentLineIds: basket.componentLineIds,
    componentSubtotal: roundTo(basket.componentSubtotal, 2),
    ...(hasWeighingAudit ? { audit: weighingAudit } : {}),
  }));

  const undiscountedInvoiceLines = [...normalInvoiceLines, ...basketInvoiceLines];
  const preDiscountTotal = roundTo(
    undiscountedInvoiceLines.reduce((sum, line) => sum + safeNumber(line?.linePrice), 0),
    2,
  );
  const requestedDiscountPercent = safeNumber(communityDiscount?.percent, 0);
  const discountPercent = Math.min(100, Math.max(0, requestedDiscountPercent));
  const shouldApplyCommunityDiscount = discountPercent > 0 && preDiscountTotal > 0;
  const discountFactor = 1 - (discountPercent / 100);
  const finalInvoiceLines = undiscountedInvoiceLines.map((line) => {
    if (!shouldApplyCommunityDiscount) return line;
    const preDiscountPricePerUnit = safeNumber(line.pricePerUnit, 0);
    const discountedPricePerUnit = roundTo(preDiscountPricePerUnit * discountFactor, 6);
    const discountedLinePrice = roundTo(
      safeNumber(line.actualQuantity, 0) * discountedPricePerUnit,
      2,
    );
    return {
      ...line,
      preDiscountPricePerUnit,
      pricePerUnit: discountedPricePerUnit,
      preDiscountLinePrice: line.linePrice,
      communityDiscountShare: roundTo(safeNumber(line.linePrice, 0) - discountedLinePrice, 2),
      communityDiscountPercent: discountPercent,
      linePrice: discountedLinePrice,
    };
  });
  const finalSum = roundTo(
    finalInvoiceLines.reduce((sum, line) => sum + safeNumber(line.linePrice, 0), 0),
    2,
  );
  const discountAmount = shouldApplyCommunityDiscount
    ? roundTo(preDiscountTotal - finalSum, 2)
    : 0;
  const communityDiscountAudit = shouldApplyCommunityDiscount
    ? {
      ...communityDiscount,
      percent: discountPercent,
      preDiscountTotal,
      amount: discountAmount,
      finalTotal: finalSum,
    }
    : null;
  const finalWeighingAudit = hasWeighingAudit
    ? {
      ...weighingAudit,
      ...(communityDiscountAudit ? { communityDiscount: communityDiscountAudit } : {}),
    }
    : null;
  const productDataForGrow = {};

  finalInvoiceLines.forEach((line, index) => {
    let descriptionWithQty = line.productName;
    if (line.isIntroductionBasket) {
      descriptionWithQty = line.productName;
    } else if (line.measurementType === 'package') {
      descriptionWithQty = `${line.productName} ${safeNumber(line.actualQuantity)} pack`;
    } else if (line.weighSource !== 'ordered_default') {
      descriptionWithQty = `${line.productName} ${safeNumber(line.actualQuantity).toFixed(3)} kg`;
    }

    productDataForGrow[`productData[${index}][catalogNumber]`] = line.catalogNumber;
    productDataForGrow[`productData[${index}][quantity]`] = 1;
    productDataForGrow[`productData[${index}][price]`] = line.linePrice;
    productDataForGrow[`productData[${index}][itemDescription]`] = descriptionWithQty;
    productDataForGrow[`productData[${index}][vatType]`] = line.vatType;
  });

  return {
    orderId: selectedOrder?.id,
    weightsByLineId: finalizedWeightsByLineId,
    removedLineIds,
    finalInvoiceLines,
    finalSum,
    productDataForGrow,
    ...(communityDiscountAudit ? { communityDiscount: communityDiscountAudit } : {}),
    ...(finalWeighingAudit ? { weighingAudit: finalWeighingAudit } : {}),
  };
}

function getExcludedLineIdSet(orderData = {}) {
  const excluded = orderData.customerExcludedLineIds || {};
  if (Array.isArray(excluded)) return new Set(excluded);
  return new Set(
    Object.entries(excluded)
      .filter(([, isExcluded]) => isExcluded)
      .map(([lineId]) => lineId),
  );
}

export function buildCommunityDiscountFingerprint({
  orderId,
  communityDiscount = {},
  removedLineIds = {},
}) {
  const removed = Object.entries(removedLineIds || {})
    .filter(([, isRemoved]) => isRemoved)
    .map(([lineId]) => lineId)
    .sort();
  return [
    orderId || '',
    safeNumber(communityDiscount.percent, 0),
    communityDiscount.tierIndex ?? '',
    communityDiscount.deliveryWeekKey || '',
    communityDiscount.community || '',
    removed.join(','),
  ].join('|');
}

export function buildCommunityDiscountOrderPatch({
  orderId,
  orderData = {},
  communityDiscount = null,
  fingerprint = '',
  removedLineIds = {},
}) {
  const percent = Math.min(100, Math.max(0, safeNumber(communityDiscount?.percent, 0)));
  if (!orderId || !communityDiscount || percent <= 0 || !fingerprint) return null;

  const factor = 1 - (percent / 100);
  const excludedLineIds = getExcludedLineIdSet(orderData);
  const removed = new Set(
    Object.entries(removedLineIds || {})
      .filter(([, isRemoved]) => isRemoved)
      .map(([lineId]) => lineId),
  );
  const canonical = ensureLineIdsInBreakdown(orderId, orderData.orderBreakdown || {}).breakdown;
  const activeBasketIds = new Set();
  const activeBasketOriginalPrices = new Map();
  flattenOrderBreakdown(canonical).forEach((item) => {
    if (
      item?.isBasketComponent === true
      && item?.basketInstanceId
      && !excludedLineIds.has(item.lineId)
      && !removed.has(item.lineId)
    ) {
      activeBasketIds.add(item.basketInstanceId);
      if (!activeBasketOriginalPrices.has(item.basketInstanceId)) {
        activeBasketOriginalPrices.set(
          item.basketInstanceId,
          safeNumber(
            item.communityDiscountOriginalBasketPrice ?? item.basketPrice,
            0,
          ),
        );
      }
    }
  });

  let estimatedDiscountAmount = Array.from(activeBasketOriginalPrices.values())
    .reduce(
      (sum, basketPrice) => sum + basketPrice - roundTo(basketPrice * factor, 2),
      0,
    );
  const nextBreakdown = {};
  Object.entries(canonical).forEach(([businessOrderKey, businessOrder]) => {
    const items = (businessOrder?.items || []).map((item) => {
      const isActiveBasketLine = Boolean(
        item?.basketInstanceId
        && activeBasketIds.has(item.basketInstanceId)
        && !excludedLineIds.has(item?.lineId)
        && !removed.has(item?.lineId),
      );
      const isNormalApplicable = (
        !item?.basketInstanceId
        && !item?.isShipping
        && item?.catalogNumber !== BUFFER_LINE_CATALOG_NUMBER
        && !excludedLineIds.has(item?.lineId)
        && !removed.has(item?.lineId)
      );
      if (!isNormalApplicable && !isActiveBasketLine) return item;

      const originalPrice = safeNumber(
        item.communityDiscountOriginalPrice ?? item.price,
        0,
      );
      const originalEffectivePrice = safeNumber(
        item.communityDiscountOriginalEffectivePrice ?? item.effectivePrice ?? originalPrice,
        originalPrice,
      );
      const fallbackEstimate = safeNumber(
        item.estimatedChargeQuantity ?? item.quantity,
        0,
      ) * originalPrice;
      const originalEstimatedLineTotal = safeNumber(
        item.communityDiscountOriginalEstimatedLineTotal
          ?? item.estimatedLineTotal
          ?? fallbackEstimate,
        fallbackEstimate,
      );
      const discountedPrice = roundTo(originalPrice * factor, 6);
      const discountedEstimatedLineTotal = roundTo(originalEstimatedLineTotal * factor, 2);
      if (isNormalApplicable) {
        estimatedDiscountAmount += originalEstimatedLineTotal - discountedEstimatedLineTotal;
      }

      const originalBasketPrice = isActiveBasketLine
        ? safeNumber(
          item.communityDiscountOriginalBasketPrice ?? item.basketPrice,
          0,
        )
        : null;

      return {
        ...item,
        communityDiscountOriginalPrice: originalPrice,
        communityDiscountOriginalEffectivePrice: originalEffectivePrice,
        communityDiscountOriginalEstimatedLineTotal: roundTo(originalEstimatedLineTotal, 2),
        price: discountedPrice,
        effectivePrice: discountedPrice,
        estimatedLineTotal: discountedEstimatedLineTotal,
        communityDiscountPercent: percent,
        communityDiscountFingerprint: fingerprint,
        ...(isActiveBasketLine ? {
          communityDiscountOriginalBasketPrice: originalBasketPrice,
          basketPrice: roundTo(originalBasketPrice * factor, 2),
        } : {}),
      };
    });
    nextBreakdown[businessOrderKey] = {
      ...(businessOrder || {}),
      items,
    };
  });

  const orderBreakdown = recomputeBreakdownTotals(nextBreakdown);
  return {
    orderBreakdown,
    items: flattenOrderBreakdown(orderBreakdown),
    estimatedDiscountAmount: roundTo(estimatedDiscountAmount, 2),
    grandTotal: Math.max(
      0,
      roundTo(safeNumber(orderData.grandTotal, 0) - estimatedDiscountAmount, 2),
    ),
  };
}

export function weekKeyToRangeLabel(weekKey) {
  const date = new Date(weekKey);
  if (Number.isNaN(date.getTime())) return weekKey || '';

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const formatPart = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return `${formatPart(start)} - ${formatPart(end)}`;
}