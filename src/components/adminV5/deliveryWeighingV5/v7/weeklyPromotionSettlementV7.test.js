import {
  applyWeeklyPromotionToItems,
  buildWeeklyPromotionFingerprint,
  findUnlockedWeeklyPromotion,
  resolveWeeklyPromotionForOrder,
  weeklyPromotionUnlockKey,
} from './weeklyPromotionSettlementV7';
import { buildCommunityWeeklyPromotionOrderPatch } from './orderDraftUtils';

const promotion = {
  id: 'promo-1',
  status: 'archived',
  weekKey: '2026-10-04',
  pricingVersion: 'v1',
  targetCommunityCodes: ['north'],
  productSnapshots: [
    { productId: 'tomato', orderId: 'sale-1', promotionPrice: 6 },
    { productId: 'cucumber', promotionPrice: 12 },
  ],
};

const item = (overrides = {}) => ({
  lineId: 'cust::tomato::sale-1::::s0',
  productId: 'tomato',
  businessOrderKey: 'sale-1',
  pricePerUnit: 10,
  requestedQuantity: 2,
  measurementType: 'kg',
  ...overrides,
});

describe('findUnlockedWeeklyPromotion', () => {
  it('gives a subscribers-only promotion to subscription orders only', () => {
    const unlocksByKey = { [weeklyPromotionUnlockKey('promo-1', 'north')]: { unlocked: true } };
    const subscribersPromotion = { ...promotion, subscribersOnly: true };
    const base = {
      promotions: [subscribersPromotion], weekKey: '2026-10-04', communityCode: 'north', unlocksByKey,
    };
    expect(findUnlockedWeeklyPromotion(base)).toBeNull();
    expect(findUnlockedWeeklyPromotion({ ...base, isSubscriptionOrder: true })).toBe(subscribersPromotion);
  });

  it('requires a matching week, target community and confirmed unlock', () => {
    const unlocksByKey = { [weeklyPromotionUnlockKey('promo-1', 'north')]: { unlocked: true } };
    expect(findUnlockedWeeklyPromotion({
      promotions: [promotion], weekKey: '2026-10-04', communityCode: 'north', unlocksByKey,
    })).toBe(promotion);
    expect(findUnlockedWeeklyPromotion({
      promotions: [promotion], weekKey: '2026-10-11', communityCode: 'north', unlocksByKey,
    })).toBeNull();
    expect(findUnlockedWeeklyPromotion({
      promotions: [promotion], weekKey: '2026-10-04', communityCode: 'north', unlocksByKey: {},
    })).toBeNull();
    expect(findUnlockedWeeklyPromotion({
      promotions: [{ ...promotion, status: 'draft' }], weekKey: '2026-10-04', communityCode: 'north', unlocksByKey,
    })).toBeNull();
  });
});

describe('resolveWeeklyPromotionForOrder', () => {
  it('collects only discounted, active, non-promo lines', () => {
    const result = resolveWeeklyPromotionForOrder({
      promotion,
      communityCode: 'north',
      removedLineIds: { removed: true },
      items: [
        item(),
        item({ lineId: 'removed' }),
        item({ lineId: 'already', communityWeeklyPromotionApplied: true }),
        item({ lineId: 'basket', isBasketComponent: true }),
        item({ lineId: 'other-sale', businessOrderKey: 'sale-2' }),
        item({ lineId: 'cheap', productId: 'cucumber', pricePerUnit: 11 }),
        item({ lineId: 'cuc', productId: 'cucumber', businessOrderKey: 'sale-9', pricePerUnit: 15, requestedQuantity: 1 }),
      ],
    });
    expect(result.lines.map((line) => line.lineId)).toEqual(['cust::tomato::sale-1::::s0', 'cuc']);
    expect(result.estimatedSavings).toBe(11);
    expect(result.promotionId).toBe('promo-1');
  });

  it('returns null when nothing is eligible', () => {
    expect(resolveWeeklyPromotionForOrder({ promotion, communityCode: 'north', items: [] })).toBeNull();
    expect(resolveWeeklyPromotionForOrder({ promotion: null, communityCode: 'north', items: [item()] })).toBeNull();
  });

  it('applies promotion prices for previews', () => {
    const weekly = resolveWeeklyPromotionForOrder({ promotion, communityCode: 'north', items: [item()] });
    const [priced] = applyWeeklyPromotionToItems([item()], weekly);
    expect(priced.pricePerUnit).toBe(6);
    expect(priced.communityWeeklyPromotionApplied).toBe(true);
  });
});

