import { decorateCommunityWeeklyPromotionProduct } from './CommunityWeeklyPromotionContext';

describe('decorateCommunityWeeklyPromotionProduct', () => {
  const promotion = {
    id: 'promotion-1',
    status: 'active',
    startsAt: '2026-08-23T00:00:00.000Z',
    endsAt: '2026-08-30T00:00:00.000Z',
    weekKey: '2026-08-23',
    schemaVersion: 2,
    pricingVersion: 'pricing-v2',
    productSnapshots: [
      { productId: 'tomato', promotionPrice: 8 },
      { productId: 'tomato', orderId: 'farm-2', promotionPrice: 6.5 },
    ],
  };

  it('attaches the fixed snapshot price and promotion metadata', () => {
    const result = decorateCommunityWeeklyPromotionProduct({
      product: { id: 'tomato', orderId: 'farm-2', price: 12 },
      promotion,
      communityCode: 'abc123',
      unlocked: true,
    });

    expect(result).toEqual(expect.objectContaining({
      price: 12,
      communityWeeklyPromotionId: 'promotion-1',
      communityWeeklyPromotionPrice: 6.5,
      communityWeeklyPromotionStatus: 'active',
      communityWeeklyPromotionCommunityCode: 'abc123',
      communityWeeklyPromotionWeekKey: '2026-08-23',
      communityWeeklyPromotionUnlocked: true,
      communityWeeklyPromotionSchemaVersion: 2,
      communityWeeklyPromotionPricingVersion: 'pricing-v2',
      communityWeeklyPromotionProductId: 'tomato',
      communityWeeklyPromotionOrderId: 'farm-2',
    }));
  });

  it('still attaches a snapshot when the store product uses a different order id', () => {
    const result = decorateCommunityWeeklyPromotionProduct({
      product: { id: 'tomato', orderId: 'other-farm', price: 12 },
      promotion,
      communityCode: 'abc123',
      unlocked: false,
    });

    expect(result).toEqual(expect.objectContaining({
      communityWeeklyPromotionId: 'promotion-1',
      communityWeeklyPromotionPrice: 8,
      communityWeeklyPromotionUnlocked: false,
    }));
  });

  it('leaves products outside the promotion snapshot unchanged', () => {
    const product = { id: 'cucumber', price: 9 };

    expect(decorateCommunityWeeklyPromotionProduct({
      product,
      promotion,
      communityCode: 'abc123',
      unlocked: false,
    })).toBe(product);
  });
});
