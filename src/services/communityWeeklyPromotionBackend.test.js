import { isIndependentBusinessAccount } from '../utils/accountRoles';
import {
  assertAdminActor,
  buildEventIdempotencyKey,
  decideCommunityUnlock,
  hashOpaqueToken,
  incrementStats,
  isPromotionActiveForCommunity,
  normalizePublishedPromotion,
  rejectIndependentBusinesses,
  shouldRateLimit,
  validateCartAgainstPromotion,
} from './communityWeeklyPromotionBackend';

const promotion = {
  id: 'promo-1',
  title: 'Weekly tomatoes',
  weekKey: '2026-08-23',
  status: 'active',
  startsAt: '2026-08-20T00:00:00.000Z',
  endsAt: '2026-08-30T00:00:00.000Z',
  targetCommunities: [{ code: 'north', name: 'North' }],
  targetCommunityCodes: ['north'],
  productSnapshots: [{
    productId: 'tomato',
    businessId: 'farm-1',
    name: 'Tomatoes',
    regularPrice: 12,
    promotionPrice: 8,
  }],
  shareConfig: { enabled: true, headline: '', message: '' },
  schemaVersion: 1,
  pricingVersion: 'community-weekly-v1',
};

describe('community weekly promotion backend helpers', () => {
  test('rejects non-admin actors', () => {
    expect(() => assertAdminActor({ role: 'user' })).toThrow('Admin required');
    expect(() => assertAdminActor({ claims: { admin: true } })).not.toThrow();
  });

  test('hashes tokens deterministically without storing the raw value', () => {
    const first = hashOpaqueToken('opaque-token');
    const second = hashOpaqueToken('opaque-token');
    expect(first).toBe(second);
    expect(first).not.toContain('opaque-token');
    expect(buildEventIdempotencyKey({
      type: 'visit',
      promotionId: 'promo-1',
      communityCode: 'north',
      visitKeyHash: first,
    })).toContain(first);
  });

  test('rate-limits after the configured hit count inside the window', () => {
    const first = shouldRateLimit({ hits: 19, limit: 20, windowStartedAt: 1, now: 2 });
    const limited = shouldRateLimit({ hits: 20, limit: 20, windowStartedAt: 1, now: 2 });
    const reset = shouldRateLimit({
      hits: 20,
      limit: 20,
      windowStartedAt: 1,
      now: 11 * 60 * 1000,
      windowMs: 10 * 60 * 1000,
    });
    expect(first.limited).toBe(false);
    expect(limited.limited).toBe(true);
    expect(reset.limited).toBe(false);
    expect(reset.hits).toBe(1);
  });

  test('rejects independent businesses including the legacy misspelled flag', () => {
    expect(isIndependentBusinessAccount({ IsIndepent: true })).toBe(true);
    expect(() => rejectIndependentBusinesses([
      { id: 'farm-1' },
      { id: 'indie-1', IsIndepent: 'true' },
    ])).toThrow('Independent businesses cannot join');
  });

  test('requires a promotional price strictly below the regular price', () => {
    expect(() => normalizePublishedPromotion({
      ...promotion,
      productSnapshots: [{
        ...promotion.productSnapshots[0],
        promotionPrice: 12,
      }],
    })).toThrow('must be below regularPrice');
  });

  test('activates only for the targeted community inside the window', () => {
    expect(isPromotionActiveForCommunity({
      promotion,
      communityCode: 'north',
      now: '2026-08-24T00:00:00.000Z',
    })).toBe(true);
    expect(isPromotionActiveForCommunity({
      promotion,
      communityCode: 'south',
      now: '2026-08-24T00:00:00.000Z',
    })).toBe(false);
    expect(isPromotionActiveForCommunity({
      promotion,
      communityCode: 'north',
      now: '2026-09-01T00:00:00.000Z',
    })).toBe(false);
  });

  test('unlocks a community once and treats repeats as already processed', () => {
    const tokenRecord = { expiresAt: '2026-08-30T00:00:00.000Z' };
    const first = decideCommunityUnlock({
      promotion,
      communityCode: 'north',
      tokenRecord,
      now: '2026-08-24T00:00:00.000Z',
    });
    const second = decideCommunityUnlock({
      promotion,
      communityCode: 'north',
      existingUnlock: first.unlock,
      tokenRecord,
      now: '2026-08-24T01:00:00.000Z',
    });
    expect(first.alreadyProcessed).toBe(false);
    expect(first.unlock).toMatchObject({
      unlocked: true,
      communityCode: 'north',
      confirmedCount: 1,
    });
    expect(second.alreadyProcessed).toBe(true);
  });

  test('validates checkout unit prices against the published snapshot', () => {
    const unlock = { unlocked: true };
    const valid = validateCartAgainstPromotion({
      promotion,
      unlock,
      communityCode: 'north',
      now: '2026-08-24T00:00:00.000Z',
      items: [{ productId: 'tomato', businessId: 'farm-1', quantity: 2, unitPrice: 8 }],
    });
    expect(valid).toMatchObject({ valid: true, total: 16 });

    expect(() => validateCartAgainstPromotion({
      promotion,
      unlock,
      communityCode: 'north',
      now: '2026-08-24T00:00:00.000Z',
      items: [{ productId: 'tomato', businessId: 'farm-1', quantity: 2, unitPrice: 4 }],
    })).toThrow('Promotion pricing changed');
  });

  test('increments visit and unlock aggregates after idempotent acceptance', () => {
    const afterVisit = incrementStats({}, 'visit');
    const afterUnlock = incrementStats(afterVisit, 'unlock_confirmed');
    const afterOrder = incrementStats(afterUnlock, 'order_attributed');
    expect(afterOrder).toMatchObject({
      visits: 1,
      uniqueVisits: 1,
      unlockConfirmations: 1,
      promotionalOrders: 1,
      conversion: 1,
    });
  });
});
