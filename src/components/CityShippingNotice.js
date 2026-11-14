import React from 'react';
import usePickupSpots from '../hooks/usePickupSpots';
import { resolveCommunityName } from '../services/pickupSpotsService';
import { describeCityShipping, getCityShippingInfo, getProductSubtotal } from '../utils/cityDeliveryFee';

/**
 * Tells a city customer the delivery fee and the free-shipping threshold
 * before checkout. Renders nothing for settlements.
 * - Without cartItems (store page): the fee and "free above ₪X".
 * - With cartItems (cart): how much is missing, or that shipping is free.
 */
const CityShippingNotice = ({ community, cartItems = null, className = '' }) => {
  const { pickupSpotsData } = usePickupSpots();
  if (!community) return null;

  const resolved = resolveCommunityName(community) || community;
  const spotData = pickupSpotsData?.[resolved] || pickupSpotsData?.[community] || null;
  const hasCart = Array.isArray(cartItems);
  const productSubtotal = hasCart ? getProductSubtotal(cartItems) : 0;
  const info = getCityShippingInfo(spotData, productSubtotal);
  if (!info) return null;

  const text = describeCityShipping(info, { hasItems: hasCart && productSubtotal > 0 });
  const tone = info.isFree
    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : 'bg-blue-50 border-blue-200 text-blue-900';

  return (
    <p
      className={`rounded-lg border px-3 py-2 text-right text-sm font-semibold ${tone} ${className}`}
      dir="rtl"
      role="status"
    >
      {text}
    </p>
  );
};

export default CityShippingNotice;
