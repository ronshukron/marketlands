// "Connect this product's quantity discount to other products": a farmer's
// shared promotion (businesses/{id}.productPromotions, the same records as
// /business-promotions) built from one product's "N for ₪X" discount.
import { normalizeProductPromotions, roundTo2 } from './pricing';

export const LINKABLE_MEASUREMENT_TYPES = ['package', 'unit'];

/** The active promotion this product is in, or null. */
export function findProductPromotion(promotions, productId) {
  if (!productId) return null;
  return normalizeProductPromotions(promotions)
    .find((promo) => promo.active && promo.productIds.includes(productId)) || null;
}

/**
 * The promotion record for "this product and these others share the discount".
 * @param {Object} params
 * @param {Object|null} params.existing the promotion being edited
 * @param {string} params.productId
 * @param {Array<string>} params.linkedIds the other products
 * @param {string} params.measurementType 'package' | 'unit'
 * @param {number|string} params.threshold the product's quantity discount threshold
 * @param {number|string} params.price the product's discounted unit price
 * @param {Function} params.createId new promotion id
 * @return {Object}
 */
export function buildLinkedPromotion({
  existing = null, productId, linkedIds = [], measurementType, threshold, price, createId,
}) {
  const thresholdNumber = Number(threshold);
  const priceNumber = Number(price);
  return {
    id: existing?.id || createId(),
    active: true,
    label: existing?.label || '',
    pricingBasis: measurementType,
    productIds: [...new Set([productId, ...linkedIds].map((id) => String(id || '').trim()).filter(Boolean))],
    threshold: thresholdNumber,
    discountedPrice: priceNumber,
    bundleTotalPrice: measurementType === 'package' ? roundTo2(thresholdNumber * priceNumber) : null,
  };
}

/** The farmer's promotions with this one added or replaced. */
export function upsertPromotion(promotions, promotion) {
  const list = Array.isArray(promotions) ? promotions : [];
  const exists = list.some((promo) => promo.id === promotion.id);
  return exists ? list.map((promo) => (promo.id === promotion.id ? promotion : promo)) : [...list, promotion];
}

/**
 * Take a product out of its shared promotion. A promotion left with a single
 * product is removed: that is just the product's own discount.
 */
export function unlinkProduct(promotions, productId) {
  return (Array.isArray(promotions) ? promotions : []).flatMap((promo) => {
    const ids = Array.isArray(promo.productIds) ? promo.productIds : [];
    if (!ids.includes(productId)) return [promo];
    const rest = ids.filter((id) => id !== productId);
    return rest.length >= 2 ? [{ ...promo, productIds: rest }] : [];
  });
}

/** Whether the shared promotion still has this product's discount. */
export function discountMatchesPromotion(promotion, threshold, price) {
  if (!promotion) return false;
  return Number(promotion.threshold) === Number(threshold)
    && roundTo2(promotion.discountedPrice) === roundTo2(Number(price));
}
