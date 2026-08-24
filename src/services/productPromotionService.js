import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import {
  attachGroupPromotionFields,
  applyCartPricing,
  findActiveGroupPromotionForProduct,
  isExcludedFromGroupPromotion,
  MAX_GROUP_PROMOTION_LABEL_LENGTH,
  MAX_GROUP_PROMOTIONS,
  normalizeGroupPromotion,
  normalizeOrderMinimums,
  normalizeProductPromotions,
} from '../utils/pricing';

export const getBusinessProductPromotions = async (businessId) => {
  if (!businessId) return [];
  const snap = await getDoc(doc(db, 'businesses', businessId));
  if (!snap.exists()) return [];
  return normalizeProductPromotions(snap.data().productPromotions);
};

export const saveBusinessProductPromotions = async (businessId, promotions) => {
  if (!businessId) throw new Error('חסר מזהה עסק');
  const normalized = normalizeProductPromotions(promotions).slice(0, MAX_GROUP_PROMOTIONS)
    .map((promo) => ({
      ...promo,
      label: String(promo.label || '').trim().slice(0, MAX_GROUP_PROMOTION_LABEL_LENGTH),
    }));
  await updateDoc(doc(db, 'businesses', businessId), {
    productPromotions: normalized,
    productPromotionsUpdatedAt: new Date(),
  });
  return normalized;
};

export const attachLivePromotionsToItems = (items = [], promotionsByBusinessId = {}) => (
  (Array.isArray(items) ? items : []).map((item) => {
    if (isExcludedFromGroupPromotion(item)) {
      return attachGroupPromotionFields(item, null);
    }
    const live = findActiveGroupPromotionForProduct(
      promotionsByBusinessId[item.businessId] || [],
      item,
    );
    return attachGroupPromotionFields(item, live);
  })
);

export const refreshCartCommercialTerms = async ({ items = [], orderIds = [] } = {}) => {
  const uniqueOrderIds = [...new Set((orderIds.length ? orderIds : items.map((item) => item.orderId)).filter(Boolean))];
  const uniqueBusinessIds = [...new Set(items.map((item) => item.businessId).filter(Boolean))];

  const [orderSnaps, businessSnaps] = await Promise.all([
    Promise.all(uniqueOrderIds.map((orderId) => getDoc(doc(db, 'Orders', orderId)))),
    Promise.all(uniqueBusinessIds.map((businessId) => getDoc(doc(db, 'businesses', businessId)))),
  ]);

  const orderMinimums = {};
  orderSnaps.forEach((snap, index) => {
    if (!snap.exists()) return;
    const data = snap.data();
    orderMinimums[uniqueOrderIds[index]] = normalizeOrderMinimums(
      data.minimumOrderAmount,
      data.minimumOrderItemCount,
    );
  });

  const promotionsByBusinessId = {};
  businessSnaps.forEach((snap, index) => {
    promotionsByBusinessId[uniqueBusinessIds[index]] = snap.exists()
      ? normalizeProductPromotions(snap.data().productPromotions)
      : [];
  });

  return {
    items: applyCartPricing(attachLivePromotionsToItems(items, promotionsByBusinessId)),
    orderMinimums,
    promotionsByBusinessId,
  };
};

export const serializeGroupPromotion = (promotion) => {
  const promo = normalizeGroupPromotion(promotion);
  if (!promo) return null;
  return {
    ...promo,
    label: String(promo.label || '').trim().slice(0, MAX_GROUP_PROMOTION_LABEL_LENGTH),
  };
};
