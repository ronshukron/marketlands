import {
  marketplaceCommunityNamesMatch,
  normalizeCommunityLabel,
  resolveMarketplaceCommunityName,
} from '../utils/marketplaceCommunityIdentity';
import {
  FULFILLMENT_LABEL_BUSINESS_PICKUP,
  FULFILLMENT_LABEL_VOLUNTEER_PICKUP,
  FULFILLMENT_METHOD_VOLUNTEER_PICKUP,
  summarizeVolunteerPickupPoint,
} from '../utils/marketplaceVolunteerUtils';

/** @typedef {'all' | 'selected'} PickupScope */
/** @typedef {'pickup' | 'delivery' | 'volunteer_pickup'} FulfillmentMethod */
/** @typedef {'accumulation'} PromotionType */

export const PROMOTION_TYPE_ACCUMULATION = 'accumulation';

export const PICKUP_SCOPE_ALL = 'all';
export const PICKUP_SCOPE_SELECTED = 'selected';
export const PICKUP_SCOPE_INHERIT = 'inherit';

export const FULFILLMENT_METHOD_PICKUP = 'pickup';
export const FULFILLMENT_METHOD_DELIVERY = 'delivery';
export { FULFILLMENT_METHOD_VOLUNTEER_PICKUP };

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
  allowVolunteerPickup: false,
  pickupScope: PICKUP_SCOPE_INHERIT,
  pickupCommunities: [],
  deliveryEnabled: true,
  deliveryCommunities: [],
  deliveryInheritFromStore: true,
  deliveryPrice: 0,
  deliveryPriceInheritFromStore: true,
};

const INVALID_COMMUNITY_STRINGS = new Set(['[object Object]', 'undefined', 'null']);

export const normalizeCommunityName = (name) =>
  normalizeCommunityLabel(name);

const toCommunityString = (item) => {
  if (item == null) return '';
  if (typeof item === 'string') return normalizeCommunityName(item);
  if (typeof item === 'object') {
    return normalizeCommunityName(
      item.name || item.label || item.community || item.value || item.spot || ''
    );
  }
  const raw = String(item).trim();
  if (!raw || INVALID_COMMUNITY_STRINGS.has(raw)) return '';
  return normalizeCommunityName(raw);
};

const uniqueStrings = (values = []) =>
  [...new Set(
    values
      .map(toCommunityString)
      .filter(Boolean)
      .map(resolveMarketplaceCommunityName)
  )];

const listFromUnknown = (value) => {
  if (Array.isArray(value)) return uniqueStrings(value);
  if (typeof value === 'string') {
    return uniqueStrings(value.split(/[,;|]/));
  }
  if (value && typeof value === 'object') {
    return uniqueStrings(Object.values(value));
  }
  return [];
};

/** Map any current Firestore alias to its canonical community name. */
export const getCanonicalCommunityName = (name) => {
  return resolveMarketplaceCommunityName(name);
};

export const communityNamesMatch = (configuredName, selectedName) => {
  return marketplaceCommunityNamesMatch(configuredName, selectedName);
};

export const communityListIncludes = (list, communityName) => {
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.some((entry) => communityNamesMatch(entry, communityName));
};

