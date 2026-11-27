import { isCityPlace } from './cityDeliveryFee';

// How a weekly basket reaches the customer, and which ways a community offers.
// Home delivery is the default whenever the community offers it (the owner's
// choice); its fee is shown, and charged only if the admin ticks it in V7/V8.

export const DELIVERY_OPTION_LABELS = {
  pickup: 'איסוף מנקודת החלוקה',
  homeDelivery: 'משלוח עד הבית',
  boxCollection: 'איסוף מארגז',
};

/** The options a community offers, from its pickup-spot data. */
export const deliveryOptionsForSpot = (spotData) => {
  if (!spotData) return ['pickup'];
  if (isCityPlace(spotData)) return ['homeDelivery'];
  const options = Array.isArray(spotData.options) && spotData.options.length > 0 ? spotData.options : ['pickup'];
  return options.filter((option) => DELIVERY_OPTION_LABELS[option]);
};

/** Home delivery when offered, otherwise the first option. */
export const preferredDeliveryOption = (options) => (
  (options || []).includes('homeDelivery') ? 'homeDelivery' : ((options || [])[0] || 'pickup')
);
