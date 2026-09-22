jest.mock('firebase/firestore', () => ({
  Timestamp: { fromDate: jest.fn((date) => ({ date })) },
  addDoc: jest.fn(),
  collection: jest.fn((db, name) => ({ db, name })),
  doc: jest.fn((db, name, id) => ({ db, name, id })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn((value) => ({ type: 'limit', value })),
  orderBy: jest.fn((field, direction) => ({ type: 'orderBy', field, direction })),
  query: jest.fn((...parts) => ({ parts })),
  serverTimestamp: jest.fn(() => ({ type: 'serverTimestamp' })),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  where: jest.fn((field, operator, value) => ({
    type: 'where',
    field,
    operator,
    value,
  })),
}));

jest.mock('../firebase/firebase', () => ({ db: { name: 'test-db' } }));
jest.mock('./pickupSpotsService', () => ({
  resolveCommunityName: (name) => String(name || '').trim(),
}));

import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  confirmCommunityUnlock,
  createPromotion,
  getActivePromotionForCommunity,
  getCommunityPromotionUnlockId,
  getPromotion,
  getPromotionsAnalytics,
  getPromotionStats,
  isValidCommunityWeeklyPromotionTransition,
  loadEligibleWeeklyProducts,
  publishPromotion,
  validateCommunityWeeklyPromotion,
} from './communityWeeklyPromotionService';

const validPromotion = (overrides = {}) => ({
  title: 'Weekly tomatoes',
  weekKey: '2026-08-23',
  status: 'draft',
  startsAt: '2026-08-23T00:00:00.000Z',
  endsAt: '2026-08-30T00:00:00.000Z',
  targetCommunities: [{ code: 'north', name: 'North' }],
  targetCommunityCodes: ['north'],
  productSnapshots: [{
    productId: 'product-1',
    businessId: 'business-1',
    name: 'Tomatoes',
    regularPrice: 12,
    promotionPrice: 9,
  }],
  shareConfig: { enabled: true, headline: 'Share', message: 'This week only' },
  schemaVersion: 1,
  pricingVersion: 'prices-2026-08-23',
  ...overrides,
});

