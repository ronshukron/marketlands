import {
  buildCommunityWeeklyPromotionAnalytics,
  isCountableWeeklyPromotionOrder,
} from './communityWeeklyPromotionAnalytics';

const promotion = {
  id: 'promo-1',
  targetCommunities: [
    { code: 'north', name: 'ניצנים' },
    { code: 'south', name: 'אור הנר' },
  ],
  targetCommunityCodes: ['north', 'south'],
  productSnapshots: [
    { productId: 'tomato', name: 'עגבניות', businessName: 'המשק' },
    { productId: 'cucumber', name: 'מלפפון', businessName: 'המשק' },
  ],
};

describe('community weekly promotion analytics', () => {
  test('ignores abandoned and cancelled delayed orders', () => {
    expect(isCountableWeeklyPromotionOrder({ delayedOrderStatus: 'abandoned' })).toBe(false);
    expect(isCountableWeeklyPromotionOrder({ paymentStatus: 'cancelled' })).toBe(false);
    expect(isCountableWeeklyPromotionOrder({
      paymentStatus: 'held',
      delayedOrderStatus: 'created_in_fe',
    })).toBe(true);
  });

  test('counts community unlocks and promotional order lines', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [
        { communityCode: 'north', unlocked: true },
        { communityCode: 'south', unlocked: false },
      ],
      orders: [
        {
          id: 'order-1',
          userId: 'user-1',
          delayedOrderStatus: 'created_in_fe',
          orderBreakdown: {
            biz: {
              items: [{
                productId: 'tomato',
                productName: 'עגבניות',
                quantity: 2,
                estimatedLineTotal: 18,
                communityWeeklyPromotionApplied: true,
                communityWeeklyPromotionId: 'promo-1',
                communityWeeklyPromotionCommunityCode: 'north',
              }],
            },
          },
        },
        {
          id: 'order-2',
          userId: 'user-1',
          delayedOrderStatus: 'abandoned',
          items: [{
            productId: 'tomato',
            quantity: 9,
            estimatedLineTotal: 81,
            communityWeeklyPromotionApplied: true,
            communityWeeklyPromotionId: 'promo-1',
            communityWeeklyPromotionCommunityCode: 'north',
          }],
        },
        {
          id: 'order-3',
          userId: 'user-2',
          items: [{
            productId: 'cucumber',
            quantity: 1,
            price: 7,
            communityWeeklyPromotionApplied: false,
            communityWeeklyPromotionId: 'promo-1',
          }],
        },
      ],
    });

    expect(stats).toMatchObject({
      unlocks: 1,
      targetCommunityCount: 2,
      orders: 1,
      customers: 1,
      units: 2,
      revenue: 18,
    });
    expect(stats.communities).toEqual([
      expect.objectContaining({
        communityCode: 'north',
        communityName: 'ניצנים',
        unlocked: true,
        orders: 1,
        customers: 1,
        revenue: 18,
      }),
      expect.objectContaining({
        communityCode: 'south',
        communityName: 'אור הנר',
        unlocked: false,
        orders: 0,
      }),
    ]);
    expect(stats.products).toEqual([
      expect.objectContaining({
        productId: 'tomato',
        productName: 'עגבניות',
        orders: 1,
        units: 2,
        revenue: 18,
      }),
    ]);
  });

  test('does not count lines from a different weekly promotion', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [{
        id: 'order-other',
        userId: 'user-9',
        items: [{
          productId: 'tomato',
          quantity: 3,
          estimatedLineTotal: 27,
          communityWeeklyPromotionApplied: true,
          communityWeeklyPromotionId: 'promo-other',
          communityWeeklyPromotionCommunityCode: 'north',
        }],
      }],
    });

    expect(stats.orders).toBe(0);
    expect(stats.revenue).toBe(0);
    expect(stats.unlocks).toBe(1);
  });

  test('keeps the checkout estimate and ignores weighed invoice amounts', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [{
        id: 'order-weighed',
        userId: 'user-3',
        delayedOrderStatus: 'pending_weighing',
        orderBreakdown: {
          biz: {
            items: [{
              lineId: 'line-tomato',
              productId: 'tomato',
              productName: 'עגבניות',
              quantity: 2,
              estimatedLineTotal: 18,
              communityWeeklyPromotionApplied: true,
              communityWeeklyPromotionId: 'promo-1',
              communityWeeklyPromotionCommunityCode: 'north',
            }],
          },
        },
        weighing: {
          finalInvoiceLines: [{
            lineId: 'line-tomato',
            productId: 'tomato',
            actualQuantity: 2.5,
            pricePerUnit: 9,
            linePrice: 22.5,
            communityWeeklyPromotionApplied: true,
            communityWeeklyPromotionId: 'promo-1',
          }],
        },
      }],
    });

    expect(stats.revenue).toBe(18);
    expect(stats.products[0].revenue).toBe(18);
    expect(stats.communities[0].revenue).toBe(18);
  });

  test('counts unlocked-community promo products from checkout lines even without the applied flag', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [{
        id: 'order-no-flag',
        userId: 'user-7',
        community: 'ניצנים',
        orderBreakdown: {
          biz: {
            items: [{
              productId: 'tomato',
              quantity: 2,
              estimatedLineTotal: 18,
              price: 9,
              effectivePrice: 9,
            }],
          },
        },
      }],
    });

    expect(stats).toMatchObject({
      orders: 1,
      revenue: 18,
      customers: 1,
    });
  });

  test('counts a unit item with the chargeable kg total, not pieces times per-kg price', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [{
        id: 'order-unit',
        userId: 'user-4',
        orderBreakdown: {
          biz: {
            items: [{
              productId: 'tomato',
              quantity: 3,
              measurementType: 'unit',
              averageWeightKg: 0.2,
              effectivePrice: 10,
              price: 10,
              communityWeeklyPromotionApplied: true,
              communityWeeklyPromotionId: 'promo-1',
              communityWeeklyPromotionCommunityCode: 'north',
            }],
          },
        },
      }],
    });

    expect(stats.revenue).toBe(6);
  });

  test('counts a duplicate delayed and regular order only once', () => {
    const order = {
      id: 'order-dup',
      userId: 'user-5',
      delayedOrderStatus: 'created_in_fe',
      orderBreakdown: {
        biz: {
          items: [{
            productId: 'tomato',
            quantity: 1,
            estimatedLineTotal: 9,
            communityWeeklyPromotionApplied: true,
            communityWeeklyPromotionId: 'promo-1',
            communityWeeklyPromotionCommunityCode: 'north',
          }],
        },
      },
    };

    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [order, { ...order, source: 'customerOrders' }],
    });

    expect(stats.orders).toBe(1);
    expect(stats.revenue).toBe(9);
  });

  test('attributes revenue to the target community when the order only has a community name', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [{
        id: 'order-named',
        userId: 'user-6',
        community: 'ניצנים',
        orderBreakdown: {
          biz: {
            items: [{
              productId: 'tomato',
              quantity: 1,
              estimatedLineTotal: 9,
              communityWeeklyPromotionApplied: true,
              communityWeeklyPromotionId: 'promo-1',
            }],
          },
        },
      }],
    });

    expect(stats.communities[0]).toMatchObject({
      communityCode: 'north',
      communityName: 'ניצנים',
      revenue: 9,
      orders: 1,
    });
  });
});
