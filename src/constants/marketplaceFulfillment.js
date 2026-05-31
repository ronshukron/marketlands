/** @typedef {'all' | 'selected'} PickupScope */
/** @typedef {'pickup' | 'delivery'} FulfillmentMethod */
/** @typedef {'accumulation'} PromotionType */

export const PROMOTION_TYPE_ACCUMULATION = 'accumulation';

export const PICKUP_SCOPE_ALL = 'all';
export const PICKUP_SCOPE_SELECTED = 'selected';
export const PICKUP_SCOPE_INHERIT = 'inherit';

export const FULFILLMENT_METHOD_PICKUP = 'pickup';
export const FULFILLMENT_METHOD_DELIVERY = 'delivery';

export const parseDeliveryPrice = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
};

export const formatDeliveryPrice = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(
    parseDeliveryPrice(value)
  );

export const getDeliveryFeeForMethod = (fulfillment, method) => {
  if (method !== FULFILLMENT_METHOD_DELIVERY) return 0;
  return parseDeliveryPrice(fulfillment?.deliveryPrice);
};

export const DEFAULT_STORE_FULFILLMENT = {
  pickupEnabled: true,
  pickupScope: PICKUP_SCOPE_ALL,
  pickupCommunities: [],
  deliveryEnabled: false,
  deliveryCommunities: [],
  deliveryPrice: 0,
  pickupInstructions: '',
  deliveryInstructions: '',
};

export const DEFAULT_PROMOTION_FULFILLMENT = {
  promotionType: PROMOTION_TYPE_ACCUMULATION,
  allowSelfPickup: true,
  pickupScope: PICKUP_SCOPE_INHERIT,
  pickupCommunities: [],
  deliveryEnabled: true,
  deliveryCommunities: [],
  deliveryInheritFromStore: true,
  deliveryPrice: 0,
  deliveryPriceInheritFromStore: true,
};

const uniqueStrings = (values = []) =>
  [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];

const listFromUnknown = (value) => {
  if (Array.isArray(value)) return uniqueStrings(value);
  if (typeof value === 'string') {
    return uniqueStrings(value.split(','));
  }
  return [];
};

/** Normalize store document → fulfillment settings (with legacy field migration). */
export const normalizeStoreFulfillment = (source) => {
  const data = source && typeof source === 'object' ? source : {};
  const legacyTargets = listFromUnknown(data.targetCommunities);
  const legacyRegions = listFromUnknown(data.serviceRegions);

  let pickupScope = data.pickupScope;
  let pickupCommunities = listFromUnknown(data.pickupCommunities);
  let deliveryEnabled = Boolean(data.deliveryEnabled);
  let deliveryCommunities = listFromUnknown(data.deliveryCommunities);

  if (!pickupScope) {
    pickupScope = legacyTargets.length > 0 ? PICKUP_SCOPE_SELECTED : PICKUP_SCOPE_ALL;
    if (pickupCommunities.length === 0) pickupCommunities = legacyTargets;
  }

  if (!data.deliveryEnabled && legacyRegions.length > 0) {
    deliveryEnabled = true;
    if (deliveryCommunities.length === 0) deliveryCommunities = legacyRegions;
  }

  return {
    pickupEnabled: data.pickupEnabled !== false,
    pickupScope: pickupScope === PICKUP_SCOPE_SELECTED ? PICKUP_SCOPE_SELECTED : PICKUP_SCOPE_ALL,
    pickupCommunities,
    deliveryEnabled,
    deliveryCommunities,
    deliveryPrice: parseDeliveryPrice(data.deliveryPrice),
    pickupInstructions: data.pickupInstructions || '',
    deliveryInstructions: data.deliveryInstructions || '',
  };
};

/** Form-friendly store fulfillment (checkbox arrays, not comma strings). */
export const storeFulfillmentToForm = (source) => normalizeStoreFulfillment(source);