describe('community weekly promotion service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    doc.mockImplementation((db, name, id) => ({ db, name, id }));
    serverTimestamp.mockImplementation(() => ({ type: 'serverTimestamp' }));
  });

  test('validates and normalizes a promotion draft', () => {
    const result = validateCommunityWeeklyPromotion(validPromotion({
      targetCommunityCodes: ['north', 'north'],
    }));

    expect(result.targetCommunityCodes).toEqual(['north']);
    expect(result.productSnapshots[0]).toMatchObject({
      productId: 'product-1',
      businessId: 'business-1',
      regularPrice: 12,
      promotionPrice: 9,
      imageUrl: '',
    });
  });

  test('rejects an invalid price or time range', () => {
    expect(() => validateCommunityWeeklyPromotion(validPromotion({
      productSnapshots: [{
        productId: 'p',
        businessId: 'b',
        name: 'Product',
        regularPrice: 10,
        promotionPrice: 11,
      }],
    }))).toThrow('must be below regularPrice');

    expect(() => validateCommunityWeeklyPromotion(validPromotion({
      productSnapshots: [{
        productId: 'p',
        businessId: 'b',
        name: 'Product',
        regularPrice: 10,
        promotionPrice: 10,
      }],
    }))).toThrow('must be below regularPrice');

    expect(() => validateCommunityWeeklyPromotion(validPromotion({
      endsAt: '2026-08-22T00:00:00.000Z',
    }))).toThrow('valid increasing time range');
  });

  test('expresses terminal archived and one-way active transitions', () => {
    expect(isValidCommunityWeeklyPromotionTransition('draft', 'active')).toBe(true);
    expect(isValidCommunityWeeklyPromotionTransition('active', 'draft')).toBe(false);
    expect(isValidCommunityWeeklyPromotionTransition('archived', 'active')).toBe(false);
  });

  test('creates a deterministic slash-safe unlock document id', () => {
    expect(getCommunityPromotionUnlockId('promo/1', 'north/a'))
      .toBe('promo%2F1__north%2Fa');
  });

  test('confirms a trust-based community unlock directly in Firestore', async () => {
    setDoc.mockResolvedValue(undefined);

    await confirmCommunityUnlock({
      promotionId: 'promo-1',
      communityCode: 'north',
      promotion: validPromotion(),
    });

    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'communityWeeklyPromotionUnlocks',
        id: 'promo-1__north',
      }),
      expect.objectContaining({
        promotionId: 'promo-1',
        communityCode: 'north',
        unlocked: true,
        pricingVersion: 'prices-2026-08-23',
        schemaVersion: 1,
      }),
      { merge: true },
    );
  });

  test('reads a promotion without writing to Firestore', async () => {
    getDoc.mockResolvedValue({
      id: 'promo-1',
      exists: () => true,
      data: () => ({ title: 'Weekly tomatoes' }),
    });

    await expect(getPromotion('promo-1')).resolves.toEqual({
      id: 'promo-1',
      title: 'Weekly tomatoes',
    });
  });

  test('returns the active targeted promotion from the constrained public query', async () => {
    getDocs.mockResolvedValue({
      empty: false,
      docs: [{
        id: 'promo-1',
        data: () => ({
          status: 'active',
          targetCommunityCodes: ['north'],
          startsAt: { toMillis: () => new Date('2026-08-23T00:00:00.000Z').getTime() },
          endsAt: { toMillis: () => new Date('2026-08-30T00:00:00.000Z').getTime() },
        }),
      }],
    });

    await expect(getActivePromotionForCommunity(
      'north',
      { now: new Date('2026-08-24T10:00:00.000Z') },
    )).resolves.toMatchObject({ id: 'promo-1', status: 'active' });
  });

  test('falls back to community names when the constrained query fails', async () => {
    getDocs
      .mockRejectedValueOnce(new Error('index missing'))
      .mockRejectedValueOnce(new Error('index missing'))
      .mockRejectedValueOnce(new Error('index missing'))
      .mockResolvedValueOnce({
        docs: [{
          id: 'promo-name',
          data: () => validPromotion({
            status: 'active',
            targetCommunityCodes: ['stale-code'],
            targetCommunities: [{ code: 'stale-code', name: 'אור הנר' }],
            startsAt: { toMillis: () => Date.now() - 1000 },
            endsAt: { toMillis: () => Date.now() + 60_000 },
          }),
        }],
      });

    await expect(getActivePromotionForCommunity('current-code', {
      communityName: 'אור הנר',
    })).resolves.toMatchObject({ id: 'promo-name' });
  });

  test('finds an in-window promotion with the public status-only query when composites are missing', async () => {
    getDocs
      .mockRejectedValueOnce(new Error('index missing'))
      .mockRejectedValueOnce(new Error('index missing'))
      .mockResolvedValueOnce({
        empty: false,
        docs: [{
          id: 'promo-status',
          data: () => validPromotion({
            status: 'active',
            targetCommunityCodes: ['0rb98r'],
            targetCommunities: [{ code: '0rb98r', name: 'גיאה' }],
            startsAt: { toMillis: () => Date.now() - 1000 },
            endsAt: { toMillis: () => Date.now() + 60_000 },
          }),
        }],
      });

    await expect(getActivePromotionForCommunity('0rb98r', {
      communityName: 'גיאה',
    })).resolves.toMatchObject({ id: 'promo-status' });
  });

  test('creates a draft promotion directly in Firestore', async () => {
    addDoc.mockResolvedValue({ id: 'promo-1' });

    const result = await createPromotion(validPromotion());

    expect(result.promotion).toEqual(expect.objectContaining({
      id: 'promo-1',
      status: 'draft',
      title: 'Weekly tomatoes',
    }));
    expect(addDoc.mock.calls[0][1]).toEqual(expect.objectContaining({
      title: 'Weekly tomatoes',
      status: 'draft',
      targetCommunityCodes: ['north'],
    }));
  });

  test('publishes an in-window promotion as active', async () => {
    getDoc.mockResolvedValue({
      id: 'promo-1',
      exists: () => true,
      data: () => validPromotion({
        status: 'draft',
        startsAt: { toMillis: () => Date.now() - 1000 },
        endsAt: { toMillis: () => Date.now() + 60_000 },
      }),
    });
    updateDoc.mockResolvedValue(undefined);

    const result = await publishPromotion('promo-1');

    expect(result.promotion.status).toBe('active');
    expect(updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'communityWeeklyPromotions', id: 'promo-1' }),
      expect.objectContaining({ status: 'active' }),
    );
  });

  test('loads products only for non-independent businesses', async () => {
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 'regular', data: () => ({ businessName: 'Regular' }) },
          { id: 'independent', data: () => ({ businessName: 'Independent', IsIndepent: true }) },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 'product-1', data: () => ({ name: 'Tomatoes', Owner_ID: 'regular' }) }],
      });

    const result = await loadEligibleWeeklyProducts();

    expect(result.businesses.map((business) => business.id)).toEqual(['regular']);
    expect(result.products).toEqual([
      expect.objectContaining({ id: 'product-1', businessId: 'regular' }),
    ]);
    expect(getDocs).toHaveBeenCalledTimes(2);
  });

  test('computes analytics from unlocks and delayed orders', async () => {
    getDoc.mockImplementation(async (ref = {}) => {
      if (ref.name === 'communityWeeklyPromotions' || ref.id === 'promo-1') {
        return {
          id: 'promo-1',
          exists: () => true,
          data: () => validPromotion({
            status: 'active',
            targetCommunityCodes: ['north', 'south'],
            targetCommunities: [
              { code: 'north', name: 'North' },
              { code: 'south', name: 'South' },
            ],
          }),
        };
      }
      if (
        ref.name === 'communityWeeklyPromotionUnlocks'
        && (ref.id === 'promo-1__north' || String(ref.id || '').endsWith('__north'))
      ) {
        return {
          id: ref.id,
          exists: () => true,
          data: () => ({ promotionId: 'promo-1', communityCode: 'north', unlocked: true }),
        };
      }
      return { id: ref.id || '', exists: () => false, data: () => ({}) };
    });
    const delayedOrderSnapshot = {
      docs: [{
        id: 'order-1',
        data: () => ({
          userId: 'user-1',
          paymentStatus: 'held',
          delayedOrderStatus: 'pending_weighing',
          items: [{
            productId: 'product-1',
            productName: 'Tomatoes',
            quantity: 2,
            estimatedLineTotal: 18,
            communityWeeklyPromotionApplied: true,
            communityWeeklyPromotionId: 'promo-1',
            communityWeeklyPromotionCommunityCode: 'north',
          }],
        }),
      }],
    };
    getDocs
      .mockResolvedValueOnce(delayedOrderSnapshot)
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce(delayedOrderSnapshot)
      .mockResolvedValueOnce({ docs: [] });

    await expect(getPromotionStats('promo-1')).resolves.toMatchObject({
      unlocks: 1,
      targetCommunityCount: 2,
      orders: 1,
      customers: 1,
      revenue: 18,
    });
    await expect(getPromotionsAnalytics([{
      id: 'promo-1',
      ...validPromotion({
        targetCommunityCodes: ['north'],
        targetCommunities: [{ code: 'north', name: 'North' }],
      }),
    }])).resolves.toEqual([
      expect.objectContaining({ unlocks: 1, orders: 1, revenue: 18 }),
    ]);
  });
});
