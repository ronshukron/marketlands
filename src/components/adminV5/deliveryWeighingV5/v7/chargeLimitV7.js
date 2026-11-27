// The most a packer can charge an order, and how much room is left.
//
// - A regular delayed order has a card hold (J5). Its holdSum is what the
//   customer approved: the hard maximum. Grow may or may not accept more; we
//   never try (handleSuspendedPayment refuses above the hold too).
// - A weekly-basket order has no hold. The server asks the admin to confirm a
//   charge above CHARGE_CEILING_FACTOR x the estimate; shown here for guidance.
// Pure functions: the screen, the charge and the tests all use these.

// Copy of CHARGE_CEILING_FACTOR in functions/functions/handlers/subscriptionCharge.js.
// Display only: the server decides.
export const SUBSCRIPTION_CEILING_FACTOR = 1.15;
const EPSILON = 0.005;

const toMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const isSubscription = (order) => order?.rawData?.isSubscriptionOrder === true || order?.isSubscriptionOrder === true;

/** The hold the customer approved, from the order as V7 loads it. */
export function readHoldSum(order) {
  const candidates = [
    order?.suspendedPaymentRef?.holdSum,
    order?.rawData?.delayedPayment?.holdSum,
    order?.rawData?.suspendedPayment?.holdSum,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return toMoney(value);
  }
  return 0;
}

/**
 * @param {Object} order a V7 order (apiV7 normalizeDelayedOrder)
 * @return {{type: 'hold'|'ceiling'|'none', max?: number, estimate?: number}}
 */
export function getChargeLimit(order) {
  if (!order) return { type: 'none' };
  if (isSubscription(order)) {
    const estimate = Number(order.grandTotal ?? order.rawData?.grandTotal);
    if (!Number.isFinite(estimate) || estimate <= 0) return { type: 'none' };
    // The server compares the charge including the delivery fee; the weighed
    // products are compared here, so the fee is taken off the ceiling.
    const deliveryFee = Number(
      order.customerDetails?.deliveryDetails?.deliveryFee
      ?? order.rawData?.customerDetails?.deliveryDetails?.deliveryFee,
    ) || 0;
    return {
      type: 'ceiling',
      max: toMoney(Math.max(0, estimate * SUBSCRIPTION_CEILING_FACTOR - deliveryFee)),
      estimate: toMoney(estimate),
    };
  }
  const holdSum = readHoldSum(order);
  if (holdSum > 0) return { type: 'hold', max: holdSum };
  return { type: 'none' };
}

/**
 * @param {Object} params
 * @param {Object} params.limit getChargeLimit()
 * @param {number} params.finalSum the settlement preview's total
 * @return {{remaining: number|null, over: boolean, overBy: number}}
 */
export function getChargeRoom({ limit, finalSum }) {
  if (!limit || limit.type === 'none') return { remaining: null, over: false, overBy: 0 };
  const total = toMoney(finalSum);
  const over = total > limit.max + EPSILON;
  return {
    remaining: over ? 0 : toMoney(limit.max - total),
    over,
    overBy: over ? toMoney(total - limit.max) : 0,
  };
}

/**
 * The most of the line being weighed that keeps the order within its limit.
 * @param {Object} params
 * @param {Object} params.limit getChargeLimit()
 * @param {number} params.finalSum the preview total, with this line as it is now
 * @param {number} params.lineCurrentPrice this line's price in that preview (0 if not weighed)
 * @param {number} params.effectiveUnitPrice the line's price per kg / pack after discounts
 * @param {string} params.measurementType 'kg' | 'unit' | 'package'
 * @return {number|null} kg to 3 decimals, or whole packs; null when there is no limit
 */
export function maxQuantityForLine({
  limit, finalSum, lineCurrentPrice = 0, effectiveUnitPrice, measurementType = 'kg',
}) {
  if (!limit || limit.type === 'none') return null;
  const price = Number(effectiveUnitPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const others = toMoney((Number(finalSum) || 0) - (Number(lineCurrentPrice) || 0));
  const room = limit.max - others;
  if (room <= 0) return 0;
  const quantity = room / price;
  if (measurementType === 'package') return Math.max(0, Math.floor(quantity + 1e-9));
  return Math.max(0, Math.floor(quantity * 1000 + 1e-6) / 1000);
}

/** Whether a total is over the hold, for the cap dialog (hold orders only). */
export function isOverHold(limit, finalSum) {
  return Boolean(limit && limit.type === 'hold' && getChargeRoom({ limit, finalSum }).over);
}

/**
 * Batch charging: which included orders are over their card hold, and how
 * much the customers would not be charged if they are charged at the hold.
 * @param {Array<{order: Object}>} entries the ready orders included in the batch
 * @param {Object} previews orderId -> {finalSum}
 * @return {{overOrderIds: Set<string>, overCount: number, waived: number}}
 */
export function summarizeBatchHoldCaps(entries = [], previews = {}) {
  const overOrderIds = new Set();
  let waived = 0;
  (entries || []).forEach((entry) => {
    const order = entry?.order;
    const preview = previews?.[order?.id];
    if (!order || !preview) return;
    const room = getChargeRoom({ limit: getChargeLimit(order), finalSum: preview.finalSum });
    if (getChargeLimit(order).type !== 'hold' || !room.over) return;
    overOrderIds.add(order.id);
    waived += room.overBy;
  });
  return { overOrderIds, overCount: overOrderIds.size, waived: toMoney(waived) };
}

/** The cap a batch charge passes for an order: its hold, when capping is on. */
export function batchChargeCapFor(order, capEnabled) {
  if (!capEnabled) return null;
  const limit = getChargeLimit(order);
  return limit.type === 'hold' ? limit.max : null;
}
