import { parseDateSafe, toLocalDateKey } from './deliveryScheduleUtils';

const QUANTITY_EPSILON = 0.001;

const roundQty = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

export const normalizeSupplierOption = (option) => {
  const value = String(option || '').trim();
  return value === 'ללא אופציות' || value === 'None' ? '' : value;
};

export const isUnitBasedMeasurement = (measurementType) => (
  measurementType === 'unit' || measurementType === 'package'
);

export function sumOrderedByProductKey(batches = []) {
  const ordered = {};
  (batches || []).forEach((batch) => {
    Object.entries(batch?.lines || {}).forEach(([key, line]) => {
      ordered[key] = roundQty((ordered[key] || 0) + (Number(line?.quantity) || 0));
    });
  });
  return ordered;
}

export function computeRemainingLines(products = {}, orderedByKey = {}) {
  const rows = Object.entries(products || {}).map(([key, product]) => {
    const totalQty = roundQty(product.quantity);
    const orderedQty = roundQty(orderedByKey[key]);
    const remainingQty = roundQty(Math.max(0, totalQty - orderedQty));
    return {
      key,
      productName: product.productName,
      selectedOption: normalizeSupplierOption(product.selectedOption),
      measurementType: product.measurementType || 'kg',
      unitSize: Number(product.unitSize) || 1,
      totalRevenue: Number(product.totalRevenue) || 0,
      totalQty,
      orderedQty,
      remainingQty: remainingQty < QUANTITY_EPSILON ? 0 : remainingQty,
      overOrdered: orderedQty - totalQty > QUANTITY_EPSILON,
    };
  });
  return rows.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

export function getSupplierProgressStatus(products = {}, batches = []) {
  const batchCount = (batches || []).length;
  if (batchCount === 0) return { batchCount: 0, remainingCount: null, isComplete: false };
  const rows = computeRemainingLines(products, sumOrderedByProductKey(batches));
  const remainingCount = rows.filter((row) => row.remainingQty > 0).length;
  return { batchCount, remainingCount, isComplete: remainingCount === 0 };
}

// Native quantity is kg for kg products and a count for unit/package products.
export function toNativeQuantity(enteredQty, mode, unitSize = 1, measurementType = 'kg') {
  const qty = Number(enteredQty) || 0;
  if (isUnitBasedMeasurement(measurementType) || mode === 'kg') return roundQty(qty);
  return roundQty(qty * (Number(unitSize) || 1));
}

export function fromNativeQuantity(nativeQty, mode, unitSize = 1, measurementType = 'kg') {
  const qty = Number(nativeQty) || 0;
  if (isUnitBasedMeasurement(measurementType)) return Math.round(qty);
  if (mode === 'kg') return Number(qty.toFixed(1));
  return Math.round(qty / (Number(unitSize) || 1));
}

export function formatNativeQuantity(nativeQty, measurementType = 'kg', unitSize = 1) {
  const qty = Number(nativeQty) || 0;
  if (isUnitBasedMeasurement(measurementType)) return `${Math.round(qty)} יח'`;
  const units = Math.round(qty / (Number(unitSize) || 1));
  return `${units} יח' / ${qty.toFixed(1)} ק"ג`;
}

// items: [{ productName, selectedOption, mode: 'kg'|'unit', isUnitBased, quantity }]
export function buildSupplierOrderText({ header, items = [] }) {
  const parts = [header, ''];
  const included = items.filter((item) => (Number(item.quantity) || 0) > 0);
  const isKgLine = (item) => item.mode === 'kg' && !item.isUnitBased;
  const kgItems = included.filter(isKgLine);
  const unitItems = included.filter((item) => !isKgLine(item));
  const formatLine = (item) => {
    const opt = normalizeSupplierOption(item.selectedOption);
    const kgMode = isKgLine(item);
    const optPart = opt && !kgMode ? ` *${opt}*` : '';
    const qty = Number(item.quantity) || 0;
    return `* ${item.productName}${optPart} - ${kgMode ? qty.toFixed(1) : Math.round(qty)} ${kgMode ? 'ק"ג' : "יח'"}`;
  };

  if (kgItems.length > 0) {
    parts.push('הזמנה סיטונאית לא ארוז:');
    parts.push(...kgItems.map(formatLine));
  }
  if (kgItems.length > 0 && unitItems.length > 0) parts.push('');
  if (unitItems.length > 0) {
    parts.push('הזמנה ארוז:');
    parts.push(...unitItems.map(formatLine));
  }
  return parts.join('\n');
}

const findOverrideForOrder = (order, overrides = []) => {
  const ownDateKey = toLocalDateKey(order.deliveryDate);
  return (overrides || []).find((entry) => (
    entry
    && entry.community === order.community
    && entry.originalDeliveryDate === ownDateKey
  )) || null;
};

// When an order started to count for purchasing: once its payment was held, or once
// an admin moved it to this delivery day (whichever is later).
export function getOrderEnteredAt(order = {}) {
  const entered = parseDateSafe(order.delayedPayment?.heldAt)
    || parseDateSafe(order.createdAt)
    || parseDateSafe(order.createdAtIso);
  const movedAt = parseDateSafe(order.adminDeliveryTransferredAt);
  if (entered && movedAt) return movedAt > entered ? movedAt : entered;
  return entered || movedAt || null;
}

// An override closes at cutoffAt: orders that entered later stay in the purchase of
// their own delivery day. Overrides saved before closing times existed have none.
export function isOrderAfterProcurementCutoff(order = {}, entry = null) {
  const cutoff = parseDateSafe(entry?.cutoffAt);
  if (!cutoff) return false;
  const enteredAt = getOrderEnteredAt(order);
  return Boolean(enteredAt) && enteredAt > cutoff;
}

export function getProcurementDateKey(order = {}, overrides = []) {
  const override = findOverrideForOrder(order, overrides);
  return override && !isOrderAfterProcurementCutoff(order, override)
    ? override.procureOnDate
    : toLocalDateKey(order.deliveryDate);
}

// Procurement overrides move a community's purchasing to another day without
// touching the customer orders' delivery date. lateOrders entered after the early
// purchase closed, so they are purchased on their own delivery day.
export function applyProcurementOverrides(orders = [], overrides = [], selectedDeliveryDate = '') {
  if (!selectedDeliveryDate) return { orders, pulledIn: [], pushedOut: [], lateOrders: [] };

  const pulledIn = {};
  const pushedOut = {};
  const lateOrders = [];
  const visible = orders.filter((order) => {
    const ownDateKey = toLocalDateKey(order.deliveryDate);
    const matched = findOverrideForOrder(order, overrides);
    const isLate = isOrderAfterProcurementCutoff(order, matched);
    const override = isLate ? null : matched;
    const procurementDateKey = override ? override.procureOnDate : ownDateKey;

    if (isLate && [ownDateKey, matched.procureOnDate].includes(selectedDeliveryDate)) {
      lateOrders.push(order);
    }
    if (override && ownDateKey === selectedDeliveryDate && procurementDateKey !== selectedDeliveryDate) {
      const key = `${order.community}__${procurementDateKey}`;
      if (!pushedOut[key]) pushedOut[key] = { community: order.community, procureOnDate: procurementDateKey, count: 0 };
      pushedOut[key].count += 1;
    }
    if (procurementDateKey !== selectedDeliveryDate) return false;
    if (override && ownDateKey !== selectedDeliveryDate) {
      const key = `${order.community}__${ownDateKey}`;
      if (!pulledIn[key]) pulledIn[key] = { community: order.community, originalDeliveryDate: ownDateKey, count: 0 };
      pulledIn[key].count += 1;
    }
    return true;
  });

  return {
    orders: visible,
    pulledIn: Object.values(pulledIn),
    pushedOut: Object.values(pushedOut),
    lateOrders,
  };
}

// The early purchases that touch the selected day (as purchase day or delivery day),
// with their orders (newest first), for setting the closing time.
export function getProcurementCutoffGroups(orders = [], overrides = [], selectedDeliveryDate = '') {
  if (!selectedDeliveryDate) return [];
  const groups = {};
  (overrides || []).forEach((entry) => {
    if (!entry || entry.procureOnDate === entry.originalDeliveryDate) return;
    if (![entry.procureOnDate, entry.originalDeliveryDate].includes(selectedDeliveryDate)) return;
    const key = `${entry.procureOnDate}__${entry.originalDeliveryDate}`;
    if (!groups[key]) {
      groups[key] = {
        key,
        procureOnDate: entry.procureOnDate,
        originalDeliveryDate: entry.originalDeliveryDate,
        entries: [],
        orders: [],
      };
    }
    groups[key].entries.push(entry);
  });
  Object.values(groups).forEach((group) => {
    group.orders = orders
      .filter((order) => group.entries.includes(findOverrideForOrder(order, overrides)))
      .map((order) => ({ order, enteredAt: getOrderEnteredAt(order) }))
      .sort((a, b) => (b.enteredAt?.getTime() || 0) - (a.enteredAt?.getTime() || 0));
  });
  return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
}

// Communities with orders on a different day that can be pulled into the selected procurement day.
export function getProcurementOverrideCandidates(orders = [], overrides = [], selectedDeliveryDate = '') {
  if (!selectedDeliveryDate) return [];
  const candidates = {};
  orders.forEach((order) => {
    const ownDateKey = toLocalDateKey(order.deliveryDate);
    if (!ownDateKey || ownDateKey === selectedDeliveryDate) return;
    // A closed early purchase is reopened by changing its closing time, not by adding it again.
    if (isOrderAfterProcurementCutoff(order, findOverrideForOrder(order, overrides))) return;
    if (getProcurementDateKey(order, overrides) === selectedDeliveryDate) return;
    const key = `${order.community}__${ownDateKey}`;
    if (!candidates[key]) {
      candidates[key] = { key, community: order.community, originalDeliveryDate: ownDateKey, count: 0 };
    }
    candidates[key].count += 1;
  });
  return Object.values(candidates).sort((a, b) => (
    a.originalDeliveryDate.localeCompare(b.originalDeliveryDate)
    || String(a.community).localeCompare(String(b.community))
  ));
}
