import { getEstimatedChargeableQuantity } from '../../../../utils/pricing';

/**
 * V8 per-item picking helpers.
 *
 * V7 works order-by-order. V8 flips the loop: for a set of communities (one
 * delivery), group every order line by product, then let the worker pick one
 * product across all boxes before moving to the next product.
 *
 * Everything here is pure so it can be unit tested without React/Firestore.
 */

export const PICK_STATUS = Object.freeze({
  pending: 'pending',
  done: 'done',
  removed: 'removed',
});

export function buildItemGroupKey(item) {
  return [
    item?.productId || item?.productName || item?.name || 'item',
    item?.selectedOption || '',
    item?.measurementType || 'kg',
  ].join('::');
}

export function getExpectedPickQuantity(item) {
  const requested = Number(item?.requestedQuantity || 0);
  const measurementType = item?.measurementType || 'kg';
  if (measurementType === 'package') return Math.floor(requested);
  return getEstimatedChargeableQuantity({
    measurementType,
    quantity: requested,
    averageWeightKg: Number(item?.averageWeightKg || 1) || 1,
  });
}

export function getEntryPickStatus(item, draft = {}) {
  const lineId = item?.lineId;
  if (!lineId) return PICK_STATUS.pending;
  if (draft?.removedLineIds?.[lineId]) return PICK_STATUS.removed;
  const weight = draft?.weightsByLineId?.[lineId];
  if (weight && weight.actualQuantity != null && weight.actualQuantity !== '') return PICK_STATUS.done;
  return PICK_STATUS.pending;
}

/**
 * True when the order has at least one active line and every active line is
 * weighed/confirmed. Mirrors V7's charge gate (getNextUnweighedIndex === -1
 * with active items) so "picked" in V8 means "chargeable" in V7.
 */
export function isOrderFullyPicked(items = [], draft = {}) {
  const active = (items || []).filter((item) => item?.lineId && !draft?.removedLineIds?.[item.lineId]);
  if (active.length === 0) return false;
  return active.every((item) => getEntryPickStatus(item, draft) === PICK_STATUS.done);
}

export function predictStatusAfterWeight(items = [], draft = {}, lineId = '', actualQuantity = 0, source = 'manual') {
  const predicted = {
    ...(draft || {}),
    weightsByLineId: { ...(draft?.weightsByLineId || {}), [lineId]: { actualQuantity, source } },
  };
  return isOrderFullyPicked(items, predicted) ? 'weighed' : 'in_progress';
}

export function predictCompletesAfterRemove(items = [], draft = {}, lineId = '') {
  const predicted = {
    ...(draft || {}),
    removedLineIds: { ...(draft?.removedLineIds || {}), [lineId]: true },
  };
  return isOrderFullyPicked(items, predicted);
}

/**
 * @param {object} params
 * @param {Array} params.orders            Orders already sorted in picking order (community rank, customer number).
 * @param {(order) => {items, draft}} params.getOrderContext  Returns merged items + sanitized draft for an order.
 */
