import {
  blendWeeklyPromotionPrice,
  getEstimatedChargeableQuantity,
  normalizeWeeklyPromotionMaxQuantity,
} from '../../../../utils/pricing';
import { BUFFER_LINE_CATALOG_NUMBER, roundTo, safeNumber } from './orderDraftUtils';

/**
 * Weekly community promotions applied at charge time: an order placed before
 * its community unlocked the promotion still gets the promotion price once the
 * community is unlocked. Pure helpers; Firestore access lives in apiV7.
 */

const SETTLEABLE_PROMOTION_STATUSES = new Set(['active', 'archived']);

export function weeklyPromotionUnlockKey(promotionId, communityCode) {
  return `${promotionId || ''}__${communityCode || ''}`;
}

/**
 * Picks the promotion of `weekKey` that targets `communityCode` and whose
 * community unlock is confirmed. A subscribers-only promotion applies only to
 * basket-subscription orders.
 */
export function findUnlockedWeeklyPromotion({
  promotions = [],
  weekKey = '',
  communityCode = '',
  unlocksByKey = {},
  isSubscriptionOrder = false,
} = {}) {
  if (!communityCode) return null;
  return (promotions || []).find((promotion) => (
    promotion?.id
    && SETTLEABLE_PROMOTION_STATUSES.has(promotion.status)
    && (promotion.subscribersOnly !== true || isSubscriptionOrder === true)
    && (!weekKey || promotion.weekKey === weekKey)
    && (promotion.targetCommunityCodes || []).includes(communityCode)
    && unlocksByKey[weeklyPromotionUnlockKey(promotion.id, communityCode)]?.unlocked === true
  )) || null;
}

function pickProductSnapshot(snapshots = [], productId = '', businessOrderKey = '') {
  const matches = snapshots.filter((entry) => String(entry?.productId || entry?.id || '') === productId);
  if (matches.length === 0) return null;
  return (
    (businessOrderKey && matches.find((entry) => String(entry?.orderId || '') === businessOrderKey))
    || matches.find((entry) => !entry?.orderId)
    || null
  );
}

function isPromotionCandidateLine(item, removedLineIds = {}) {
  return Boolean(
    item?.lineId
    && item.productId
    && !removedLineIds?.[item.lineId]
    && !item.isShipping
    && !item.isBasketComponent
    && !item.isBasketAdjustment
    && !item.basketInstanceId
    && item.catalogNumber !== BUFFER_LINE_CATALOG_NUMBER
    && item.communityWeeklyPromotionApplied !== true
  );
}

/**
 * A product's promotion limit (snapshot.maxQuantity) counts over the whole
 * order, including lines that already got the promotion at checkout; the
 * rest of a line keeps its price. A line's promotionPrice is then the mixed
 * unit price of that line.
 * @returns {null | {
 *   promotionId, communityCode, weekKey, pricingVersion, title,
 *   lines: [{ lineId, productId, originalPrice, promotionPrice, promotionQuantity, maxQuantity, estimatedSavings }],
 *   estimatedSavings,
 * }}
 */
export function resolveWeeklyPromotionForOrder({
  items = [],
  removedLineIds = {},
  promotion = null,
  communityCode = '',
} = {}) {
  if (!promotion?.id || !communityCode) return null;
  const snapshots = Array.isArray(promotion.productSnapshots) ? promotion.productSnapshots : [];
  const lines = [];
  const lineQuantity = (item) => safeNumber(item.requestedQuantity ?? item.quantity, 0);

  // Lines priced with this promotion at checkout already used part of the limit.
  const usedByProduct = {};
  (items || []).forEach((item) => {
    if (!item?.productId || item.communityWeeklyPromotionApplied !== true || removedLineIds?.[item.lineId]) return;
    if (item.communityWeeklyPromotionId && item.communityWeeklyPromotionId !== promotion.id) return;
    const productId = String(item.productId);
    usedByProduct[productId] = (usedByProduct[productId] || 0)
      + safeNumber(item.communityWeeklyPromotionQuantity ?? lineQuantity(item), 0);
  });

  (items || []).forEach((item) => {
    if (!isPromotionCandidateLine(item, removedLineIds)) return;
    const productId = String(item.productId);
    const snapshot = pickProductSnapshot(snapshots, productId, String(item.businessOrderKey || ''));
    if (!snapshot) return;
    const unitPromotionPrice = Number(snapshot.promotionPrice);
    const originalPrice = safeNumber(item.pricePerUnit ?? item.price, 0);
    if (!Number.isFinite(unitPromotionPrice) || unitPromotionPrice < 0 || unitPromotionPrice >= originalPrice) return;
    const quantity = lineQuantity(item);
    const maxQuantity = normalizeWeeklyPromotionMaxQuantity(snapshot.maxQuantity);
    const promotionQuantity = maxQuantity === null
      ? quantity
      : roundTo(Math.min(quantity, Math.max(0, maxQuantity - (usedByProduct[productId] || 0))), 3);
    if (promotionQuantity <= 0) return;
    usedByProduct[productId] = (usedByProduct[productId] || 0) + promotionQuantity;
    const promotionPrice = blendWeeklyPromotionPrice({
      promotionPrice: unitPromotionPrice,
      basePrice: originalPrice,
      quantity,
      promotionQuantity,
    });
    const estimatedQuantity = getEstimatedChargeableQuantity({
      measurementType: item.measurementType || 'kg',
      quantity,
      averageWeightKg: safeNumber(item.averageWeightKg, 1),
    });
    lines.push({
      lineId: item.lineId,
      productId,
      businessOrderKey: String(item.businessOrderKey || ''),
      originalPrice,
      promotionPrice,
      unitPromotionPrice,
      promotionQuantity,
      maxQuantity,
      estimatedSavings: roundTo((originalPrice - promotionPrice) * estimatedQuantity, 2),
    });
  });

  if (lines.length === 0) return null;
  return {
    promotionId: promotion.id,
    communityCode,
    weekKey: promotion.weekKey || '',
    pricingVersion: promotion.pricingVersion || '',
    title: promotion.title || '',
    lines,
    estimatedSavings: roundTo(lines.reduce((sum, line) => sum + line.estimatedSavings, 0), 2),
  };
}

/** Applies promotion prices to settlement items (preview before the order doc is patched). */
export function applyWeeklyPromotionToItems(items = [], weeklyPromotion = null) {
  if (!weeklyPromotion?.lines?.length) return items;
  const byLineId = new Map(weeklyPromotion.lines.map((line) => [line.lineId, line]));
  return (items || []).map((item) => {
    const line = byLineId.get(item?.lineId);
    if (!line || item.communityWeeklyPromotionApplied === true) return item;
    return {
      ...item,
      pricePerUnit: line.promotionPrice,
      price: line.promotionPrice,
      communityWeeklyPromotionApplied: true,
      communityWeeklyPromotionId: weeklyPromotion.promotionId,
    };
  });
}

export function buildWeeklyPromotionFingerprint({ orderId, weeklyPromotion }) {
  const lineIds = (weeklyPromotion?.lines || []).map((line) => line.lineId).sort();
  return [
    orderId || '',
    weeklyPromotion?.promotionId || '',
    weeklyPromotion?.pricingVersion || '',
    lineIds.join(','),
  ].join('|');
}
