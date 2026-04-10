export const BUFFER_LINE_CATALOG_NUMBER = process.env.REACT_APP_BUFFER_LINE_CATALOG_NUMBER || '999003';

export function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function roundTo(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(safeNumber(value) * factor) / factor;
}

export function buildStableLineId({
  orderId,
  productId,
  productName,
  selectedOption = '',
  index = 0,
}) {
  return `${orderId || 'order'}::${productId || productName || 'item'}::${selectedOption || ''}::${index}`;
}

export function flattenOrderBreakdown(orderBreakdown) {
  const out = [];
  if (!orderBreakdown || typeof orderBreakdown !== 'object') return out;

  Object.values(orderBreakdown).forEach((businessOrder) => {
    const businessName = businessOrder?.businessName || '';
    const businessId = businessOrder?.businessId || '';
    (businessOrder?.items || []).forEach((item) => {
      out.push({
        ...item,
        businessName: item?.businessName || businessName,
        businessId: item?.businessId || businessId,
      });
    });
  });

  return out;
}

export function ensureLineIdsInItems(orderId, items = []) {
  return (items || []).map((item, index) => ({
    ...item,
    lineId: item?.lineId || buildStableLineId({
      orderId,
      productId: item?.productId || item?.id || '',
      productName: item?.productName || item?.name || 'item',
      selectedOption: item?.selectedOption || '',
      index,
    }),
  }));
}

export function ensureLineIdsInBreakdown(orderId, orderBreakdown = {}) {
  const next = {};

  Object.entries(orderBreakdown || {}).forEach(([businessOrderKey, businessOrder]) => {
    const items = ensureLineIdsInItems(orderId, businessOrder?.items || []);
    next[businessOrderKey] = {
      ...(businessOrder || {}),
      items,
    };
  });

  return next;
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
  const orderId = parts[0] || '';
  const itemToken = parts[1] || '';
  const selectedOption = parts.slice(2, -1).join('::');
  const rawIndex = Number(parts[parts.length - 1]);
  return {
    lineId: String(lineId),
    orderId,
    itemToken,
    itemTokenNorm: normalizeDraftToken(itemToken),
    selectedOption,
    optionNorm: normalizeDraftToken(selectedOption),
    index: Number.isFinite(rawIndex) ? rawIndex : null,
  };
}

export function alignItemsWithDraft(items = [], draft = {}) {
  const draftLineIds = Array.from(new Set([
    ...Object.keys(draft?.weightsByLineId || {}),
    ...Object.keys(draft?.removedLineIds || {}),
  ]))
    .map(parseLineId)
    .filter(Boolean);

  if (draftLineIds.length === 0) return items;

  const unusedCandidates = [...draftLineIds];

  return (items || []).map((item, index) => {
    if (!item) return item;
    if (item?.lineId && draftLineIds.some((entry) => entry.lineId === item.lineId)) {
      return item;
    }

    const productTokens = [
      item?.productId,
      item?.id,
      item?.productName,
      item?.name,
    ]
      .filter(Boolean)
      .map(normalizeDraftToken);
    const itemOptionNorm = normalizeDraftToken(item?.selectedOption);

    let bestIndex = -1;
    let bestScore = 0;

    unusedCandidates.forEach((candidate, candidateIndex) => {
      if (!candidate) return;

      let score = 0;
      if (productTokens.includes(candidate.itemTokenNorm)) score += 4;
      if (candidate.index === index) score += 3;
      if (itemOptionNorm && candidate.optionNorm === itemOptionNorm) score += 3;
      if (!itemOptionNorm && candidate.optionNorm && candidate.index === index) score += 1;
      if (!itemOptionNorm && !candidate.optionNorm) score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = candidateIndex;
      }
    });

    if (bestIndex === -1 || bestScore < 4) {
      return item;
    }

    const matched = unusedCandidates[bestIndex];
    unusedCandidates[bestIndex] = null;

    return {
      ...item,
      lineId: matched.lineId,
      selectedOption: item?.selectedOption || matched.selectedOption || '',
    };
  });
}

export function resolveActualQuantity(item, weightsByLineId = {}) {
  const measurementType = item?.measurementType || 'kg';
  const weighed = weightsByLineId?.[item?.lineId];
  if (weighed && weighed.actualQuantity != null && weighed.actualQuantity !== '') {
    return safeNumber(weighed.actualQuantity);
  }
  if (measurementType === 'package') {
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

export function buildSettlementPayload({ selectedOrder, items = [], draft = {} }) {
  const weightsByLineId = draft?.weightsByLineId || {};
  const removedLineIds = draft?.removedLineIds || {};

  const finalInvoiceLines = (items || [])
    .filter((item) => item?.catalogNumber !== BUFFER_LINE_CATALOG_NUMBER)
    .filter((item) => !removedLineIds?.[item?.lineId])
    .map((item) => {
      const actualQuantity = resolveActualQuantity(item, weightsByLineId);
      const pricePerUnit = safeNumber(item?.pricePerUnit ?? item?.price, 0);
      const linePrice = roundTo(safeNumber(actualQuantity) * pricePerUnit, 2);
      const measurementType = item?.measurementType || 'kg';
      const weighSource = weightsByLineId?.[item?.lineId]?.source || (measurementType === 'package' ? 'package' : 'manual');

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
      };
    });

  const finalSum = roundTo(finalInvoiceLines.reduce((sum, line) => sum + safeNumber(line?.linePrice), 0), 2);
  const productDataForGrow = {};

  finalInvoiceLines.forEach((line, index) => {
    let descriptionWithQty = line.productName;
    if (line.measurementType === 'package') {
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
    weightsByLineId,
    removedLineIds,
    finalInvoiceLines,
    finalSum,
    productDataForGrow,
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