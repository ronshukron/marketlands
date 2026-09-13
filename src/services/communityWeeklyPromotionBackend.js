import {
  COMMUNITY_WEEKLY_PROMOTION_STATUSES,
  getCommunityPromotionUnlockId,
  isValidCommunityWeeklyPromotionTransition,
  validateCommunityWeeklyPromotion,
} from './communityWeeklyPromotionService';
import { isIndependentBusinessAccount } from '../utils/accountRoles';
import { applyCartPricing, attachCommunityWeeklyPromotionFields, roundTo2 } from '../utils/pricing';

export const COMMUNITY_WEEKLY_PROMOTION_PRICING_VERSION = 'community-weekly-v1';
export const COMMUNITY_WEEKLY_PROMOTION_SCHEMA_VERSION = 1;

const EVENT_TYPES = Object.freeze([
  'share_started',
  'unlock_confirmed',
  'visit',
  'order_attributed',
]);

const toMillis = (value, fallback = Date.now()) => {
  if (!value) return fallback;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
};

const requiredString = (value, field, maxLength) => {
  const cleaned = String(value || '').trim();
  if (!cleaned) throw new Error(`${field} is required`);
  if (cleaned.length > maxLength) throw new Error(`${field} is too long`);
  return cleaned;
};

export const isAdminActor = (actor = {}) => (
  actor.admin === true
  || actor.role === 'admin'
  || actor.claims?.admin === true
  || actor.claims?.role === 'admin'
);

export const assertAdminActor = (actor) => {
  if (!isAdminActor(actor)) {
    const error = new Error('Admin required');
    error.code = 'forbidden';
    error.status = 403;
    throw error;
  }
};

