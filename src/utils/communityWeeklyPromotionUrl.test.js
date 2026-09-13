import {
  COMMUNITY_WEEKLY_PROMOTION_ATTRIBUTION_KEY,
  buildCommunityWeeklyPromotionUrl,
  getOrCreateCommunityWeeklyPromotionVisitKey,
  loadCommunityWeeklyPromotionAttribution,
  parseCommunityWeeklyPromotionUrl,
  storeCommunityWeeklyPromotionAttribution,
} from './communityWeeklyPromotionUrl';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: jest.fn((key) => values.get(key) ?? null),
    setItem: jest.fn((key, value) => values.set(key, value)),
    removeItem: jest.fn((key) => values.delete(key)),
  };
};

describe('community weekly promotion URL utilities', () => {
  test('builds and parses encoded promotion attribution', () => {
    const url = buildCommunityWeeklyPromotionUrl('https://shop.example/order?keep=1', {
      promo: 'opaque/token + value',
      community: 'north/a',
      source: 'whatsapp',
      campaign: 'week 35',
    });

    expect(url).toContain('keep=1');
    expect(parseCommunityWeeklyPromotionUrl(url)).toEqual({
      promo: 'opaque/token + value',
      community: 'north/a',
      source: 'whatsapp',
      campaign: 'week 35',
    });
  });

  test('removes empty managed parameters while preserving unrelated parameters', () => {
    const url = buildCommunityWeeklyPromotionUrl(
      'https://shop.example/order?promo=old&src=old&keep=yes',
      { community: 'south' },
    );
    const parsed = new URL(url);

    expect(parsed.searchParams.get('promo')).toBeNull();
    expect(parsed.searchParams.get('src')).toBeNull();
    expect(parsed.searchParams.get('community')).toBe('south');
    expect(parsed.searchParams.get('keep')).toBe('yes');
  });

  test('stores attribution with a TTL and removes it after expiry', () => {
    const storage = createStorage();
    const stored = storeCommunityWeeklyPromotionAttribution(
      storage,
      { promo: 'token', community: 'north', src: 'qr' },
      { now: 1000, ttlMs: 5000 },
    );

    expect(stored).toMatchObject({
      promo: 'token',
      community: 'north',
      source: 'qr',
      capturedAt: 1000,
      expiresAt: 6000,
    });
    expect(loadCommunityWeeklyPromotionAttribution(storage, { now: 5999 }))
      .toMatchObject({ promo: 'token', source: 'qr' });
    expect(loadCommunityWeeklyPromotionAttribution(storage, { now: 6000 })).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(
      COMMUNITY_WEEKLY_PROMOTION_ATTRIBUTION_KEY,
    );
  });

  test('does not overwrite storage for an empty attribution', () => {
    const storage = createStorage();
    expect(storeCommunityWeeklyPromotionAttribution(storage, {})).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test('reuses an idempotency key for the same attribution until expiry', () => {
    const storage = createStorage();
    const randomUuid = jest.fn()
      .mockReturnValueOnce('visit-1')
      .mockReturnValueOnce('visit-2');
    const attribution = {
      promo: 'token',
      community: 'north',
      source: 'whatsapp',
      campaign: 'w35',
    };

    const first = getOrCreateCommunityWeeklyPromotionVisitKey(
      storage,
      attribution,
      { now: 1000, ttlMs: 5000, randomUuid },
    );
    const repeated = getOrCreateCommunityWeeklyPromotionVisitKey(
      storage,
      attribution,
      { now: 2000, ttlMs: 5000, randomUuid },
    );
    const afterExpiry = getOrCreateCommunityWeeklyPromotionVisitKey(
      storage,
      attribution,
      { now: 6000, ttlMs: 5000, randomUuid },
    );

    expect(first).toBe('visit-1');
    expect(repeated).toBe('visit-1');
    expect(afterExpiry).toBe('visit-2');
    expect(randomUuid).toHaveBeenCalledTimes(2);
  });

  test('uses different visit keys for different campaign attribution', () => {
    const storage = createStorage();
    const randomUuid = jest.fn()
      .mockReturnValueOnce('visit-a')
      .mockReturnValueOnce('visit-b');

    expect(getOrCreateCommunityWeeklyPromotionVisitKey(
      storage,
      { promo: 'token', campaign: 'a' },
      { now: 1000, randomUuid },
    )).toBe('visit-a');
    expect(getOrCreateCommunityWeeklyPromotionVisitKey(
      storage,
      { promo: 'token', campaign: 'b' },
      { now: 1000, randomUuid },
    )).toBe('visit-b');
  });
});
