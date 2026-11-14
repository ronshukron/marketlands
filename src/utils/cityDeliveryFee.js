import { getEstimatedLineTotal } from './pricing';

export const PLACE_TYPE_COMMUNITY = 'community';
export const PLACE_TYPE_CITY = 'city';
export const SHIPPING_PRODUCT_ID = 'Mdean61FIezxRcMUZjVn';

export const normalizePlaceType = (value) => (
  value === PLACE_TYPE_CITY ? PLACE_TYPE_CITY : PLACE_TYPE_COMMUNITY
);

export const normalizeFreeShippingMinCart = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

export const isCityPlace = (spotData) => normalizePlaceType(spotData?.placeType) === PLACE_TYPE_CITY;

export const isShippingCartItem = (item) => item?.id === SHIPPING_PRODUCT_ID || item?.isShipping === true;

// The introduction-basket price adjustment is flagged isShipping (so it skips
// stock and minimum checks) but it is part of what the customer pays for goods.
// Leaving it out would count a discounted basket at its full component price
// and hand out free shipping too early.
const countsTowardProductSubtotal = (item) => (
  item?.isBasketAdjustment === true || !isShippingCartItem(item)
);

export const getProductSubtotal = (cartItems = []) => (
  (Array.isArray(cartItems) ? cartItems : [])
    .filter(countsTowardProductSubtotal)
    .reduce((sum, item) => sum + getEstimatedLineTotal(item), 0)
);

/**
 * Home-delivery fee for a city: free once the product subtotal reaches the
 * threshold, otherwise the city's deliveryFee. Returns null for non-city places
 * so callers keep the legacy community shipping product price.
 */
export const computeCityDeliveryFee = (spotData, productSubtotal) => {
  if (!isCityPlace(spotData)) return null;
  const fee = Math.max(0, Number(spotData?.deliveryFee) || 0);
  const threshold = normalizeFreeShippingMinCart(spotData?.freeShippingMinCart);
  if (threshold > 0 && (Number(productSubtotal) || 0) >= threshold) return 0;
  return fee;
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** ₪200 / ₪12.50 */
export const formatShekels = (value) => {
  const amount = roundMoney(value);
  return `₪${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
};

/**
 * What to tell a city customer about delivery before checkout.
 * Returns null for settlements and for cities that deliver for free anyway.
 * { fee, threshold, isFree, missing } - missing is how much more to add to the
 * cart to reach free shipping (0 when there is no threshold or it was reached).
 */
export const getCityShippingInfo = (spotData, productSubtotal = 0) => {
  if (!isCityPlace(spotData)) return null;
  const fee = Math.max(0, Number(spotData?.deliveryFee) || 0);
  if (fee === 0) return null;
  const threshold = normalizeFreeShippingMinCart(spotData?.freeShippingMinCart);
  const subtotal = Math.max(0, Number(productSubtotal) || 0);
  const isFree = computeCityDeliveryFee(spotData, subtotal) === 0;
  return {
    fee,
    threshold,
    isFree,
    missing: threshold > 0 && !isFree ? roundMoney(threshold - subtotal) : 0,
  };
};

/** One short Hebrew line for the store and the cart. hasItems = the cart has products. */
export const describeCityShipping = (info, { hasItems = false } = {}) => {
  if (!info) return '';
  if (info.threshold <= 0) return `משלוח עד הבית ${formatShekels(info.fee)}`;
  if (info.isFree) return `הגעתם ל-${formatShekels(info.threshold)}, המשלוח עד הבית חינם`;
  if (hasItems) {
    return `חסרים עוד ${formatShekels(info.missing)} למשלוח חינם (משלוח עד הבית ${formatShekels(info.fee)})`;
  }
  return `משלוח עד הבית ${formatShekels(info.fee)}. משלוח חינם בהזמנה מעל ${formatShekels(info.threshold)}`;
};