const mergeCommunityLists = (...sources) =>
  uniqueStrings(sources.flatMap((source) => listFromUnknown(source)));

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
  const allowVolunteerPickup = data.allowVolunteerPickup === true;
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
    allowVolunteerPickup,
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

  let pickupCommunities =
    promoF.pickupScope === PICKUP_SCOPE_INHERIT
      ? storeF.pickupCommunities
      : promoF.pickupCommunities;

  pickupCommunities = mergeCommunityLists(
    pickupCommunities,
    promoF.pickupScope === PICKUP_SCOPE_INHERIT ? promotion?.targetCommunities : promotion?.pickupCommunities
  );

  let deliveryCommunities =
    promoF.deliveryInheritFromStore && promoF.deliveryCommunities.length === 0
      ? storeF.deliveryCommunities
      : promoF.deliveryCommunities;

  deliveryCommunities = mergeCommunityLists(
    deliveryCommunities,
    promotion?.serviceRegions,
    promoF.deliveryInheritFromStore ? store?.serviceRegions : null
  );

  const isAccumulation = promoF.promotionType === PROMOTION_TYPE_ACCUMULATION;

  return {
    promotionType: promoF.promotionType,
    pickupEnabled: promoF.allowSelfPickup && storeF.pickupEnabled !== false,
    allowVolunteerPickup: promoF.allowVolunteerPickup === true,
    pickupScope,
    pickupCommunities,
    deliveryEnabled:
      promoF.deliveryEnabled &&
      (storeF.deliveryEnabled || isAccumulation || promoF.deliveryCommunities.length > 0),
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
  if (fulfillment.pickupScope === PICKUP_SCOPE_ALL) return true;
  if (!communityName) return false;
  if (!fulfillment.pickupCommunities?.length) return false;
  return communityListIncludes(fulfillment.pickupCommunities, communityName);
};

export const communityCanDelivery = (fulfillment, communityName) => {
  if (!fulfillment?.deliveryEnabled) return false;
  if (!communityName) return false;
  if (!fulfillment.deliveryCommunities?.length) return true;
  return communityListIncludes(fulfillment.deliveryCommunities, communityName);
};

/** Labels shown to customers for configured pickup/delivery communities. */
export const getConfiguredCommunityLabels = (fulfillment) => {
  if (!fulfillment) return [];
  const labels = new Set();
  if (fulfillment.pickupEnabled && fulfillment.pickupScope !== PICKUP_SCOPE_ALL) {
    fulfillment.pickupCommunities?.forEach((name) => {
      const canonical = getCanonicalCommunityName(name);
      if (canonical) labels.add(canonical);
    });
  }
  if (fulfillment.deliveryEnabled && fulfillment.deliveryCommunities?.length) {
    fulfillment.deliveryCommunities.forEach((name) => {
      const canonical = getCanonicalCommunityName(name);
      if (canonical) labels.add(canonical);
    });
  }
  return [...labels];
};

export const communityCanVolunteerPickup = (
  fulfillment,
  communityName,
  volunteerAvailable = false
) => {
  if (!fulfillment?.allowVolunteerPickup || !volunteerAvailable) return false;
  if (!communityName) return false;
  // Volunteer can open a pickup point for any community the promotion already serves,
  // or for any community when self-pickup is open to all.
  if (communityCanPickup(fulfillment, communityName) || communityCanDelivery(fulfillment, communityName)) {
    return true;
  }
  return fulfillment.pickupEnabled && fulfillment.pickupScope === PICKUP_SCOPE_ALL;
};

export const isCommunityServed = (
  fulfillment,
  communityName,
  { volunteerCommunities = [] } = {}
) => {
  if (!communityName) return true;
  if (communityCanPickup(fulfillment, communityName) || communityCanDelivery(fulfillment, communityName)) {
    return true;
  }
  if (!fulfillment?.allowVolunteerPickup) return false;
  return volunteerCommunities.some((entry) => communityNamesMatch(entry, communityName));
};

export const getServiceableCommunityNames = (
  fulfillment,
  availableCommunities = [],
  { volunteerCommunities = [] } = {}
) =>
  availableCommunities
    .map(getCanonicalCommunityName)
    .filter((name, index, list) => name && list.indexOf(name) === index)
    .filter((name) => isCommunityServed(fulfillment, name, { volunteerCommunities }));

export const getCommonServiceableCommunityNames = (
  fulfillments = [],
  availableCommunities = []
) => {
  if (fulfillments.length === 0) return [];
  return availableCommunities
    .map(getCanonicalCommunityName)
    .filter((name, index, list) => name && list.indexOf(name) === index)
    .filter((name) => fulfillments.every((fulfillment) => isCommunityServed(fulfillment, name)));
};

