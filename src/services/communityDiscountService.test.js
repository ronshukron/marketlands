jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  query: jest.fn(),
  setDoc: jest.fn(),
  where: jest.fn(),
}));

jest.mock('../firebase/firebase', () => ({ db: {} }));

import { onSnapshot } from 'firebase/firestore';
import {
  calculateCommunityDiscountFromOrders,
  getCommunityDiscountProgressDocId,
  getEstimatedCommunityProductSubtotal,
  isCommunityDiscountAvailable,
  isEligibleCommunityDiscountOrder,
  normalizeDiscountConfig,
  subscribeDisplayDiscountInfo,
} from './communityDiscountService';

const heldOrder = (overrides = {}) => ({
  id: 'order-1',
  deliveryWeekKey: '2026-08-09',
  customerDetails: { pickupSpot: 'קהילה א' },
  paymentStatus: 'held',
  delayedOrderStatus: 'pending_weighing',
  orderBreakdown: {
    business: {
      items: [
        { lineId: 'produce', productId: 'p1', quantity: 2, price: 50, estimatedLineTotal: 100 },
        { lineId: 'shipping', isShipping: true, quantity: 1, price: 25 },
      ],
    },
  },
  ...overrides,
});

describe('community delayed-order discount calculation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('defaults V7 automatic application to off for legacy config', () => {
    const config = normalizeDiscountConfig({ enabled: true });
    expect(config.autoApplyInV7).toBe(false);
    expect(config.availabilityMode).toBe('all');
    expect(config.pilotCommunities).toEqual([]);
  });

  test('limits selected-mode discounts to pilot communities', () => {
    const config = {
      enabled: true,
      availabilityMode: 'selected',
      pilotCommunities: ['קהילה א'],
      tiers: [{ displayThreshold: 100, realThreshold: 100, discountPercent: 5 }],
    };

    expect(isCommunityDiscountAvailable('קהילה א', config)).toBe(true);
    expect(isCommunityDiscountAvailable('קהילה ב', config)).toBe(false);
    expect(calculateCommunityDiscountFromOrders({
      communityName: 'קהילה א',
      deliveryWeekKey: '2026-08-09',
      orders: [heldOrder()],
      config,
    }).discountPercent).toBe(5);
    expect(calculateCommunityDiscountFromOrders({
      communityName: 'קהילה ב',
      deliveryWeekKey: '2026-08-09',
      orders: [heldOrder({
        customerDetails: { pickupSpot: 'קהילה ב' },
      })],
      config,
    })).toMatchObject({
      enabled: false,
      discountPercent: 0,
      tiers: [],
      weeklyTotal: 0,
    });
  });

  test('allows all communities when selected pilot mode is not enabled', () => {
    expect(isCommunityDiscountAvailable('קהילה ב', {
      enabled: true,
      pilotCommunities: ['קהילה א'],
    })).toBe(true);
  });

  test('counts held and settled orders but excludes unpaid and cancelled orders', () => {
    expect(isEligibleCommunityDiscountOrder(heldOrder())).toBe(true);
    expect(isEligibleCommunityDiscountOrder(heldOrder({
      paymentStatus: 'settled',
      delayedOrderStatus: 'settled',
    }))).toBe(true);
    expect(isEligibleCommunityDiscountOrder(heldOrder({
      paymentStatus: 'pending_payment',
      delayedOrderStatus: 'created_in_fe',
    }))).toBe(false);
    expect(isEligibleCommunityDiscountOrder(heldOrder({
      paymentStatus: 'pending_payment',
      delayedOrderStatus: 'completed',
    }))).toBe(false);
    expect(isEligibleCommunityDiscountOrder(heldOrder({
      paymentStatus: 'cancelled',
      delayedOrderStatus: 'cancelled_by_admin',
    }))).toBe(false);
  });

  test('uses estimated product totals while excluding shipping and counting a basket once', () => {
    const order = heldOrder({
      customerExcludedLineIds: ['excluded'],
      orderBreakdown: {
        business: {
          items: [
            { lineId: 'produce', quantity: 2, price: 20, estimatedLineTotal: 40 },
            { lineId: 'excluded', quantity: 1, price: 100 },
            { lineId: 'shipping', isShipping: true, quantity: 1, price: 25 },
            {
              lineId: 'basket-a',
              isBasketComponent: true,
              basketInstanceId: 'basket-1',
              basketPrice: 30,
              quantity: 1,
              price: 18,
            },
            {
              lineId: 'basket-b',
              isBasketComponent: true,
              basketInstanceId: 'basket-1',
              basketPrice: 30,
              quantity: 1,
              price: 12,
            },
          ],
        },
      },
    });

    expect(getEstimatedCommunityProductSubtotal(order)).toBe(70);
  });

  test('selects the cohort tier and applies a VIP floor', () => {
    const orders = [
      heldOrder(),
      heldOrder({
        id: 'order-2',
        paymentStatus: 'completed',
        delayedOrderStatus: 'settled',
        orderBreakdown: {
          business: {
            items: [{ lineId: 'produce-2', quantity: 1, price: 100, estimatedLineTotal: 100 }],
          },
        },
      }),
      heldOrder({
        id: 'wrong-week',
        deliveryWeekKey: '2026-08-02',
        orderBreakdown: {
          business: {
            items: [{ lineId: 'large', quantity: 1, price: 1000, estimatedLineTotal: 1000 }],
          },
        },
      }),
    ];
    const result = calculateCommunityDiscountFromOrders({
      communityName: 'קהילה א',
      deliveryWeekKey: '2026-08-09',
      orders,
      config: {
        enabled: true,
        tiers: [
          { displayThreshold: 200, realThreshold: 200, discountPercent: 2 },
          { displayThreshold: 500, realThreshold: 500, discountPercent: 5 },
        ],
        vipCommunities: {
          'קהילה א': {
            isVip: true,
            perks: { baseDiscount: { enabled: true, guaranteedTierIndex: 1 } },
          },
        },
      },
    });

    expect(result.weeklyTotal).toBe(200);
    expect(result.orderCount).toBe(2);
    expect(result.discountPercent).toBe(5);
    expect(result.tierIndex).toBe(1);
  });

  test('uses real thresholds for eligibility while preserving display thresholds', () => {
    const result = calculateCommunityDiscountFromOrders({
      communityName: 'קהילה א',
      deliveryWeekKey: '2026-08-09',
      orders: [heldOrder()],
      config: {
        enabled: true,
        tiers: [
          { displayThreshold: 150, realThreshold: 100, discountPercent: 3 },
          { displayThreshold: 300, realThreshold: 250, discountPercent: 6 },
        ],
      },
    });

    expect(result.weeklyTotal).toBe(100);
    expect(result.currentTier).toEqual({
      displayThreshold: 150,
      realThreshold: 100,
      discountPercent: 3,
    });
    expect(result.nextTier.displayThreshold).toBe(300);
    expect(result.discountPercent).toBe(3);
  });

  test('prefers per-community tier overrides and sorts them by real threshold', () => {
    const result = calculateCommunityDiscountFromOrders({
      communityName: 'קהילה א',
      deliveryWeekKey: '2026-08-09',
      orders: [heldOrder()],
      config: {
        enabled: true,
        tiers: [{ displayThreshold: 100, realThreshold: 100, discountPercent: 1 }],
        communityOverrides: {
          'קהילה א': {
            tiers: [
              { displayThreshold: 200, realThreshold: 150, discountPercent: 7 },
              { displayThreshold: 100, realThreshold: 50, discountPercent: 4 },
            ],
          },
        },
      },
    });

    expect(result.tiers.map((tier) => tier.discountPercent)).toEqual([4, 7]);
    expect(result.discountPercent).toBe(4);
    expect(result.tierIndex).toBe(0);
  });

  test('does not mix communities, weeks, or pending orders into the cohort', () => {
    const result = calculateCommunityDiscountFromOrders({
      communityName: 'קהילה א',
      deliveryWeekKey: '2026-08-09',
      orders: [
        heldOrder(),
        heldOrder({
          id: 'other-community',
          customerDetails: { pickupSpot: 'קהילה ב' },
        }),
        heldOrder({
          id: 'other-week',
          deliveryWeekKey: '2026-08-16',
        }),
        heldOrder({
          id: 'pending',
          paymentStatus: 'pending_payment',
          delayedOrderStatus: 'created_in_fe',
        }),
      ],
      config: {
        enabled: true,
        tiers: [{ displayThreshold: 200, realThreshold: 200, discountPercent: 5 }],
      },
    });

    expect(result.weeklyTotal).toBe(100);
    expect(result.orderCount).toBe(1);
    expect(result.discountPercent).toBe(0);
  });

  test('excludes buffer lines and supports object-shaped excluded-line maps', () => {
    const order = heldOrder({
      customerExcludedLineIds: { excluded: true, included: false },
      orderBreakdown: {
        business: {
          items: [
            { lineId: 'saved-estimate', quantity: 99, price: 99, estimatedLineTotal: 42.25 },
            { lineId: 'excluded', quantity: 1, price: 100 },
            { lineId: 'included', quantity: 1, price: 10 },
            { lineId: 'buffer', catalogNumber: '999003', quantity: 1, price: 500 },
          ],
        },
      },
    });

    expect(getEstimatedCommunityProductSubtotal(order)).toBe(52.25);
  });

  test('keeps the gross cohort estimate after prices are prepared for settlement', () => {
    const order = heldOrder({
      orderBreakdown: {
        business: {
          items: [
            {
              lineId: 'prepared',
              quantity: 2,
              price: 45,
              effectivePrice: 45,
              estimatedLineTotal: 90,
              communityDiscountOriginalPrice: 50,
              communityDiscountOriginalEffectivePrice: 50,
              communityDiscountOriginalEstimatedLineTotal: 100,
            },
            {
              lineId: 'basket-component',
              quantity: 1,
              price: 18,
              estimatedLineTotal: 18,
              isBasketComponent: true,
              basketInstanceId: 'basket-1',
              basketPrice: 27,
              communityDiscountOriginalBasketPrice: 30,
            },
            {
              lineId: 'basket-adjustment',
              quantity: 1,
              price: -4.5,
              estimatedLineTotal: -4.5,
              isShipping: true,
              isBasketAdjustment: true,
              basketInstanceId: 'basket-1',
            },
          ],
        },
      },
    });

    expect(getEstimatedCommunityProductSubtotal(order)).toBe(130);
  });

  test('returns no tier or automation when the master feature is disabled', () => {
    const result = calculateCommunityDiscountFromOrders({
      communityName: 'קהילה א',
      deliveryWeekKey: '2026-08-09',
      orders: [heldOrder()],
      config: {
        enabled: false,
        autoApplyInV7: true,
        tiers: [{ displayThreshold: 1, realThreshold: 1, discountPercent: 99 }],
      },
    });

    expect(result).toMatchObject({
      enabled: false,
      autoApplyInV7: false,
      discountPercent: 0,
      weeklyTotal: 0,
      orderCount: 0,
      tierIndex: -1,
    });
  });

  test('uses a progress-doc override for weekly totals without scanning orders', () => {
    const result = calculateCommunityDiscountFromOrders({
      communityName: 'קהילה א',
      deliveryWeekKey: '2026-08-09',
      weeklyTotal: 1600,
      orderCount: 7,
      config: {
        enabled: true,
        tiers: [
          { displayThreshold: 1000, realThreshold: 800, discountPercent: 1 },
          { displayThreshold: 2000, realThreshold: 1600, discountPercent: 2 },
        ],
      },
    });

    expect(result.weeklyTotal).toBe(1600);
    expect(result.orderCount).toBe(7);
    expect(result.discountPercent).toBe(2);
    expect(result.tierIndex).toBe(1);
  });

  test('combines realtime config and progress snapshots and unsubscribes both', () => {
    const snapshotCallbacks = [];
    const unsubscribeConfig = jest.fn();
    const unsubscribeProgress = jest.fn();
    onSnapshot
      .mockImplementationOnce((ref, next) => {
        snapshotCallbacks.push(next);
        return unsubscribeConfig;
      })
      .mockImplementationOnce((ref, next) => {
        snapshotCallbacks.push(next);
        return unsubscribeProgress;
      });
    const onValue = jest.fn();

    const unsubscribe = subscribeDisplayDiscountInfo({
      communityName: 'קהילה א',
      deliveryWeekKey: '2026-08-09',
      onValue,
    });

    snapshotCallbacks[0]({
      exists: () => true,
      data: () => ({
        enabled: true,
        autoApplyInV7: true,
        tiers: [{ displayThreshold: 100, realThreshold: 100, discountPercent: 5 }],
      }),
    });
    expect(onValue).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      weeklyTotal: 0,
      discountPercent: 0,
    }));

    snapshotCallbacks[1]({
      exists: () => true,
      data: () => ({
        community: 'קהילה א',
        deliveryWeekKey: '2026-08-09',
        total: 100,
        orderCount: 1,
      }),
    });

    expect(onValue).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      autoApplyInV7: true,
      weeklyTotal: 100,
      orderCount: 1,
      discountPercent: 5,
    }));

    unsubscribe();
    expect(unsubscribeConfig).toHaveBeenCalledTimes(1);
    expect(unsubscribeProgress).toHaveBeenCalledTimes(1);
  });

  test('treats a missing progress document as zero weekly total', () => {
    const snapshotCallbacks = [];
    onSnapshot.mockImplementation((ref, next) => {
      snapshotCallbacks.push(next);
      return jest.fn();
    });
    const onValue = jest.fn();
    const onError = jest.fn();

    subscribeDisplayDiscountInfo({
      communityName: 'קהילה א',
      deliveryWeekKey: '2026-08-09',
      onValue,
      onError,
    });

    snapshotCallbacks[0]({
      exists: () => true,
      data: () => ({
        enabled: true,
        availabilityMode: 'selected',
        pilotCommunities: ['קהילה א'],
        tiers: [
          { displayThreshold: 1000, realThreshold: 800, discountPercent: 1 },
          { displayThreshold: 2000, realThreshold: 1600, discountPercent: 2 },
        ],
      }),
    });
    snapshotCallbacks[1]({
      exists: () => false,
      data: () => undefined,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(getCommunityDiscountProgressDocId('קהילה א', '2026-08-09')).toBe('קהילה א__2026-08-09');
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({
      enabled: true,
      weeklyTotal: 0,
      orderCount: 0,
      discountPercent: 0,
      nextTier: expect.objectContaining({ discountPercent: 1 }),
      tiers: expect.arrayContaining([
        expect.objectContaining({ discountPercent: 1 }),
      ]),
    }));
  });
});