export const normalizePromotionFulfillment = (source) => {
  const data = source && typeof source === 'object' ? source : {};
  const legacyTargets = listFromUnknown(data.targetCommunities);
  const legacyRegions = listFromUnknown(data.serviceRegions);
  const legacyMode = data.deliveryMode || 'pickup';

  let promotionType = data.promotionType || PROMOTION_TYPE_ACCUMULATION;
  let allowSelfPickup = data.allowSelfPickup !== false;
  let pickupScope = data.pickupScope || PICKUP_SCOPE_INHERIT;
  let pickupCommunities = listFromUnknown(data.pickupCommunities);
  let deliveryEnabled = data.deliveryEnabled;
  let deliveryCommunities = listFromUnknown(data.deliveryCommunities);
  let deliveryInheritFromStore = data.deliveryInheritFromStore !== false;

  if (deliveryEnabled === undefined) {
    deliveryEnabled = legacyMode === 'delivery' || legacyMode === 'both' || legacyMode === 'all_week';
    if (legacyMode === 'pickup') deliveryEnabled = false;
  }

  if (!data.pickupScope && legacyTargets.length > 0) {
    pickupScope = PICKUP_SCOPE_SELECTED;
    if (pickupCommunities.length === 0) pickupCommunities = legacyTargets;
  }

  if (deliveryCommunities.length === 0 && legacyRegions.length > 0) {
    deliveryCommunities = legacyRegions;
    deliveryInheritFromStore = false;
  }

  if (legacyMode === 'delivery') allowSelfPickup = false;
  if (legacyMode === 'pickup') deliveryEnabled = false;

  return {
    promotionType,
    allowSelfPickup,
    pickupScope,
    pickupCommunities,
    deliveryEnabled: Boolean(deliveryEnabled),
    deliveryCommunities,
    deliveryInheritFromStore,
    deliveryPrice: parseDeliveryPrice(data.deliveryPrice),
    deliveryPriceInheritFromStore: data.deliveryPriceInheritFromStore !== false,
  };
};

/** Effective fulfillment for a customer-facing flow. */
export const resolvePromotionFulfillment = (promotion, store) => {
  const storeF = normalizeStoreFulfillment(store);
  const promoF = normalizePromotionFulfillment(promotion);

  const pickupScope =
    promoF.pickupScope === PICKUP_SCOPE_INHERIT
      ? storeF.pickupScope
      : promoF.pickupScope === PICKUP_SCOPE_SELECTED
        ? PICKUP_SCOPE_SELECTED
        : PICKUP_SCOPE_ALL;

  const pickupCommunities =
    promoF.pickupScope === PICKUP_SCOPE_INHERIT
      ? storeF.pickupCommunities
      : promoF.pickupCommunities;

  const deliveryCommunities =
    promoF.deliveryInheritFromStore && promoF.deliveryCommunities.length === 0
      ? storeF.deliveryCommunities
      : promoF.deliveryCommunities;

  return {
    promotionType: promoF.promotionType,
    pickupEnabled: promoF.allowSelfPickup && storeF.pickupEnabled,
    pickupScope,
    pickupCommunities,
    deliveryEnabled: promoF.deliveryEnabled && storeF.deliveryEnabled,
    deliveryCommunities,
    deliveryPrice:
      promoF.deliveryPriceInheritFromStore !== false
        ? storeF.deliveryPrice
        : promoF.deliveryPrice,
    pickupInstructions: promotion?.pickupInstructions || storeF.pickupInstructions,
    deliveryInstructions: storeF.deliveryInstructions,
    batchDeliveryDate: promotion?.deliveryDate || '',
    orderClosesAt: promotion?.endsAt || null,
    orderOpensAt: promotion?.startsAt || null,
  };
};

export const communityCanPickup = (fulfillment, communityName) => {
  if (!fulfillment?.pickupEnabled) return false;
  if (!communityName) return true;
  if (fulfillment.pickupScope === PICKUP_SCOPE_ALL) return true;
  return fulfillment.pickupCommunities.includes(communityName);
};

export const communityCanDelivery = (fulfillment, communityName) => {
  if (!fulfillment?.deliveryEnabled) return false;
  if (!communityName) return fulfillment.deliveryCommunities.length > 0;
  return fulfillment.deliveryCommunities.includes(communityName);
};

export const isCommunityServed = (fulfillment, communityName) => {
  if (!communityName) return true;
  return communityCanPickup(fulfillment, communityName) || communityCanDelivery(fulfillment, communityName);
};

export const getCustomerFulfillmentOptions = (fulfillment, communityName) => {
  const options = [];
  if (communityCanPickup(fulfillment, communityName)) {
    options.push({
      id: FULFILLMENT_METHOD_PICKUP,
      label: 'איסוף עצמי',
      description: fulfillment.pickupInstructions || 'איסוף לפי הוראות הבסטה',
    });
  }
  if (communityCanDelivery(fulfillment, communityName)) {
    const dateNote = fulfillment.batchDeliveryDate
      ? ` · משלוח בתאריך ${fulfillment.batchDeliveryDate}`
      : '';
    const deliveryPrice = parseDeliveryPrice(fulfillment.deliveryPrice);
    const priceNote = deliveryPrice > 0 ? ` (+${formatDeliveryPrice(deliveryPrice)})` : '';
    options.push({
      id: FULFILLMENT_METHOD_DELIVERY,
      label: `משלוח לקהילה${priceNote}${dateNote}`,
      description: fulfillment.deliveryInstructions || 'משלוח לפי תיאום עם הבסטה',
      deliveryPrice,
    });
  }
  return options;
};

