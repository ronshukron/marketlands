export const roundTo2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const hasValue = (value) => value !== '' && value !== null && value !== undefined;

export const normalizeQuantityDiscount = (threshold, discountedPrice) => {
  if (!hasValue(threshold) && !hasValue(discountedPrice)) return null;

  const normalizedThreshold = Number(threshold);
  const normalizedPrice = Number(discountedPrice);
  if (
    !Number.isFinite(normalizedThreshold)
    || normalizedThreshold <= 0
    || !Number.isFinite(normalizedPrice)
    || normalizedPrice < 0
  ) {
    return null;
  }

  return {
    quantityDiscountThreshold: normalizedThreshold,
    quantityDiscountPrice: normalizedPrice,
  };
};

export const buildDefaultQuantityDiscountLabel = (threshold, discountedPrice) => {
  const discount = normalizeQuantityDiscount(threshold, discountedPrice);
  if (!discount) return '';

  return `${discount.quantityDiscountThreshold}+ ב-₪${discount.quantityDiscountPrice.toFixed(2)} ליחידת מחיר`;
};

export const getQuantityDiscountLabel = ({
  quantityDiscountLabel,
  quantityDiscountThreshold,
  quantityDiscountPrice,
} = {}) => {
  const customLabel = String(quantityDiscountLabel || '').trim();
  if (customLabel) return customLabel;

  return buildDefaultQuantityDiscountLabel(quantityDiscountThreshold, quantityDiscountPrice);
};

export const normalizeQuantityDiscountLabel = (label) => {
  const trimmed = String(label || '').trim();
  return trimmed || null;
};

export const validateQuantityDiscount = (threshold, discountedPrice, basePrice) => {
  const thresholdProvided = hasValue(threshold);
  const priceProvided = hasValue(discountedPrice);
  if (!thresholdProvided && !priceProvided) return '';
  if (!thresholdProvided || !priceProvided) {
    return 'יש להזין גם סף כמות וגם מחיר מוזל.';
  }

  const discount = normalizeQuantityDiscount(threshold, discountedPrice);
  if (!discount) return 'סף הכמות חייב להיות גדול מאפס והמחיר המוזל אינו יכול להיות שלילי.';

  const regularPrice = Number(basePrice);
  if (!Number.isFinite(regularPrice) || discount.quantityDiscountPrice >= regularPrice) {
    return 'המחיר המוזל חייב להיות נמוך מהמחיר הרגיל.';
  }
  return '';
};

export const getBaseUnitPrice = (item = {}) => {
  const value = item.basePrice ?? item.price;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
};

export const getEffectiveUnitPrice = (item = {}, quantity = item.quantity) => {
  if (item.effectivePrice !== undefined && item.effectivePrice !== null) {
    const snapshottedPrice = Number(item.effectivePrice);
    if (Number.isFinite(snapshottedPrice)) return snapshottedPrice;
  }

  const basePrice = getBaseUnitPrice(item);
  const discount = normalizeQuantityDiscount(
    item.quantityDiscountThreshold,
    item.quantityDiscountPrice,
  );
  const numericQuantity = Number(quantity) || 0;
  return discount && numericQuantity >= discount.quantityDiscountThreshold
    ? discount.quantityDiscountPrice
    : basePrice;
};

export const applyQuantityPricing = (item = {}, quantity = item.quantity) => {
  const numericQuantity = Number(quantity) || 0;
  const basePrice = getBaseUnitPrice(item);
  const discount = normalizeQuantityDiscount(
    item.quantityDiscountThreshold,
    item.quantityDiscountPrice,
  );
  const quantityDiscountApplied = Boolean(
    discount && numericQuantity >= discount.quantityDiscountThreshold,
  );
  const effectivePrice = quantityDiscountApplied
    ? discount.quantityDiscountPrice
    : basePrice;

  return {
    ...item,
    quantity: numericQuantity,
    basePrice,
    effectivePrice,
    price: effectivePrice,
    quantityDiscountThreshold: discount?.quantityDiscountThreshold ?? null,
    quantityDiscountPrice: discount?.quantityDiscountPrice ?? null,
    quantityDiscountApplied,
  };
};

