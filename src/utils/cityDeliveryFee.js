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

export const getProductSubtotal = (cartItems = []) => (
  (Array.isArray(cartItems) ? cartItems : [])
    .filter((item) => !isShippingCartItem(item))
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