describe('buildCommunityWeeklyPromotionOrderPatch', () => {
  it('re-prices matching lines and drops community discount markers', () => {
    const orderData = {
      grandTotal: 36,
      communityDiscountOriginalGrandTotal: 40,
      orderBreakdown: {
        'sale-1': {
          items: [
            {
              productId: 'tomato',
              lineSeed: 's0',
              quantity: 2,
              price: 9,
              estimatedLineTotal: 18,
              communityDiscountOriginalPrice: 10,
              communityDiscountOriginalEstimatedLineTotal: 20,
              communityDiscountPercent: 10,
            },
            { productId: 'lettuce', lineSeed: 's1', quantity: 1, price: 20, estimatedLineTotal: 20 },
          ],
        },
      },
    };
    const lineId = 'cust::tomato::sale-1::::s0';
    const weekly = {
      promotionId: 'promo-1',
      communityCode: 'north',
      weekKey: '2026-10-04',
      lines: [{ lineId, productId: 'tomato', promotionPrice: 6 }],
    };
    const fingerprint = buildWeeklyPromotionFingerprint({ orderId: 'cust', weeklyPromotion: weekly });
    const patch = buildCommunityWeeklyPromotionOrderPatch({
      orderId: 'cust',
      orderData,
      weeklyPromotion: weekly,
      fingerprint,
    });
    const [tomato, lettuce] = patch.orderBreakdown['sale-1'].items;
    expect(tomato.price).toBe(6);
    expect(tomato.communityWeeklyPromotionApplied).toBe(true);
    expect(tomato.communityWeeklyPromotionOriginalPrice).toBe(10);
    expect(tomato.communityDiscountOriginalPrice).toBeUndefined();
    expect(lettuce.price).toBe(20);
    expect(patch.appliedLineIds).toEqual([lineId]);
    expect(patch.estimatedSavings).toBe(6);
    expect(patch.grandTotal).toBe(30);
    expect(patch.communityDiscountOriginalGrandTotal).toBe(32);
  });

  it('returns null when no line can be re-priced', () => {
    expect(buildCommunityWeeklyPromotionOrderPatch({
      orderId: 'cust',
      orderData: { orderBreakdown: {} },
      weeklyPromotion: { promotionId: 'p', lines: [{ lineId: 'x', promotionPrice: 1 }] },
      fingerprint: 'f',
    })).toBeNull();
  });
});

describe('weekly promotion limit at charge time', () => {
  const limited = {
    ...promotion,
    productSnapshots: [{ productId: 'tomato', orderId: 'sale-1', promotionPrice: 6, maxQuantity: 1 }],
  };

  it('gives the promotion price up to the limit and the regular price for the rest', () => {
    // 3 kg: 1 at 6 + 2 at 10 = 26, so 8.6667 per kg.
    const resolved = resolveWeeklyPromotionForOrder({
      items: [item({ requestedQuantity: 3 })],
      promotion: limited,
      communityCode: 'north',
    });
    expect(resolved.lines[0]).toMatchObject({
      promotionPrice: 8.6667,
      unitPromotionPrice: 6,
      promotionQuantity: 1,
      maxQuantity: 1,
    });
    expect(applyWeeklyPromotionToItems([item({ requestedQuantity: 3 })], resolved)[0].price).toBe(8.6667);
  });

  it('counts lines priced at checkout and skips lines past the limit', () => {
    const resolved = resolveWeeklyPromotionForOrder({
      items: [
        item({ lineId: 'paid-at-checkout', communityWeeklyPromotionApplied: true, communityWeeklyPromotionId: 'promo-1', communityWeeklyPromotionQuantity: 0.5 }),
        item({ lineId: 'second', requestedQuantity: 1 }),
        item({ lineId: 'third', requestedQuantity: 1 }),
      ],
      promotion: limited,
      communityCode: 'north',
    });
    expect(resolved.lines.map((line) => [line.lineId, line.promotionQuantity, line.promotionPrice])).toEqual([
      ['second', 0.5, 8],
    ]);
  });
});
