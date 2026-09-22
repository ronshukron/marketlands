import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { isIndependentBusinessAccount } from '../utils/accountRoles';
import {
  buildCommunityWeeklyPromotionAnalytics,
  emptyCommunityWeeklyPromotionAnalytics,
  promotionTargetCommunities,
} from '../utils/communityWeeklyPromotionAnalytics';
import { resolveCommunityName } from './pickupSpotsService';

export const COMMUNITY_WEEKLY_PROMOTIONS_COLLECTION = 'communityWeeklyPromotions';
export const COMMUNITY_WEEKLY_PROMOTION_UNLOCKS_COLLECTION = 'communityWeeklyPromotionUnlocks';
export const COMMUNITY_WEEKLY_PROMOTION_STATS_COLLECTION = 'communityWeeklyPromotionStats';

export const COMMUNITY_WEEKLY_PROMOTION_STATUSES = Object.freeze({
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  ARCHIVED: 'archived',
});

export const COMMUNITY_WEEKLY_PROMOTION_TRANSITIONS = Object.freeze({
  draft: ['draft', 'scheduled', 'active', 'archived'],
  scheduled: ['draft', 'scheduled', 'active', 'archived'],
  active: ['active', 'archived'],
  archived: ['archived'],
});

const mapSnapshot = (snapshot) => (
  snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
);

const mapQuerySnapshot = (snapshot) => snapshot.docs.map((entry) => ({
  id: entry.id,
  ...entry.data(),
}));

const timestampMillis = (value) => {
  if (!value) return Number.NaN;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
};

const requiredString = (value, field, maxLength) => {
  const cleaned = String(value || '').trim();
  if (!cleaned) throw new Error(`${field} is required`);
  if (cleaned.length > maxLength) throw new Error(`${field} must be at most ${maxLength} characters`);
  return cleaned;
};

const optionalString = (value, field, maxLength) => {
  const cleaned = String(value || '').trim();
  if (cleaned.length > maxLength) throw new Error(`${field} must be at most ${maxLength} characters`);
  return cleaned;
};

