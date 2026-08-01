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
  const pricedItem = applyQuantityPricing(item, item.quantity);
  return {
    basePrice: pricedItem.basePrice,
    effectivePrice: pricedItem.effectivePrice,
    threshold: pricedItem.quantityDiscountThreshold,
    quantityDiscountThreshold: pricedItem.quantityDiscountThreshold,
    quantityDiscountPrice: pricedItem.quantityDiscountPrice,
    quantityDiscountApplied: pricedItem.quantityDiscountApplied,
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