export const validateFulfillmentChoice = (fulfillment, communityName, method) => {
  if (!method) return 'בחרו אופן אספקה';
  if (method === FULFILLMENT_METHOD_PICKUP && !communityCanPickup(fulfillment, communityName)) {
    return 'איסוף עצמי אינו זמין לקהילה שבחרתם';
  }
  if (method === FULFILLMENT_METHOD_DELIVERY && !communityCanDelivery(fulfillment, communityName)) {
    return 'משלוח אינו זמין לקהילה שבחרתם';
  }
  return null;
};

/** Persist promotion fulfillment with inherited delivery communities resolved. */
export const preparePromotionFulfillmentForSave = (promotionData = {}, store) => {
  const storeF = normalizeStoreFulfillment(store);
  const promoF = normalizePromotionFulfillment(promotionData);

  const deliveryCommunities =
    promoF.deliveryInheritFromStore && promoF.deliveryCommunities.length === 0
      ? storeF.deliveryCommunities
      : promoF.deliveryCommunities;

  let pickupScope = promoF.pickupScope;
  let pickupCommunities = promoF.pickupCommunities;
  if (pickupScope === PICKUP_SCOPE_INHERIT) {
    pickupScope = storeF.pickupScope;
    pickupCommunities = storeF.pickupCommunities;
  }

  const deliveryPrice =
    promoF.deliveryPriceInheritFromStore !== false
      ? storeF.deliveryPrice
      : promoF.deliveryPrice;

  return {
    promotionType: promoF.promotionType,
    allowSelfPickup: promoF.allowSelfPickup,
    pickupScope,
    pickupCommunities,
    deliveryEnabled: promoF.deliveryEnabled,
    deliveryCommunities,
    deliveryInheritFromStore: promoF.deliveryInheritFromStore,
    deliveryPrice,
    deliveryPriceInheritFromStore: promoF.deliveryPriceInheritFromStore,
    pickupInstructions: promotionData.pickupInstructions || '',
  };
};

export const promotionToCustomerFulfillment = (promotion) => ({
  pickupEnabled: promotion?.allowSelfPickup !== false,
  pickupScope: promotion?.pickupScope || PICKUP_SCOPE_ALL,
  pickupCommunities: Array.isArray(promotion?.pickupCommunities) ? promotion.pickupCommunities : [],
  deliveryEnabled: Boolean(promotion?.deliveryEnabled),
  deliveryCommunities: Array.isArray(promotion?.deliveryCommunities)
    ? promotion.deliveryCommunities
    : [],
  deliveryPrice: parseDeliveryPrice(promotion?.deliveryPrice),
});

export const formatPromotionCardLines = (promotion) =>
  formatFulfillmentSummaryLines({
    ...promotionToCustomerFulfillment(promotion),
    promotionType: promotion?.promotionType || PROMOTION_TYPE_ACCUMULATION,
    batchDeliveryDate: promotion?.deliveryDate || '',
  });

export const formatFulfillmentSummaryLines = (fulfillment) => {
  const lines = [];
  if (!fulfillment) return lines;

  if (fulfillment.promotionType === PROMOTION_TYPE_ACCUMULATION) {
    lines.push('הזמנה מצטברת לאורך השבוע');
    if (fulfillment.batchDeliveryDate) {
      lines.push(`משלוח מרוכז בתאריך ${fulfillment.batchDeliveryDate}`);
    }
  }

  if (fulfillment.pickupEnabled) {
    if (fulfillment.pickupScope === PICKUP_SCOPE_ALL) {
      lines.push('איסוף עצמי: פתוח לכל הקהילות');
    } else if (fulfillment.pickupCommunities.length > 0) {
      lines.push(`איסוף עצמי: ${fulfillment.pickupCommunities.join(' · ')}`);
    } else {
      lines.push('איסוף עצמי: לפי קהילות שנבחרו');
    }
  }

  if (fulfillment.deliveryEnabled) {
    const priceNote =
      parseDeliveryPrice(fulfillment.deliveryPrice) > 0
        ? ` · ${formatDeliveryPrice(fulfillment.deliveryPrice)}`
        : '';
    if (fulfillment.deliveryCommunities.length > 0) {
      lines.push(`משלוח: ${fulfillment.deliveryCommunities.join(' · ')}${priceNote}`);
    } else {
      lines.push(`משלוח: לפי תיאום${priceNote}`);
    }
  }

  return lines;
};