export const getCustomerFulfillmentOptions = (
  fulfillment,
  communityName,
  { volunteerAvailable = false, volunteer = null } = {}
) => {
  const options = [];
  if (communityCanPickup(fulfillment, communityName)) {
    options.push({
      id: FULFILLMENT_METHOD_PICKUP,
      label: FULFILLMENT_LABEL_BUSINESS_PICKUP,
      description: fulfillment.pickupInstructions || 'איסוף ישירות מהבסטה לפי הוראות העסק',
      subtype: 'business',
    });
  }
  if (communityCanVolunteerPickup(fulfillment, communityName, volunteerAvailable)) {
    options.push({
      id: FULFILLMENT_METHOD_VOLUNTEER_PICKUP,
      label: FULFILLMENT_LABEL_VOLUNTEER_PICKUP,
      description:
        summarizeVolunteerPickupPoint(volunteer) ||
        'איסוף מנקודה שפתח מתנדב בקהילה שלכם',
      subtype: 'volunteer',
      volunteerId: volunteer?.id || null,
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
      subtype: 'delivery',
    });
  }
  return options;
};

export const validateFulfillmentChoice = (
  fulfillment,
  communityName,
  method,
  { volunteerAvailable = false } = {}
) => {
  if (!method) return 'בחרו אופן אספקה';
  if (method === FULFILLMENT_METHOD_PICKUP && !communityCanPickup(fulfillment, communityName)) {
    return 'איסוף עצמי מהבסטה אינו זמין לקהילה שבחרתם';
  }
  if (
    method === FULFILLMENT_METHOD_VOLUNTEER_PICKUP &&
    !communityCanVolunteerPickup(fulfillment, communityName, volunteerAvailable)
  ) {
    return 'איסוף מנקודת מתנדב אינו זמין לקהילה שבחרתם כרגע';
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
    allowVolunteerPickup: promoF.allowVolunteerPickup === true,
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

export const promotionToCustomerFulfillment = (promotion, store) => {
  if (store) {
    const resolved = resolvePromotionFulfillment(promotion, store);
    return {
      promotionType: resolved.promotionType,
      pickupEnabled: resolved.pickupEnabled,
      allowVolunteerPickup: resolved.allowVolunteerPickup === true,
      pickupScope: resolved.pickupScope,
      pickupCommunities: resolved.pickupCommunities,
      deliveryEnabled: resolved.deliveryEnabled,
      deliveryCommunities: resolved.deliveryCommunities,
      deliveryPrice: parseDeliveryPrice(resolved.deliveryPrice),
    };
  }

  const normalized = normalizePromotionFulfillment(promotion);
  // Without a store, never treat "inherit" as open-to-all — that caused
  // false "served" matches in listing vs order pages.
  const pickupScope =
    normalized.pickupScope === PICKUP_SCOPE_INHERIT
      ? PICKUP_SCOPE_SELECTED
      : normalized.pickupScope;
  return {
    promotionType: normalized.promotionType,
    pickupEnabled: normalized.allowSelfPickup,
    allowVolunteerPickup: normalized.allowVolunteerPickup === true,
    pickupScope,
    pickupCommunities: mergeCommunityLists(
      normalized.pickupCommunities,
      promotion?.targetCommunities
    ),
    deliveryEnabled: normalized.deliveryEnabled,
    deliveryCommunities: mergeCommunityLists(
      normalized.deliveryCommunities,
      promotion?.serviceRegions
    ),
    deliveryPrice: parseDeliveryPrice(normalized.deliveryPrice),
  };
};

export const formatPromotionCardLines = (promotion) =>
  formatFulfillmentSummaryLines({
    ...(promotion?.customerFulfillment || promotionToCustomerFulfillment(promotion)),
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
