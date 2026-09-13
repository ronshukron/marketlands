export const COMMUNITY_WEEKLY_PROMOTION_QUERY_KEYS = Object.freeze({
  promo: 'promo',
  community: 'community',
  source: 'src',
  campaign: 'campaign',
});

export const COMMUNITY_WEEKLY_PROMOTION_ATTRIBUTION_KEY = 'communityWeeklyPromotionAttribution.v1';
export const COMMUNITY_WEEKLY_PROMOTION_VISIT_KEYS_KEY = 'communityWeeklyPromotionVisitKeys.v1';
export const COMMUNITY_WEEKLY_PROMOTION_ATTRIBUTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_LENGTHS = {
  promo: 512,
  community: 120,
  source: 100,
  campaign: 160,
};

const clean = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

const toUrl = (input, baseUrl) => {
  if (input instanceof URL) return new URL(input.toString());
  const fallbackBase = baseUrl
    || (typeof window !== 'undefined' ? window.location.origin : 'https://example.invalid');
  return new URL(String(input || fallbackBase), fallbackBase);
};

export const normalizeCommunityWeeklyPromotionAttribution = (value = {}) => ({
  promo: clean(value.promo, MAX_LENGTHS.promo),
  community: clean(value.community, MAX_LENGTHS.community),
  source: clean(value.source ?? value.src, MAX_LENGTHS.source),
  campaign: clean(value.campaign, MAX_LENGTHS.campaign),
});

export const parseCommunityWeeklyPromotionUrl = (input, { baseUrl } = {}) => {
  const url = toUrl(input, baseUrl);
  return normalizeCommunityWeeklyPromotionAttribution({
    promo: url.searchParams.get(COMMUNITY_WEEKLY_PROMOTION_QUERY_KEYS.promo),
    community: url.searchParams.get(COMMUNITY_WEEKLY_PROMOTION_QUERY_KEYS.community),
    source: url.searchParams.get(COMMUNITY_WEEKLY_PROMOTION_QUERY_KEYS.source),
    campaign: url.searchParams.get(COMMUNITY_WEEKLY_PROMOTION_QUERY_KEYS.campaign),
  });
};

export const buildCommunityWeeklyPromotionUrl = (baseUrl, attribution = {}) => {
  const url = toUrl(baseUrl);
  const normalized = normalizeCommunityWeeklyPromotionAttribution(attribution);

  Object.entries(COMMUNITY_WEEKLY_PROMOTION_QUERY_KEYS).forEach(([field, queryKey]) => {
    if (normalized[field]) url.searchParams.set(queryKey, normalized[field]);
    else url.searchParams.delete(queryKey);
  });
  return url.toString();
};

const safeReadJson = (storage, key) => {
  if (!storage) return null;
  try {
    const value = storage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const safeWriteJson = (storage, key, value) => {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const toMillis = (value) => {
  const millis = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(millis) ? millis : Date.now();
};

export const storeCommunityWeeklyPromotionAttribution = (
  storage,
  attribution,
  {
    now = Date.now(),
    ttlMs = COMMUNITY_WEEKLY_PROMOTION_ATTRIBUTION_TTL_MS,
  } = {},
) => {
  const normalized = normalizeCommunityWeeklyPromotionAttribution(attribution);
  if (!normalized.promo && !normalized.community && !normalized.source && !normalized.campaign) {
    return null;
  }
  const capturedAt = toMillis(now);
  const record = {
    ...normalized,
    capturedAt,
    expiresAt: capturedAt + Math.max(0, Number(ttlMs) || 0),
  };
  return safeWriteJson(storage, COMMUNITY_WEEKLY_PROMOTION_ATTRIBUTION_KEY, record)
    ? record
    : null;
};

export const loadCommunityWeeklyPromotionAttribution = (
  storage,
  { now = Date.now() } = {},
) => {
  const record = safeReadJson(storage, COMMUNITY_WEEKLY_PROMOTION_ATTRIBUTION_KEY);
  if (!record || !Number.isFinite(Number(record.expiresAt)) || Number(record.expiresAt) <= toMillis(now)) {
    try {
      storage?.removeItem(COMMUNITY_WEEKLY_PROMOTION_ATTRIBUTION_KEY);
    } catch {
      // Storage can be disabled; an expired attribution still behaves as absent.
    }
    return null;
  }
  return {
    ...normalizeCommunityWeeklyPromotionAttribution(record),
    capturedAt: Number(record.capturedAt),
    expiresAt: Number(record.expiresAt),
  };
};

export const clearCommunityWeeklyPromotionAttribution = (storage) => {
  try {
    storage?.removeItem(COMMUNITY_WEEKLY_PROMOTION_ATTRIBUTION_KEY);
  } catch {
    // Clearing attribution is best effort.
  }
};

export const buildCommunityWeeklyPromotionOrderAttribution = (storage, options = {}) => {
  const record = loadCommunityWeeklyPromotionAttribution(storage, options);
  if (!record?.promo || !record?.community) return null;
  return {
    promotionId: record.promo,
    communityCode: record.community,
    campaign: record.campaign || null,
    sourceTokenPresent: Boolean(record.source),
    capturedAt: record.capturedAt,
    expiresAt: record.expiresAt,
    trust: 'client_attribution_only',
  };
};

const attributionSignature = (attribution) => {
  const value = normalizeCommunityWeeklyPromotionAttribution(attribution);
  return [value.promo, value.community, value.source, value.campaign]
    .map((part) => encodeURIComponent(part))
    .join('|');
};

const createOpaqueId = (randomUuid) => {
  if (randomUuid) return randomUuid();
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
};

export const getOrCreateCommunityWeeklyPromotionVisitKey = (
  storage,
  attribution,
  {
    now = Date.now(),
    ttlMs = COMMUNITY_WEEKLY_PROMOTION_ATTRIBUTION_TTL_MS,
    randomUuid,
  } = {},
) => {
  const signature = attributionSignature(attribution);
  const currentTime = toMillis(now);
  const saved = safeReadJson(storage, COMMUNITY_WEEKLY_PROMOTION_VISIT_KEYS_KEY) || {};
  const existing = saved[signature];
  if (
    existing?.key
    && Number.isFinite(Number(existing.expiresAt))
    && Number(existing.expiresAt) > currentTime
  ) {
    return existing.key;
  }

  const key = createOpaqueId(randomUuid);
  const unexpired = Object.fromEntries(Object.entries(saved).filter(([, entry]) => (
    entry?.key && Number(entry.expiresAt) > currentTime
  )));
  unexpired[signature] = {
    key,
    expiresAt: currentTime + Math.max(0, Number(ttlMs) || 0),
  };
  safeWriteJson(storage, COMMUNITY_WEEKLY_PROMOTION_VISIT_KEYS_KEY, unexpired);
  return key;
};