export const buildPricingSnapshot = (item = {}) => {
  // Cart lines are already priced against the full order. Re-running group
  // pricing on a single line would drop mix-and-match promotions that only
  // activate when several products together reach the threshold.
  const alreadyPriced = Number.isFinite(Number(item.effectivePrice));
  const pricedItem = alreadyPriced
    ? item
    : (applyCartPricing([item])[0] || applyQuantityPricing(item, item.quantity));
  return {
    basePrice: pricedItem.basePrice ?? getBaseUnitPrice(pricedItem),
    effectivePrice: pricedItem.effectivePrice,
    threshold: pricedItem.quantityDiscountThreshold,
    quantityDiscountThreshold: pricedItem.quantityDiscountThreshold ?? null,
    quantityDiscountPrice: pricedItem.quantityDiscountPrice ?? null,
    quantityDiscountApplied: Boolean(pricedItem.quantityDiscountApplied),
    groupPromotionId: pricedItem.groupPromotionId ?? null,
    groupPromotionLabel: pricedItem.groupPromotionLabel ?? null,
    groupPromotionThreshold: pricedItem.groupPromotionThreshold ?? null,
    groupPromotionPrice: pricedItem.groupPromotionPrice ?? null,
    groupPromotionPricingBasis: pricedItem.groupPromotionPricingBasis ?? null,
    groupPromotionApplied: Boolean(pricedItem.groupPromotionApplied),
  };
};

export const getAverageWeightKg = (item) => {
  if (!item || item.measurementType !== 'unit') return null;
  const avg = Number(item.averageWeightKg);
  return avg > 0 ? avg : 1;
};

export const getEstimatedChargeableQuantity = (item) => {
  if (!item) return 0;
  const qty = Number(item.quantity) || 0;
  if (item.measurementType === 'unit') {
    const avg = getAverageWeightKg(item) || 1;
    return qty * avg;
  }
  return qty;
};

export const getEstimatedLineTotal = (item) => {
  if (!item) return 0;
  const price = getEffectiveUnitPrice(item);
  const chargeQty = getEstimatedChargeableQuantity(item);
  return roundTo2(chargeQty * price);
};

export const GROUP_PROMOTION_PRICING_BASES = ['package', 'unit'];
export const MAX_GROUP_PROMOTIONS = 20;
export const MAX_GROUP_PROMOTION_PRODUCTS = 50;
export const MAX_GROUP_PROMOTION_LABEL_LENGTH = 80;

const toPositiveNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const uniqueStrings = (values = []) => (
  [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))]
);

export const createGroupPromotionId = () => (
  `promo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
);

export const normalizeGroupPromotion = (promotion) => {
  const source = promotion || {};
  const id = String(source.id || '').trim();
  const pricingBasis = GROUP_PROMOTION_PRICING_BASES.includes(source.pricingBasis)
    ? source.pricingBasis
    : '';
  const threshold = toPositiveNumber(source.threshold ?? source.groupPromotionThreshold);
  const bundleTotalPrice = toPositiveNumber(source.bundleTotalPrice);
  let discountedPrice = Number(
    source.discountedPrice
    ?? source.groupPromotionPrice
    ?? source.quantityDiscountPrice
  );
  if (pricingBasis === 'package' && bundleTotalPrice > 0 && threshold > 0) {
    discountedPrice = roundTo2(bundleTotalPrice / threshold);
  }
  const productIds = uniqueStrings(source.productIds || source.groupPromotionProductIds);
  if (
    !id
    || !pricingBasis
    || threshold <= 0
    || !Number.isFinite(discountedPrice)
    || discountedPrice < 0
    || productIds.length === 0
  ) {
    return null;
  }

  return {
    id,
    active: source.active !== false,
    label: String(source.label || source.groupPromotionLabel || '').trim(),
    productIds,
    threshold,
    pricingBasis,
    discountedPrice,
    bundleTotalPrice: pricingBasis === 'package'
      ? (bundleTotalPrice || roundTo2(discountedPrice * threshold))
      : null,
  };
};

export const normalizeProductPromotions = (promotions = []) => (
  (Array.isArray(promotions) ? promotions : [])
    .map(normalizeGroupPromotion)
    .filter(Boolean)
    .slice(0, MAX_GROUP_PROMOTIONS)
);

export const buildDefaultGroupPromotionLabel = (promotion = {}) => {
  const promo = normalizeGroupPromotion(promotion);
  if (!promo) return '';
  if (promo.pricingBasis === 'package') {
    return `${promo.threshold} ב-₪${Number(promo.bundleTotalPrice).toFixed(2)}`;
  }
  return `${promo.threshold}+ ב-₪${promo.discountedPrice.toFixed(2)} לק"ג`;
};

