import { getEstimatedChargeableQuantity } from '../../../../utils/pricing';
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
 * community unlock is confirmed.
 */
export function findUnlockedWeeklyPromotion({
  promotions = [],
  weekKey = '',
  communityCode = '',
  unlocksByKey = {},
} = {}) {
  if (!communityCode) return null;
  return (promotions || []).find((promotion) => (
    promotion?.id
    && SETTLEABLE_PROMOTION_STATUSES.has(promotion.status)
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
 * @returns {null | {
 *   promotionId, communityCode, weekKey, pricingVersion, title,
 *   lines: [{ lineId, productId, originalPrice, promotionPrice, estimatedSavings }],
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

  (items || []).forEach((item) => {
    if (!isPromotionCandidateLine(item, removedLineIds)) return;
    const snapshot = pickProductSnapshot(snapshots, String(item.productId), String(item.businessOrderKey || ''));
    if (!snapshot) return;
    const promotionPrice = Number(snapshot.promotionPrice);
    const originalPrice = safeNumber(item.pricePerUnit ?? item.price, 0);
    if (!Number.isFinite(promotionPrice) || promotionPrice < 0 || promotionPrice >= originalPrice) return;
    const estimatedQuantity = getEstimatedChargeableQuantity({
      measurementType: item.measurementType || 'kg',
      quantity: safeNumber(item.requestedQuantity ?? item.quantity, 0),
      averageWeightKg: safeNumber(item.averageWeightKg, 1),
    });
    lines.push({
      lineId: item.lineId,
      productId: String(item.productId),
      businessOrderKey: String(item.businessOrderKey || ''),
      originalPrice,
      promotionPrice,
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