export const hashOpaqueToken = (value) => {
  const input = String(value || '');
  // Portable fingerprint for tests and request-id construction. Production
  // Cloud Functions must store SHA-256 hex of the raw token instead.
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32_${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const buildEventIdempotencyKey = ({
  type,
  promotionId,
  communityCode = '',
  visitKeyHash = '',
} = {}) => (
  [
    requiredString(type, 'type', 40),
    requiredString(promotionId, 'promotionId', 200),
    String(communityCode || '').trim(),
    String(visitKeyHash || '').trim(),
  ].map((part) => encodeURIComponent(part)).join('|')
);

export const shouldRateLimit = ({
  hits = 0,
  limit = 20,
  windowStartedAt,
  now = Date.now(),
  windowMs = 10 * 60 * 1000,
} = {}) => {
  const started = toMillis(windowStartedAt, now);
  if (now - started > windowMs) return { limited: false, hits: 1, resetAt: now + windowMs };
  const nextHits = Number(hits) + 1;
  return {
    limited: nextHits > limit,
    hits: nextHits,
    resetAt: started + windowMs,
  };
};

export const resolvePromotionLifecycleStatus = (promotion, now = new Date()) => {
  const status = promotion?.status || COMMUNITY_WEEKLY_PROMOTION_STATUSES.DRAFT;
  if (status === COMMUNITY_WEEKLY_PROMOTION_STATUSES.ARCHIVED) {
    return COMMUNITY_WEEKLY_PROMOTION_STATUSES.ARCHIVED;
  }
  const current = toMillis(now);
  const startsAt = toMillis(promotion?.startsAt, Number.NEGATIVE_INFINITY);
  const endsAt = toMillis(promotion?.endsAt, Number.POSITIVE_INFINITY);
  if (status === COMMUNITY_WEEKLY_PROMOTION_STATUSES.DRAFT) {
    return COMMUNITY_WEEKLY_PROMOTION_STATUSES.DRAFT;
  }
  if (current >= endsAt) return COMMUNITY_WEEKLY_PROMOTION_STATUSES.ARCHIVED;
  if (current < startsAt) return COMMUNITY_WEEKLY_PROMOTION_STATUSES.SCHEDULED;
  return COMMUNITY_WEEKLY_PROMOTION_STATUSES.ACTIVE;
};

export const assertPromotionTransition = (fromStatus, toStatus) => {
  if (!isValidCommunityWeeklyPromotionTransition(fromStatus, toStatus)) {
    const error = new Error(`Invalid promotion transition from ${fromStatus} to ${toStatus}`);
    error.code = 'invalid-state';
    error.status = 409;
    throw error;
  }
};

export const rejectIndependentBusinesses = (businesses = []) => {
  const independent = (Array.isArray(businesses) ? businesses : [])
    .filter((business) => isIndependentBusinessAccount(business));
  if (independent.length > 0) {
    const error = new Error('Independent businesses cannot join community weekly promotions');
    error.code = 'invalid-argument';
    error.status = 400;
    error.details = { businessIds: independent.map((business) => business.id) };
    throw error;
  }
};

export const normalizePublishedPromotion = (input = {}) => {
  const promotion = validateCommunityWeeklyPromotion({
    ...input,
    schemaVersion: input.schemaVersion || COMMUNITY_WEEKLY_PROMOTION_SCHEMA_VERSION,
    pricingVersion: input.pricingVersion || COMMUNITY_WEEKLY_PROMOTION_PRICING_VERSION,
  });
  if (promotion.productSnapshots.some((product) => Number(product.promotionPrice) >= Number(product.regularPrice))) {
    const error = new Error('promotionPrice must be below regularPrice');
    error.code = 'invalid-argument';
    error.status = 400;
    throw error;
  }
  return promotion;
};

export const isPromotionActiveForCommunity = ({
  promotion,
  communityCode,
  now = new Date(),
} = {}) => {
  if (!promotion || resolvePromotionLifecycleStatus(promotion, now) !== COMMUNITY_WEEKLY_PROMOTION_STATUSES.ACTIVE) {
    return false;
  }
  const codes = Array.isArray(promotion.targetCommunityCodes) ? promotion.targetCommunityCodes : [];
  return codes.includes(String(communityCode || '').trim());
};

export const buildPublicUnlockDocument = ({
  promotion,
  communityCode,
  alreadyUnlocked = false,
  confirmedCount = 0,
  now = new Date(),
} = {}) => {
  const code = requiredString(communityCode, 'communityCode', 120);
  const promotionId = requiredString(promotion?.id || promotion?.promotionId, 'promotionId', 200);
  const timestamp = now instanceof Date ? now.toISOString() : String(now);
  return {
    id: getCommunityPromotionUnlockId(promotionId, code),
    promotionId,
    communityCode: code,
    unlocked: true,
    confirmedAt: timestamp,
    unlockedAt: alreadyUnlocked ? undefined : timestamp,
    confirmedCount: Number(confirmedCount) + (alreadyUnlocked ? 0 : 1),
    schemaVersion: promotion.schemaVersion || COMMUNITY_WEEKLY_PROMOTION_SCHEMA_VERSION,
    pricingVersion: promotion.pricingVersion || COMMUNITY_WEEKLY_PROMOTION_PRICING_VERSION,
    updatedAt: timestamp,
  };
};

export const decideCommunityUnlock = ({
  promotion,
  communityCode,
  existingUnlock,
  tokenRecord,
  now = new Date(),
} = {}) => {
  if (!isPromotionActiveForCommunity({ promotion, communityCode, now })) {
    const error = new Error('Promotion is not active for this community');
    error.code = 'invalid-state';
    error.status = 409;
    throw error;
  }
  if (!tokenRecord || tokenRecord.revokedAt || toMillis(tokenRecord.expiresAt, Number.POSITIVE_INFINITY) <= toMillis(now)) {
    const error = new Error('Share token is invalid');
    error.code = 'invalid-argument';
    error.status = 400;
    throw error;
  }
  if (existingUnlock?.unlocked === true) {
    return {
      alreadyProcessed: true,
      unlock: {
        ...existingUnlock,
        unlocked: true,
      },
    };
  }
  return {
    alreadyProcessed: false,
    unlock: buildPublicUnlockDocument({
      promotion,
      communityCode,
      confirmedCount: existingUnlock?.confirmedCount || 0,
      now,
    }),
  };
};

export const validateCartAgainstPromotion = ({
  promotion,
  unlock,
  communityCode,
  items = [],
  now = new Date(),
} = {}) => {
  if (!isPromotionActiveForCommunity({ promotion, communityCode, now }) || unlock?.unlocked !== true) {
    const error = new Error('Community weekly prices are not unlocked');
    error.code = 'pricing-mismatch';
    error.status = 409;
    throw error;
  }

  const snapshots = new Map(
    (Array.isArray(promotion.productSnapshots) ? promotion.productSnapshots : []).map((snapshot) => [
      `${snapshot.productId}|${snapshot.orderId || ''}|${snapshot.businessId || ''}`,
      snapshot,
    ]),
  );
  const pricedItems = [];
  const invalidItems = [];

  items.forEach((item) => {
    const productId = String(item.productId || item.id || '').trim();
    const businessId = String(item.businessId || '').trim();
    const orderId = String(item.orderId || '').trim();
    const snapshot = snapshots.get(`${productId}|${orderId}|${businessId}`)
      || snapshots.get(`${productId}||${businessId}`)
      || snapshots.get(`${productId}|${orderId}|`)
      || snapshots.get(`${productId}||`);
    const expectedUnitPrice = Number(snapshot?.promotionPrice);
    const submittedUnitPrice = Number(item.unitPrice ?? item.effectivePrice ?? item.price);
    if (!snapshot || !Number.isFinite(expectedUnitPrice) || roundTo2(submittedUnitPrice) !== roundTo2(expectedUnitPrice)) {
      invalidItems.push({
        productId,
        businessId,
        reason: 'unit-price-mismatch',
        expectedUnitPrice: Number.isFinite(expectedUnitPrice) ? expectedUnitPrice : null,
      });
      return;
    }
    const quantity = Number(item.quantity) || 0;
    pricedItems.push({
      productId,
      businessId,
      quantity,
      unitPrice: expectedUnitPrice,
      lineTotal: roundTo2(quantity * expectedUnitPrice),
    });
  });

  if (invalidItems.length > 0) {
    const error = new Error('Promotion pricing changed');
    error.code = 'pricing-mismatch';
    error.status = 409;
    error.details = {
      pricingVersion: promotion.pricingVersion,
      invalidItems,
    };
    throw error;
  }

  return {
    valid: true,
    promotionId: promotion.id,
    communityCode,
    pricingVersion: promotion.pricingVersion,
    items: pricedItems,
    total: roundTo2(pricedItems.reduce((sum, item) => sum + item.lineTotal, 0)),
  };
};

export const repriceCheckoutLines = ({
  items = [],
  promotion,
  communityCode,
  unlocked,
} = {}) => applyCartPricing(
  (Array.isArray(items) ? items : []).map((item) => attachCommunityWeeklyPromotionFields(item, unlocked ? {
    id: promotion?.id,
    promotionPrice: (promotion?.productSnapshots || []).find((snapshot) => (
      String(snapshot.productId || snapshot.id) === String(item.productId || item.id)
    ))?.promotionPrice,
    status: 'active',
    startsAt: promotion?.startsAt,
    endsAt: promotion?.endsAt,
    weekKey: promotion?.weekKey,
    communityCode,
    unlocked: true,
    schemaVersion: promotion?.schemaVersion,
    pricingVersion: promotion?.pricingVersion,
    productId: item.productId || item.id,
    orderId: item.orderId,
  } : null)),
);

export const incrementStats = (current = {}, eventType) => {
  if (!EVENT_TYPES.includes(eventType)) return current;
  const next = {
    visits: Number(current.visits) || 0,
    uniqueVisits: Number(current.uniqueVisits) || 0,
    unlockConfirmations: Number(current.unlockConfirmations) || 0,
    promotionalOrders: Number(current.promotionalOrders || current.orders) || 0,
    revenue: Number(current.revenue) || 0,
  };
  if (eventType === 'visit') {
    next.visits += 1;
    next.uniqueVisits += 1;
  }
  if (eventType === 'unlock_confirmed') next.unlockConfirmations += 1;
  if (eventType === 'order_attributed') next.promotionalOrders += 1;
  const conversion = next.uniqueVisits > 0
    ? roundTo2(next.promotionalOrders / next.uniqueVisits)
    : 0;
  return { ...current, ...next, conversion };
};