export const getGroupPromotionLabel = (promotion = {}) => {
  const customLabel = String(promotion.label || promotion.groupPromotionLabel || '').trim();
  if (customLabel) return customLabel;
  return buildDefaultGroupPromotionLabel(promotion);
};

export const findActiveGroupPromotionForProduct = (promotions, product = {}) => {
  const productId = String(product.id || product.productId || '').trim();
  const measurementType = product.measurementType || 'kg';
  if (!productId) return null;
  return normalizeProductPromotions(promotions).find((promo) => (
    promo.active
    && promo.pricingBasis === measurementType
    && promo.productIds.includes(productId)
  )) || null;
};

export const attachGroupPromotionFields = (item = {}, promotion) => {
  const promo = normalizeGroupPromotion(promotion);
  if (!promo) {
    return {
      ...item,
      groupPromotionId: null,
      groupPromotionLabel: null,
      groupPromotionThreshold: null,
      groupPromotionPrice: null,
      groupPromotionPricingBasis: null,
      groupPromotionProductIds: null,
      groupPromotionBundleTotalPrice: null,
      groupPromotionApplied: false,
    };
  }

  return {
    ...item,
    groupPromotionId: promo.id,
    groupPromotionLabel: getGroupPromotionLabel(promo),
    groupPromotionThreshold: promo.threshold,
    groupPromotionPrice: promo.discountedPrice,
    groupPromotionPricingBasis: promo.pricingBasis,
    groupPromotionProductIds: promo.productIds,
    groupPromotionBundleTotalPrice: promo.bundleTotalPrice,
  };
};

export const getItemGroupPromotion = (item = {}) => normalizeGroupPromotion({
  id: item.groupPromotionId,
  active: item.groupPromotionActive !== false,
  label: item.groupPromotionLabel,
  productIds: item.groupPromotionProductIds || (item.id ? [item.id] : []),
  threshold: item.groupPromotionThreshold,
  pricingBasis: item.groupPromotionPricingBasis,
  discountedPrice: item.groupPromotionPrice,
  bundleTotalPrice: item.groupPromotionBundleTotalPrice,
});

export const isLineEligibleForGroupPromotion = (item, promotion) => {
  if (!item || item.isShipping || item.isBasketAdjustment) return false;
  const promo = normalizeGroupPromotion(promotion);
  if (!promo || !promo.active) return false;
  const productId = String(item.id || item.productId || '').trim();
  const measurementType = item.measurementType || 'kg';
  return Boolean(
    productId
    && measurementType === promo.pricingBasis
    && promo.productIds.includes(productId)
  );
};