export function buildItemPickGroups({ orders = [], getOrderContext } = {}) {
  if (typeof getOrderContext !== 'function') return [];
  const map = new Map();

  (orders || []).forEach((order, orderIndex) => {
    if (!order?.id) return;
    const context = getOrderContext(order) || {};
    const items = Array.isArray(context.items) ? context.items : [];
    const draft = context.draft || {};

    items.forEach((item) => {
      if (!item?.lineId) return;
      const key = buildItemGroupKey(item);
      if (!map.has(key)) {
        map.set(key, {
          key,
          productId: item.productId || '',
          productName: item.productName || item.name || 'Item',
          thaiName: item.thaiName || '',
          images: Array.isArray(item.images) ? item.images : [],
          businessName: item.businessName || '',
          businessId: item.businessId || '',
          selectedOption: item.selectedOption || '',
          measurementType: item.measurementType || 'kg',
          unitSize: Number(item.unitSize || 1) || 1,
          averageWeightKg: Number(item.averageWeightKg || 1) || 1,
          hardToPick: Boolean(item.hardToPick),
          entries: [],
          totalRequested: 0,
          totalExpected: 0,
          totalActual: 0,
          doneCount: 0,
          removedCount: 0,
          pendingCount: 0,
        });
      }
      const group = map.get(key);
      if (item.hardToPick) group.hardToPick = true;
      const status = getEntryPickStatus(item, draft);
      const requested = Number(item.requestedQuantity || 0);
      const expected = getExpectedPickQuantity(item);
      const weight = draft?.weightsByLineId?.[item.lineId] || null;
      const actual = status === PICK_STATUS.done ? Number(weight?.actualQuantity || 0) : 0;

      group.entries.push({
        order,
        orderId: order.id,
        orderIndex,
        lineId: item.lineId,
        item,
        requested,
        expected,
        weight,
        actual,
        status,
      });

      if (status !== PICK_STATUS.removed) {
        group.totalRequested += requested;
        group.totalExpected += expected;
      }
      group.totalActual += actual;
      if (status === PICK_STATUS.done) group.doneCount += 1;
      else if (status === PICK_STATUS.removed) group.removedCount += 1;
      else group.pendingCount += 1;
    });
  });

  return Array.from(map.values()).map((group) => ({
    ...group,
    totalCount: group.entries.length,
    activeCount: group.entries.length - group.removedCount,
    isDone: group.pendingCount === 0 && group.entries.length > 0,
  }));
}

export function sortItemPickGroups(groups = [], mode = 'business') {
  const list = [...(groups || [])];
  const byName = (a, b) => {
    const nameCompare = String(a.productName || '').localeCompare(String(b.productName || ''), 'he');
    if (nameCompare !== 0) return nameCompare;
    return String(a.selectedOption || '').localeCompare(String(b.selectedOption || ''), 'he');
  };
  if (mode === 'popular') {
    list.sort((a, b) => {
      const qtyCompare = Number(b.totalRequested || 0) - Number(a.totalRequested || 0);
      if (qtyCompare !== 0) return qtyCompare;
      const countCompare = Number(b.activeCount || 0) - Number(a.activeCount || 0);
      if (countCompare !== 0) return countCompare;
      return byName(a, b);
    });
    return list;
  }
  if (mode === 'business') {
    list.sort((a, b) => {
      const businessCompare = String(a.businessName || '').localeCompare(String(b.businessName || ''), 'he');
      if (businessCompare !== 0) return businessCompare;
      return byName(a, b);
    });
    return list;
  }
  list.sort(byName);
  return list;
}

/**
 * Next pending entry after `afterLineId` (wraps around). When `afterLineId`
 * is empty, returns the first pending entry. Keyed by lineId because one order
 * can hold the same product on more than one line.
 */
export function getNextPendingEntry(group, afterLineId = '') {
  const entries = Array.isArray(group?.entries) ? group.entries : [];
  if (entries.length === 0) return null;
  const pending = (entry) => entry.status === PICK_STATUS.pending;
  if (!afterLineId) return entries.find(pending) || null;
  const currentIndex = entries.findIndex((entry) => entry.lineId === afterLineId);
  if (currentIndex < 0) return entries.find(pending) || null;
  for (let step = 1; step <= entries.length; step += 1) {
    const candidate = entries[(currentIndex + step) % entries.length];
    if (candidate.lineId !== afterLineId && pending(candidate)) return candidate;
  }
  return null;
}

export function summarizePickGroups(groups = []) {
  return (groups || []).reduce((acc, group) => ({
    items: acc.items + 1,
    doneItems: acc.doneItems + (group.isDone ? 1 : 0),
    lines: acc.lines + (group.activeCount || 0),
    doneLines: acc.doneLines + (group.doneCount || 0),
  }), { items: 0, doneItems: 0, lines: 0, doneLines: 0 });
}