const finiteNumber = (value, field, { min = 0, max = 1000000 } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${field} must be a number between ${min} and ${max}`);
  }
  return number;
};

export const isValidCommunityWeeklyPromotionTransition = (fromStatus, toStatus) => (
  Boolean(COMMUNITY_WEEKLY_PROMOTION_TRANSITIONS[fromStatus]?.includes(toStatus))
);

export const getCommunityPromotionUnlockId = (promotionId, communityCode) => {
  const promotion = requiredString(promotionId, 'promotionId', 200);
  const community = requiredString(communityCode, 'communityCode', 120);
  return `${encodeURIComponent(promotion)}__${encodeURIComponent(community)}`;
};

export const validateCommunityWeeklyPromotion = (input = {}) => {
  const status = input.status || COMMUNITY_WEEKLY_PROMOTION_STATUSES.DRAFT;
  if (!Object.values(COMMUNITY_WEEKLY_PROMOTION_STATUSES).includes(status)) {
    throw new Error('status is invalid');
  }

  const weekKey = requiredString(input.weekKey, 'weekKey', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    throw new Error('weekKey must use YYYY-MM-DD');
  }

  const startsAt = timestampMillis(input.startsAt);
  const endsAt = timestampMillis(input.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt >= endsAt) {
    throw new Error('startsAt and endsAt must define a valid increasing time range');
  }

  if (!Array.isArray(input.targetCommunities) || input.targetCommunities.length === 0) {
    throw new Error('targetCommunities must contain at least one community');
  }
  if (!Array.isArray(input.targetCommunityCodes) || input.targetCommunityCodes.length === 0) {
    throw new Error('targetCommunityCodes must contain at least one community code');
  }

  const targetCommunities = input.targetCommunities.map((community, index) => {
    if (typeof community === 'string') {
      return requiredString(community, `targetCommunities[${index}]`, 160);
    }
    return {
      ...community,
      code: requiredString(community?.code, `targetCommunities[${index}].code`, 120),
      name: requiredString(community?.name, `targetCommunities[${index}].name`, 160),
    };
  });
  const targetCommunityCodes = [...new Set(input.targetCommunityCodes.map(
    (code, index) => requiredString(code, `targetCommunityCodes[${index}]`, 120),
  ))];

  if (!Array.isArray(input.productSnapshots) || input.productSnapshots.length === 0) {
    throw new Error('productSnapshots must contain at least one product');
  }
  if (input.productSnapshots.length > 250) {
    throw new Error('productSnapshots must contain at most 250 products');
  }
  const productSnapshots = input.productSnapshots.map((product, index) => {
    const regularPrice = finiteNumber(product?.regularPrice, `productSnapshots[${index}].regularPrice`);
    const promotionPrice = finiteNumber(
      product?.promotionPrice,
      `productSnapshots[${index}].promotionPrice`,
    );
    if (promotionPrice <= 0 || promotionPrice >= regularPrice) {
      throw new Error(`productSnapshots[${index}].promotionPrice must be below regularPrice`);
    }
    return {
      ...product,
      productId: requiredString(product?.productId || product?.id, `productSnapshots[${index}].productId`, 200),
      businessId: requiredString(product?.businessId, `productSnapshots[${index}].businessId`, 200),
      name: requiredString(product?.name, `productSnapshots[${index}].name`, 300),
      imageUrl: optionalString(product?.imageUrl, `productSnapshots[${index}].imageUrl`, 2000),
      regularPrice,
      promotionPrice,
    };
  });

  const schemaVersion = finiteNumber(input.schemaVersion, 'schemaVersion', { min: 1, max: 100 });
  const pricingVersion = requiredString(input.pricingVersion, 'pricingVersion', 100);

  return {
    ...input,
    title: requiredString(input.title, 'title', 200),
    weekKey,
    status,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    targetCommunities,
    targetCommunityCodes,
    productSnapshots,
    shareConfig: {
      enabled: input.shareConfig?.enabled !== false,
      headline: optionalString(input.shareConfig?.headline, 'shareConfig.headline', 240),
      message: optionalString(input.shareConfig?.message, 'shareConfig.message', 2000),
    },
    schemaVersion,
    pricingVersion,
  };
};

export class CommunityWeeklyPromotionApiError extends Error {
  constructor(message, { status = 0, code = '', details = null } = {}) {
    super(message);
    this.name = 'CommunityWeeklyPromotionApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const toFirestoreTimestamp = (value) => {
  if (value && typeof value.toMillis === 'function') return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('startsAt and endsAt must define a valid increasing time range');
  }
  return Timestamp.fromDate(date);
};

const toPromotionDocument = (input, { createdAt } = {}) => {
  const validated = validateCommunityWeeklyPromotion(input);
  return {
    title: validated.title,
    weekKey: validated.weekKey,
    status: validated.status,
    startsAt: toFirestoreTimestamp(validated.startsAt),
    endsAt: toFirestoreTimestamp(validated.endsAt),
    targetCommunities: validated.targetCommunities,
    targetCommunityCodes: validated.targetCommunityCodes,
    productSnapshots: validated.productSnapshots,
    shareConfig: validated.shareConfig,
    schemaVersion: validated.schemaVersion,
    pricingVersion: validated.pricingVersion,
    ...(validated.duplicatedFromPromotionId
      ? { duplicatedFromPromotionId: requiredString(validated.duplicatedFromPromotionId, 'duplicatedFromPromotionId', 200) }
      : {}),
    createdAt: createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
};

const promotionRef = (promotionId) => doc(
  db,
  COMMUNITY_WEEKLY_PROMOTIONS_COLLECTION,
  requiredString(promotionId, 'promotionId', 200),
);

export const listPromotions = async ({ status, maxResults = 100 } = {}) => {
  const clauses = [];
  if (status) {
    if (!Object.values(COMMUNITY_WEEKLY_PROMOTION_STATUSES).includes(status)) {
      throw new Error('status is invalid');
    }
    clauses.push(where('status', '==', status));
  }
  clauses.push(orderBy('startsAt', 'desc'), limit(Math.min(Math.max(maxResults, 1), 250)));
  const snapshot = await getDocs(query(
    collection(db, COMMUNITY_WEEKLY_PROMOTIONS_COLLECTION),
    ...clauses,
  ));
  return mapQuerySnapshot(snapshot);
};

export const getPromotion = async (promotionId) => {
  if (!promotionId) return null;
  return mapSnapshot(await getDoc(doc(db, COMMUNITY_WEEKLY_PROMOTIONS_COLLECTION, promotionId)));
};

const DELAYED_ORDERS_COLLECTION = 'customerOrdersDelayed';
const CUSTOMER_ORDERS_COLLECTION = 'customerOrders';

const promotionTargetCodes = (promotion = {}) => [
  ...new Set(promotionTargetCommunities(promotion).map((community) => community.communityCode)),
];

export const listCommunityUnlocksForPromotion = async (promotion) => {
  const promotionId = String(promotion?.id || '').trim();
  if (!promotionId) return [];

  const codes = promotionTargetCodes(promotion);
  if (codes.length === 0) return [];

  const unlocks = await Promise.all(codes.map(async (communityCode) => {
    try {
      return await getCommunityPromotionUnlock(promotionId, communityCode);
    } catch (error) {
      console.warn('Failed to read community weekly promotion unlock', { promotionId, communityCode, error });
      return null;
    }
  }));
  return unlocks.filter(Boolean);
};

const fetchOrdersForWeeklyPromotionAnalytics = async () => {
  const snapshots = await Promise.allSettled([
    getDocs(collection(db, DELAYED_ORDERS_COLLECTION)),
    getDocs(collection(db, CUSTOMER_ORDERS_COLLECTION)),
  ]);
  const byId = new Map();
  snapshots.forEach((result, index) => {
    const source = index === 0 ? DELAYED_ORDERS_COLLECTION : CUSTOMER_ORDERS_COLLECTION;
    if (result.status !== 'fulfilled') {
      console.warn('Failed to load orders for weekly promotion analytics', { source, error: result.reason });
      return;
    }
    mapQuerySnapshot(result.value).forEach((order) => {
      if (!order.id || byId.has(order.id)) return;
      byId.set(order.id, { ...order, source });
    });
  });
  return [...byId.values()];
};

export const getPromotionsAnalytics = async (promotions = []) => {
  const valid = (Array.isArray(promotions) ? promotions : []).filter((promotion) => promotion?.id);
  if (valid.length === 0) return [];

  const [orders, unlockGroups] = await Promise.all([
    fetchOrdersForWeeklyPromotionAnalytics(),
    Promise.all(valid.map((promotion) => listCommunityUnlocksForPromotion(promotion))),
  ]);

  return valid.map((promotion, index) => buildCommunityWeeklyPromotionAnalytics({
    promotion,
    unlocks: unlockGroups[index],
    orders,
  }));
};

export const getPromotionStats = async (promotionId, promotionHint = null) => {
  if (!promotionId) return emptyCommunityWeeklyPromotionAnalytics();
  const promotion = promotionHint?.id === promotionId
    ? promotionHint
    : await getPromotion(promotionId);
  if (!promotion?.id) return emptyCommunityWeeklyPromotionAnalytics();
  const [stats] = await getPromotionsAnalytics([promotion]);
  return stats || emptyCommunityWeeklyPromotionAnalytics();
};

const promotionCommunityNames = (promotion = {}) => (
  (Array.isArray(promotion.targetCommunities) ? promotion.targetCommunities : [])
    .map((community) => (typeof community === 'string' ? community : community?.name))
    .filter(Boolean)
);

export const promotionTargetsCommunity = (promotion, { communityCode, communityName } = {}) => {
  const codes = Array.isArray(promotion?.targetCommunityCodes) ? promotion.targetCommunityCodes : [];
  if (communityCode && codes.includes(communityCode)) return true;

  const resolvedName = String(resolveCommunityName(communityName) || communityName || '').trim();
  if (!resolvedName) return false;
  return promotionCommunityNames(promotion).some((name) => (
    String(resolveCommunityName(name) || name).trim() === resolvedName
  ));
};

export const isPromotionActiveNow = (promotion, now = new Date()) => {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return promotion?.status === COMMUNITY_WEEKLY_PROMOTION_STATUSES.ACTIVE
    && timestampMillis(promotion.startsAt) <= nowMs
    && timestampMillis(promotion.endsAt) > nowMs;
};

const pickActivePromotionForCommunity = (promotions, { communityCode, communityName, now } = {}) => (
  (Array.isArray(promotions) ? promotions : [])
    .filter((promotion) => (
      isPromotionActiveNow(promotion, now)
      && promotionTargetsCommunity(promotion, { communityCode, communityName })
    ))
    .sort((left, right) => timestampMillis(right.startsAt) - timestampMillis(left.startsAt))[0] || null
);

const queryPromotions = async (...clauses) => mapQuerySnapshot(await getDocs(query(
  collection(db, COMMUNITY_WEEKLY_PROMOTIONS_COLLECTION),
  ...clauses,
)));

export const getActivePromotionForCommunity = async (
  communityCode,
  { now = new Date(), communityName } = {},
) => {
  if (!communityCode && !communityName) return null;

  const pick = (promotions) => pickActivePromotionForCommunity(promotions, {
    communityCode,
    communityName,
    now,
  });

  if (communityCode) {
    try {
      const nowTimestamp = Timestamp.fromDate(now instanceof Date ? now : new Date(now));
      const exact = pick(await queryPromotions(
        where('status', '==', COMMUNITY_WEEKLY_PROMOTION_STATUSES.ACTIVE),
        where('targetCommunityCodes', 'array-contains', communityCode),
        where('startsAt', '<=', nowTimestamp),
        where('endsAt', '>', nowTimestamp),
        orderBy('startsAt', 'desc'),
        orderBy('endsAt', 'asc'),
        limit(10),
      ));
      if (exact) return exact;
    } catch (error) {
      console.warn('Constrained weekly promotion query failed, trying a simpler lookup', error);
    }

    try {
      const simple = pick(await queryPromotions(
        where('status', '==', COMMUNITY_WEEKLY_PROMOTION_STATUSES.ACTIVE),
        where('targetCommunityCodes', 'array-contains', communityCode),
        limit(10),
      ));
      if (simple) return simple;
    } catch (error) {
      console.warn('Active weekly promotion query failed, trying a status-only lookup', error);
    }
  }

  // Equality + limit uses the automatic single-field status index. This is the
  // public-safe fallback when the composite community/time index is missing.
  try {
    const byStatus = pick(await queryPromotions(
      where('status', '==', COMMUNITY_WEEKLY_PROMOTION_STATUSES.ACTIVE),
      limit(10),
    ));
    if (byStatus) return byStatus;
  } catch (error) {
    console.warn('Status-limited weekly promotion query failed, trying admin list fallback', error);
  }

  try {
    return pick(await listPromotions({
      status: COMMUNITY_WEEKLY_PROMOTION_STATUSES.ACTIVE,
      maxResults: 25,
    }));
  } catch {
    return null;
  }
};

export const getCommunityPromotionUnlock = async (promotionId, communityCode) => {
  if (!promotionId || !communityCode) return null;
  const unlockId = getCommunityPromotionUnlockId(promotionId, communityCode);
  return mapSnapshot(await getDoc(doc(
    db,
    COMMUNITY_WEEKLY_PROMOTION_UNLOCKS_COLLECTION,
    unlockId,
  )));
};

export const createPromotion = async (promotion) => {
  const document = toPromotionDocument({
    ...promotion,
    status: COMMUNITY_WEEKLY_PROMOTION_STATUSES.DRAFT,
  });
  const ref = await addDoc(collection(db, COMMUNITY_WEEKLY_PROMOTIONS_COLLECTION), document);
  return { promotion: { id: ref.id, ...document } };
};

export const updatePromotion = async (promotionId, patch = {}) => {
  const existing = await getPromotion(promotionId);
  if (!existing) throw new Error('promotion not found');
  if (
    existing.status !== COMMUNITY_WEEKLY_PROMOTION_STATUSES.DRAFT
    && existing.status !== COMMUNITY_WEEKLY_PROMOTION_STATUSES.SCHEDULED
  ) {
    throw new Error('only draft or scheduled promotions can be edited');
  }

  const document = toPromotionDocument({
    ...existing,
    ...patch,
    status: existing.status,
  }, { createdAt: existing.createdAt || serverTimestamp() });
  await updateDoc(promotionRef(promotionId), document);
  return { promotion: { id: existing.id, ...document } };
};

export const publishPromotion = async (promotionId) => {
  const existing = await getPromotion(promotionId);
  if (!existing) throw new Error('promotion not found');

  const nextStatus = timestampMillis(existing.startsAt) > Date.now()
    ? COMMUNITY_WEEKLY_PROMOTION_STATUSES.SCHEDULED
    : COMMUNITY_WEEKLY_PROMOTION_STATUSES.ACTIVE;
  if (!isValidCommunityWeeklyPromotionTransition(existing.status, nextStatus)) {
    throw new Error('this promotion cannot be published');
  }

  const document = {
    status: nextStatus,
    publishedAt: existing.publishedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await updateDoc(promotionRef(promotionId), document);
  return { promotion: { ...existing, ...document } };
};

export const archivePromotion = async (promotionId) => {
  const existing = await getPromotion(promotionId);
  if (!existing) throw new Error('promotion not found');
  if (!isValidCommunityWeeklyPromotionTransition(
    existing.status,
    COMMUNITY_WEEKLY_PROMOTION_STATUSES.ARCHIVED,
  )) {
    throw new Error('this promotion cannot be archived');
  }

  const document = {
    status: COMMUNITY_WEEKLY_PROMOTION_STATUSES.ARCHIVED,
    archivedAt: existing.archivedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await updateDoc(promotionRef(promotionId), document);
  return { promotion: { ...existing, ...document } };
};

export const duplicatePromotion = async (promotionId, overrides = {}) => {
  const existing = await getPromotion(promotionId);
  if (!existing) throw new Error('promotion not found');
  const {
    id,
    createdAt,
    updatedAt,
    publishedAt,
    archivedAt,
    ...copy
  } = existing;
  return createPromotion({
    ...copy,
    ...overrides,
    status: COMMUNITY_WEEKLY_PROMOTION_STATUSES.DRAFT,
    duplicatedFromPromotionId: existing.id,
  });
};

export const confirmCommunityUnlock = async ({
  promotionId,
  communityCode,
  promotion,
} = {}) => {
  const cleanPromotionId = requiredString(promotionId, 'promotionId', 200);
  const cleanCommunityCode = requiredString(communityCode, 'communityCode', 120);
  const unlockId = getCommunityPromotionUnlockId(cleanPromotionId, cleanCommunityCode);
  const unlock = {
    promotionId: cleanPromotionId,
    communityCode: cleanCommunityCode,
    unlocked: true,
    confirmedAt: serverTimestamp(),
    unlockedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    pricingVersion: requiredString(promotion?.pricingVersion, 'pricingVersion', 100),
    schemaVersion: finiteNumber(promotion?.schemaVersion, 'schemaVersion', { min: 1, max: 100 }),
  };

  await setDoc(
    doc(db, COMMUNITY_WEEKLY_PROMOTION_UNLOCKS_COLLECTION, unlockId),
    unlock,
    { merge: true },
  );

  return { promotionId: cleanPromotionId, communityCode: cleanCommunityCode, unlock };
};

export const isCommunityWeeklyPricingMismatch = (error) => (
  Boolean(error)
  && (error.code === 'pricing-mismatch' || error.status === 409)
);

export const describeCommunityWeeklyCheckoutRefreshError = (error) => {
  if (!isCommunityWeeklyPricingMismatch(error)) return null;
  return {
    title: 'המחיר השבועי השתנה',
    text: 'המחיר הקהילתי כבר לא תקף לעגלה זו. רעננו את העמוד ונסו שוב.',
  };
};

const pricingMismatch = (details = {}) => new CommunityWeeklyPromotionApiError(
  'Promotion pricing changed',
  { status: 409, code: 'pricing-mismatch', details },
);

export const validateCommunityWeeklyCartPricing = async ({
  promotionId,
  communityCode,
  pricingVersion,
  items = [],
} = {}) => {
  const promotion = await getPromotion(promotionId);
  const unlock = await getCommunityPromotionUnlock(promotionId, communityCode);
  const now = Date.now();
  const isActive = promotion?.status === COMMUNITY_WEEKLY_PROMOTION_STATUSES.ACTIVE
    && timestampMillis(promotion.startsAt) <= now
    && timestampMillis(promotion.endsAt) > now
    && (promotion.targetCommunityCodes || []).includes(communityCode);

  if (!isActive || unlock?.unlocked !== true) {
    throw pricingMismatch({ reason: 'promotion-not-unlocked' });
  }
  if (pricingVersion && pricingVersion !== promotion.pricingVersion) {
    throw pricingMismatch({ pricingVersion: promotion.pricingVersion });
  }

  const snapshots = Array.isArray(promotion.productSnapshots) ? promotion.productSnapshots : [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const productId = String(item.productId || item.id || '').trim();
    const orderId = String(item.orderId || '').trim();
    const snapshot = (
      (orderId && snapshots.find((entry) => (
        String(entry.productId || entry.id || '') === productId
        && String(entry.orderId || '') === orderId
      )))
      || snapshots.find((entry) => String(entry.productId || entry.id || '') === productId)
    );
    const expected = Number(snapshot?.promotionPrice);
    const actual = Number(item.unitPrice ?? item.effectivePrice ?? item.price);
    if (!snapshot || !Number.isFinite(expected) || Math.abs(expected - actual) > 0.009) {
      throw pricingMismatch({
        pricingVersion: promotion.pricingVersion,
        invalidItems: [{ productId, reason: 'unit-price-mismatch', expectedUnitPrice: expected }],
      });
    }
  });

  return {
    valid: true,
    promotionId,
    communityCode,
    pricingVersion: promotion.pricingVersion,
  };
};

export const validateAppliedCommunityWeeklyPricing = async (items = []) => {
  const applied = (Array.isArray(items) ? items : []).filter(
    (item) => item?.communityWeeklyPromotionApplied === true,
  );
  if (applied.length === 0) return [];

  const groups = new Map();
  applied.forEach((item) => {
    const promotionId = String(item.communityWeeklyPromotionId || '').trim();
    const communityCode = String(item.communityWeeklyPromotionCommunityCode || '').trim();
    if (!promotionId || !communityCode) {
      throw pricingMismatch({ reason: 'missing-identity' });
    }
    const key = `${promotionId}|${communityCode}`;
    if (!groups.has(key)) {
      groups.set(key, {
        promotionId,
        communityCode,
        pricingVersion: item.communityWeeklyPromotionPricingVersion || null,
        items: [],
      });
    }
    groups.get(key).items.push({
      productId: item.productId || item.id,
      businessId: item.businessId,
      orderId: item.orderId || null,
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.effectivePrice ?? item.price) || 0,
      measurementType: item.measurementType || 'kg',
    });
  });

  return Promise.all(
    [...groups.values()].map((payload) => validateCommunityWeeklyCartPricing(payload)),
  );
};

export const loadEligibleWeeklyProducts = async () => {
  const businessSnapshot = await getDocs(collection(db, 'businesses'));
  const businesses = mapQuerySnapshot(businessSnapshot)
    .filter((business) => !isIndependentBusinessAccount(business))
    .sort((a, b) => (
      a.businessName || a.name || a.email || a.id
    ).localeCompare(b.businessName || b.name || b.email || b.id, 'he'));

  const productEntries = await Promise.all(businesses.map(async (business) => {
    const productSnapshot = await getDocs(query(
      collection(db, 'Products'),
      where('Owner_ID', '==', business.id),
    ));
    return [
      business.id,
      mapQuerySnapshot(productSnapshot)
        .map((product) => ({ ...product, businessId: business.id }))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he')),
    ];
  }));

  return {
    businesses,
    productsByBusiness: Object.fromEntries(productEntries),
    products: productEntries.flatMap(([, products]) => products),
  };
};