export const validateGroupPromotion = ({
  threshold,
  discountedPrice,
  bundleTotalPrice,
  pricingBasis,
  productIds,
  products = [],
  existingPromotions = [],
  currentId,
} = {}) => {
  if (!GROUP_PROMOTION_PRICING_BASES.includes(pricingBasis)) {
    return 'יש לבחור סוג מבצע: מארז או יחידה.';
  }
  const selectedIds = uniqueStrings(productIds);
  if (selectedIds.length === 0) return 'יש לבחור לפחות מוצר אחד למבצע.';
  if (selectedIds.length > MAX_GROUP_PROMOTION_PRODUCTS) {
    return `ניתן לבחור עד ${MAX_GROUP_PROMOTION_PRODUCTS} מוצרים למבצע.`;
  }

  const normalizedThreshold = Number(threshold);
  if (!Number.isFinite(normalizedThreshold) || normalizedThreshold <= 0) {
    return 'סף הכמות חייב להיות גדול מאפס.';
  }

  let unitPrice = Number(discountedPrice);
  if (pricingBasis === 'package' && hasValue(bundleTotalPrice)) {
    const bundle = Number(bundleTotalPrice);
    if (!Number.isFinite(bundle) || bundle < 0) return 'מחיר המבצע אינו יכול להיות שלילי.';
    unitPrice = bundle / normalizedThreshold;
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return 'המחיר המוזל אינו יכול להיות שלילי.';
  }

  const otherPromotions = normalizeProductPromotions(existingPromotions)
    .filter((promo) => promo.active && promo.id !== currentId);

  for (const productId of selectedIds) {
    const product = products.find((entry) => entry.id === productId);
    if (!product) return 'אחד המוצרים שנבחרו לא נמצא.';
    if ((product.measurementType || 'kg') !== pricingBasis) {
      return pricingBasis === 'package'
        ? 'כל המוצרים במבצע חייבים להיות מסוג מארז.'
        : 'כל המוצרים במבצע חייבים להיות מסוג יחידה.';
    }
    const regularPrice = Number(product.price);
    if (!Number.isFinite(regularPrice) || unitPrice >= regularPrice) {
      return `המחיר המוזל חייב להיות נמוך ממחיר ${product.name || 'המוצר'}.`;
    }
    const conflict = otherPromotions.find((promo) => promo.productIds.includes(productId));
    if (conflict) {
      return `${product.name || 'המוצר'} כבר שייך למבצע פעיל אחר.`;
    }
  }

  return '';
};

// Community settlement discounts later operate on these already-adjusted
// order prices, so group promotions and community percent compose in sequence.
export const applyCartPricing = (items = []) => {
  const list = Array.isArray(items) ? items : [];
  const groupedQuantities = {};

  list.forEach((item) => {
    const promo = getItemGroupPromotion(item);
    if (!isLineEligibleForGroupPromotion(item, promo)) return;
    const key = `${item.orderId || ''}|${promo.id}`;
    groupedQuantities[key] = (groupedQuantities[key] || 0) + (Number(item.quantity) || 0);
  });

  return list.map((item) => {
    const promo = getItemGroupPromotion(item);
    const key = `${item.orderId || ''}|${promo?.id || ''}`;
    const groupQuantity = groupedQuantities[key] || 0;
    const groupApplies = Boolean(
      promo
      && isLineEligibleForGroupPromotion(item, promo)
      && groupQuantity >= promo.threshold
    );

    if (groupApplies) {
      const basePrice = getBaseUnitPrice(item);
      return {
        ...item,
        quantity: Number(item.quantity) || 0,
        basePrice,
        effectivePrice: promo.discountedPrice,
        price: promo.discountedPrice,
        quantityDiscountApplied: false,
        groupPromotionApplied: true,
        groupPromotionId: promo.id,
        groupPromotionLabel: getGroupPromotionLabel(promo),
        groupPromotionThreshold: promo.threshold,
        groupPromotionPrice: promo.discountedPrice,
        groupPromotionPricingBasis: promo.pricingBasis,
        groupPromotionProductIds: promo.productIds,
        groupPromotionBundleTotalPrice: promo.bundleTotalPrice,
      };
    }

    const priced = applyQuantityPricing(item, item.quantity);
    return {
      ...priced,
      groupPromotionApplied: false,
      groupPromotionId: promo?.id ?? item.groupPromotionId ?? null,
      groupPromotionLabel: promo ? getGroupPromotionLabel(promo) : (item.groupPromotionLabel ?? null),
      groupPromotionThreshold: promo?.threshold ?? item.groupPromotionThreshold ?? null,
      groupPromotionPrice: promo?.discountedPrice ?? item.groupPromotionPrice ?? null,
      groupPromotionPricingBasis: promo?.pricingBasis ?? item.groupPromotionPricingBasis ?? null,
      groupPromotionProductIds: promo?.productIds ?? item.groupPromotionProductIds ?? null,
      groupPromotionBundleTotalPrice: promo?.bundleTotalPrice ?? item.groupPromotionBundleTotalPrice ?? null,
    };
  });
};

