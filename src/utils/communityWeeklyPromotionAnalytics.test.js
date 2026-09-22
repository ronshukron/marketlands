import {
  buildCommunityWeeklyPromotionAnalytics,
  isCountableWeeklyPromotionOrder,
} from './communityWeeklyPromotionAnalytics';

const promotion = {
  id: 'promo-1',
  weekKey: '2026-09-13',
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

const promoLine = (overrides = {}) => ({
  productId: 'tomato',
  productName: 'עגבניות',
  quantity: 2,
  estimatedLineTotal: 18,
  communityWeeklyPromotionApplied: true,
  communityWeeklyPromotionId: 'promo-1',
  communityWeeklyPromotionCommunityCode: 'north',
  communityWeeklyPromotionWeekKey: '2026-09-13',
  ...overrides,
});

const delayedOrder = (overrides = {}) => ({
  id: 'order-1',
  userId: 'user-1',
  paymentStatus: 'held',
  delayedOrderStatus: 'pending_weighing',
  source: 'customerOrdersDelayed',
  community: 'ניצנים',
  deliveryDate: '2026-09-16',
  customerDetails: { phone: '0501111111', name: 'לקוח 1' },
  orderBreakdown: {
    biz: {
      businessId: 'biz',
      businessName: 'המשק',
      items: [promoLine()],
    },
  },
  ...overrides,
});

describe('community weekly promotion analytics', () => {
  test('counts only delivery-summary payment states', () => {
    expect(isCountableWeeklyPromotionOrder({ delayedOrderStatus: 'abandoned' })).toBe(false);
    expect(isCountableWeeklyPromotionOrder({ paymentStatus: 'cancelled' })).toBe(false);
    expect(isCountableWeeklyPromotionOrder({
      paymentStatus: 'held',
      delayedOrderStatus: 'created_in_fe',
    })).toBe(false);
    expect(isCountableWeeklyPromotionOrder({
      paymentStatus: 'held',
      delayedOrderStatus: 'pending_weighing',
    })).toBe(true);
    expect(isCountableWeeklyPromotionOrder({ paymentStatus: 'completed' })).toBe(true);
  });

  test('counts community unlocks and promotional order lines', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [
        { communityCode: 'north', unlocked: true },
        { communityCode: 'south', unlocked: false },
      ],
      orders: [
        delayedOrder(),
        delayedOrder({
          id: 'order-2',
          userId: 'user-1',
          delayedOrderStatus: 'abandoned',
          items: [promoLine({ quantity: 9, estimatedLineTotal: 81 })],
          orderBreakdown: undefined,
        }),
        delayedOrder({
          id: 'order-3',
          userId: 'user-2',
          paymentStatus: 'completed',
          delayedOrderStatus: undefined,
          source: 'customerOrders',
          items: [promoLine({
            productId: 'cucumber',
            quantity: 1,
            estimatedLineTotal: 7,
            communityWeeklyPromotionApplied: false,
          })],
          orderBreakdown: undefined,
        }),
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
        customers: 1,
        units: 2,
        revenue: 18,
      }),
    ]);
  });

  test('does not count lines from a different weekly promotion', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [delayedOrder({
        id: 'order-other',
        userId: 'user-9',
        items: [promoLine({ communityWeeklyPromotionId: 'promo-other', quantity: 3, estimatedLineTotal: 27 })],
        orderBreakdown: undefined,
      })],
    });

    expect(stats.orders).toBe(0);
    expect(stats.revenue).toBe(0);
    expect(stats.unlocks).toBe(1);
  });

  test('keeps the checkout estimate and ignores weighed invoice amounts', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [delayedOrder({
        id: 'order-weighed',
        userId: 'user-3',
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
      })],
    });

    expect(stats.revenue).toBe(18);
    expect(stats.products[0].revenue).toBe(18);
    expect(stats.communities[0].revenue).toBe(18);
  });

  test('does not count unlocked-community products that did not use the weekly price', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [delayedOrder({
        id: 'order-no-flag',
        userId: 'user-7',
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
      })],
    });

    expect(stats).toMatchObject({
      orders: 0,
      customers: 0,
      revenue: 0,
    });
    expect(stats.products).toEqual([]);
  });

  test('ignores grape lines the customer removed', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [delayedOrder({
        id: 'order-removed',
        userId: 'user-8',
        customerExcludedLineIds: { 'line-tomato': true },
        orderBreakdown: {
          biz: {
            items: [promoLine({ lineId: 'line-tomato' })],
          },
        },
      })],
    });

    expect(stats.orders).toBe(0);
    expect(stats.customers).toBe(0);
  });

  test('counts a unit item with the chargeable kg total, not pieces times per-kg price', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [delayedOrder({
        id: 'order-unit',
        userId: 'user-4',
        orderBreakdown: {
          biz: {
            items: [promoLine({
              quantity: 3,
              estimatedLineTotal: undefined,
              measurementType: 'unit',
              averageWeightKg: 0.2,
              effectivePrice: 10,
              price: 10,
            })],
          },
        },
      })],
    });

    expect(stats.revenue).toBe(6);
  });

  test('counts a duplicate delayed and regular order only once', () => {
    const delayed = delayedOrder({
      id: 'order-dup-delayed',
      source: 'customerOrdersDelayed',
    });
    const regular = {
      ...delayed,
      id: 'order-dup-regular',
      source: 'customerOrders',
      paymentStatus: 'completed',
      delayedOrderStatus: undefined,
    };

    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [delayed, regular],
    });

    expect(stats.orders).toBe(1);
    expect(stats.customers).toBe(1);
    expect(stats.products[0]).toMatchObject({ orders: 1, customers: 1 });
    expect(stats.revenue).toBe(18);
  });

  test('attributes revenue to the target community when the order only has a community name', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [delayedOrder({
        id: 'order-named',
        userId: 'user-6',
        community: 'ניצנים',
        orderBreakdown: {
          biz: {
            items: [promoLine({ communityWeeklyPromotionCommunityCode: undefined })],
          },
        },
      })],
    });

    expect(stats.communities[0]).toMatchObject({
      communityCode: 'north',
      communityName: 'ניצנים',
      revenue: 18,
      orders: 1,
    });
  });

  test('does not count an applied line from another week when the promotion id is missing', () => {
    const stats = buildCommunityWeeklyPromotionAnalytics({
      promotion,
      unlocks: [{ communityCode: 'north', unlocked: true }],
      orders: [delayedOrder({
        id: 'order-old-week',
        userId: 'user-10',
        deliveryDate: '2026-09-02',
        orderBreakdown: {
          biz: {
            items: [promoLine({
              communityWeeklyPromotionId: undefined,
              communityWeeklyPromotionWeekKey: '2026-08-30',
            })],
          },
        },
      })],
    });

    expect(stats.orders).toBe(0);
  });
});