export const normalizeOrderMinimums = (amount, itemCount) => ({
  minimumOrderAmount: toPositiveNumber(amount),
  minimumOrderItemCount: Number.isFinite(Number(itemCount)) && Number(itemCount) > 0
    ? Math.floor(Number(itemCount))
    : 0,
});

export const isCountableMinimumItem = (item) => {
  if (!item || item.isShipping || item.isBasketAdjustment) return false;
  return item.measurementType === 'unit' || item.measurementType === 'package';
};

export const getEligibleMinimumItemCount = (items = []) => (
  (Array.isArray(items) ? items : []).reduce((sum, item) => (
    sum + (isCountableMinimumItem(item) ? (Number(item.quantity) || 0) : 0)
  ), 0)
);

export const evaluateOrderMinimum = ({
  total,
  items = [],
  minimumOrderAmount = 0,
  minimumOrderItemCount = 0,
} = {}) => {
  const mins = normalizeOrderMinimums(minimumOrderAmount, minimumOrderItemCount);
  const numericTotal = Number(total) || 0;
  const eligibleCount = getEligibleMinimumItemCount(items);
  const amountMet = mins.minimumOrderAmount <= 0 || numericTotal >= mins.minimumOrderAmount;
  const itemsMet = mins.minimumOrderItemCount <= 0 || eligibleCount >= mins.minimumOrderItemCount;
  const hasAny = mins.minimumOrderAmount > 0 || mins.minimumOrderItemCount > 0;

  return {
    valid: !hasAny || (mins.minimumOrderAmount > 0 && amountMet) || (mins.minimumOrderItemCount > 0 && itemsMet),
    amountRequired: mins.minimumOrderAmount,
    itemsRequired: mins.minimumOrderItemCount,
    amountMet,
    itemsMet,
    eligibleCount,
    remainingAmount: mins.minimumOrderAmount > 0
      ? roundTo2(Math.max(0, mins.minimumOrderAmount - numericTotal))
      : 0,
    remainingItems: mins.minimumOrderItemCount > 0
      ? Math.max(0, mins.minimumOrderItemCount - eligibleCount)
      : 0,
  };
};

export const groupPricedItemsByOrder = (items = [], orderInfo = {}) => {
  const grouped = {};
  (Array.isArray(items) ? items : []).forEach((item) => {
    const orderId = item.orderId || 'unknown';
    if (!grouped[orderId]) {
      grouped[orderId] = {
        items: [],
        businessId: item.businessId,
        minimumOrderAmount: orderInfo[orderId]?.minimumOrderAmount || 0,
        minimumOrderItemCount: orderInfo[orderId]?.minimumOrderItemCount || 0,
        total: 0,
      };
    }
    grouped[orderId].items.push(item);
  });
  Object.values(grouped).forEach((group) => {
    group.total = group.items.reduce((sum, item) => sum + getEstimatedLineTotal(item), 0);
  });
  return grouped;
};

export const formatOrderMinimumFailure = (orderData = {}, evaluation) => {
  const result = evaluation || evaluateOrderMinimum(orderData);
  const businessName = orderData.items?.[0]?.businessName || 'העסק';
  const currentTotal = Number(orderData.total) || 0;
  const conditions = [];
  if (result.amountRequired > 0) {
    conditions.push(`סכום ₪${result.amountRequired.toFixed(2)}`);
  }
  if (result.itemsRequired > 0) {
    conditions.push(`${result.itemsRequired} יחידות/מארזים`);
  }
  const requirement = conditions.length > 1
    ? conditions.join(' או ')
    : (conditions[0] || 'מינימום הזמנה');
  return `${businessName}: נדרש ${requirement}. כעת ₪${currentTotal.toFixed(2)} ו-${result.eligibleCount} פריטים מתאימים.`;
};
