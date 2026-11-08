jest.mock('../services/pickupSpotsService', () => ({
  resolveCommunityName: (name) => name,
}));

import {
  findDeliveryDateBlockers,
  generateAvailableDeliveryDates,
  generateSharedAvailableDeliveryDates,
  getDeliveryScheduleDocumentKeys,
  GO_LIVE_LINKED_ORDER_FIELD,
  isAlwaysOnGroceryOrderLive,
  isDeliveryDateOrderable,
  isOrderDeliveryDateFallback,
} from './deliveryScheduleUtils';

const community = 'Community X';
const schedule = {
  active: true,
  weeklyDays: [1, 4],
  horizonWeeks: 2,
};
const alwaysOnOrder = {
  orderMode: 'always_on_grocery',
  fulfillmentConfig: {
    weeklyDeliveryDays: [1],
    weeklyDaysByCommunity: {
      [community]: [4],
    },
  },
};

describe('delivery schedule utilities', () => {
  test('community-specific business weekdays override global business weekdays', () => {
    const dates = generateAvailableDeliveryDates(schedule, {
      orderData: alwaysOnOrder,
      communityName: community,
      fromDate: new Date(2026, 7, 9),
      now: new Date(2026, 7, 8),
    });

    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every((dateKey) => new Date(`${dateKey}T00:00:00`).getDay() === 4)).toBe(true);
  });

  test('final validation rejects a generally available date not served by the business in that community', () => {
    expect(isDeliveryDateOrderable(
      '2026-08-10',
      schedule,
      new Date(2026, 7, 8),
      alwaysOnOrder,
      community
    )).toBe(false);
    expect(isDeliveryDateOrderable(
      '2026-08-13',
      schedule,
      new Date(2026, 7, 8),
      alwaysOnOrder,
      community
    )).toBe(true);
  });

  test('an order without a persisted delivery date is classified as fallback data', () => {
    expect(isOrderDeliveryDateFallback({
      createdAt: '2026-08-11T10:58:21.849Z',
    })).toBe(true);
    expect(isOrderDeliveryDateFallback({
      createdAt: '2026-08-11T10:58:21.849Z',
      deliveryDate: '2026-08-13',
    })).toBe(false);
  });

  test('a stale disabled order does not erase dates shared by active cart orders', () => {
    const disabledOrder = {
      ...alwaysOnOrder,
      alwaysOnEnabled: false,
      alwaysOnDisabled: true,
      fulfillmentConfig: {
        ...alwaysOnOrder.fulfillmentConfig,
        enabled: false,
        orderFormEnabled: false,
      },
    };

    const dates = generateSharedAvailableDeliveryDates(
      schedule,
      [alwaysOnOrder, disabledOrder],
      {
        communityName: community,
        fromDate: new Date(2026, 7, 9),
        now: new Date(2026, 7, 8),
      }
    );

    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every((dateKey) => new Date(`${dateKey}T00:00:00`).getDay() === 4)).toBe(true);
  });

  test('a cart with only a disabled grocery order still uses community schedule dates', () => {
    const disabledOrder = {
      ...alwaysOnOrder,
      alwaysOnEnabled: false,
    };

    const dates = generateSharedAvailableDeliveryDates(
      schedule,
      [disabledOrder],
      {
        communityName: community,
        fromDate: new Date(2026, 7, 9),
        now: new Date(2026, 7, 8),
      }
    );

    expect(dates.length).toBeGreaterThan(0);
    const days = new Set(dates.map((dateKey) => new Date(`${dateKey}T00:00:00`).getDay()));
    expect(days.has(1)).toBe(true);
    expect(days.has(4)).toBe(true);
  });

  test('an order that does not serve the selected community is ignored when intersecting dates', () => {
    const otherCommunityOrder = {
      ...alwaysOnOrder,
      pickupSpots: ['Other Community'],
      fulfillmentConfig: {
        weeklyDeliveryDays: [1],
        weeklyDaysByCommunity: {
          'Other Community': [1],
        },
      },
    };

    const dates = generateSharedAvailableDeliveryDates(
      schedule,
      [alwaysOnOrder, otherCommunityOrder],
      {
        communityName: community,
        fromDate: new Date(2026, 7, 9),
        now: new Date(2026, 7, 8),
      }
    );

    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every((dateKey) => new Date(`${dateKey}T00:00:00`).getDay() === 4)).toBe(true);
  });

  describe('findDeliveryDateBlockers', () => {
    const tuesdaySchedule = {
      active: true,
      weeklyDays: [2],
      defaultCutoff: { hoursBeforeDelivery: 33 },
      horizonWeeks: 4,
    };
    const tuesdayOrder = (hoursBefore, businessName) => ({
      orderMode: 'always_on_grocery',
      businessName,
      pickupSpots: [community],
      fulfillmentConfig: { weeklyDeliveryDays: [2, 3], weeklyCutoffByDay: { 2: hoursBefore } },
    });
    const mondayLunch = new Date(2026, 9, 12, 12, 52);

    test('names the business whose earlier cutoff moves the whole cart to next week', () => {
      const ordersById = {
        regular: tuesdayOrder(33, 'Regular Farm'),
        early: tuesdayOrder(36, 'Early Farm'),
      };

      expect(generateSharedAvailableDeliveryDates(
        tuesdaySchedule,
        Object.values(ordersById),
        { communityName: community, now: mondayLunch }
      )[0]).toBe('2026-10-20');

      const result = findDeliveryDateBlockers(tuesdaySchedule, ordersById, {
        communityName: community,
        now: mondayLunch,
      });

      expect(result.earliestDate).toBe('2026-10-13');
      expect(result.blockers).toHaveLength(1);
      expect(result.blockers[0].orderId).toBe('early');
      expect(result.blockers[0].businessName).toBe('Early Farm');
      expect(result.blockers[0].cutoffAt.getHours()).toBe(11);
    });

    test('returns null when every business in the cart still makes the earliest date', () => {
      expect(findDeliveryDateBlockers(tuesdaySchedule, {
        a: tuesdayOrder(33, 'A'),
        b: tuesdayOrder(33, 'B'),
      }, { communityName: community, now: mondayLunch })).toBeNull();
    });
  });

  describe('always-on go-live', () => {
    const now = new Date(2026, 10, 7, 12, 0);
    const base = {
      orderMode: 'always_on_grocery',
      pickupSpots: ['North', 'South'],
    };
    const linkedForm = {
      orderType: 'one_time',
      endingTimeByPickupSpot: {
        North: new Date(2026, 10, 7, 12, 30),
        South: new Date(2026, 10, 9, 20, 0),
      },
      endingTime: new Date(2026, 10, 9, 20, 0),
    };

    test('immediate and legacy forms are live right away', () => {
      expect(isAlwaysOnGroceryOrderLive(base, 'North', now)).toBe(true);
      expect(isAlwaysOnGroceryOrderLive({ ...base, goLive: { mode: 'immediate' } }, 'North', now)).toBe(true);
    });

    test('at_time opens every community at opensAt', () => {
      const future = { ...base, goLive: { mode: 'at_time', opensAt: new Date(2026, 10, 7, 13, 0) } };
      const past = { ...base, goLive: { mode: 'at_time', opensAt: new Date(2026, 10, 7, 11, 0) } };
      expect(isAlwaysOnGroceryOrderLive(future, 'North', now)).toBe(false);
      expect(isAlwaysOnGroceryOrderLive(past, 'North', now)).toBe(true);
      expect(isAlwaysOnGroceryOrderLive(past, 'South', now)).toBe(true);
    });

    test('after_order opens per community once the linked form leaves the store there', () => {
      const order = {
        ...base,
        goLive: { mode: 'after_order', linkedOrderId: 'linked' },
        [GO_LIVE_LINKED_ORDER_FIELD]: linkedForm,
      };
      expect(isAlwaysOnGroceryOrderLive(order, 'North', now)).toBe(true);
      expect(isAlwaysOnGroceryOrderLive(order, 'South', now)).toBe(false);
      expect(isAlwaysOnGroceryOrderLive(order, '', now)).toBe(true);
    });

    test('after_order stays closed for a community without a linked end time', () => {
      const order = {
        ...base,
        pickupSpots: ['West'],
        goLive: { mode: 'after_order', linkedOrderId: 'linked' },
        [GO_LIVE_LINKED_ORDER_FIELD]: { orderType: 'one_time', endingTimeByPickupSpot: { North: new Date(2026, 10, 1) } },
      };
      expect(isAlwaysOnGroceryOrderLive(order, 'West', now)).toBe(false);
    });

    test('after_order falls back to the saved snapshot, and stays closed without one', () => {
      const withSnapshot = {
        ...base,
        goLive: {
          mode: 'after_order',
          linkedOrderId: 'linked',
          linkedEndsAtByCommunity: { North: new Date(2026, 10, 7, 12, 30).toISOString() },
        },
      };
      expect(isAlwaysOnGroceryOrderLive(withSnapshot, 'North', now)).toBe(true);
      expect(isAlwaysOnGroceryOrderLive(withSnapshot, 'South', now)).toBe(false);
      expect(isAlwaysOnGroceryOrderLive(
        { ...base, goLive: { mode: 'after_order', linkedOrderId: 'linked' } },
        'North',
        now,
      )).toBe(false);
    });

    test('manual disable wins over go-live', () => {
      const order = { ...base, alwaysOnEnabled: false, goLive: { mode: 'at_time', opensAt: new Date(2026, 0, 1) } };
      expect(isAlwaysOnGroceryOrderLive(order, 'North', now)).toBe(false);
    });

    test('delivery dates are not orderable before go-live', () => {
      const order = {
        ...alwaysOnOrder,
        pickupSpots: [community],
        goLive: { mode: 'at_time', opensAt: new Date(2026, 10, 20) },
      };
      expect(isDeliveryDateOrderable('2026-11-12', schedule, now, order, community)).toBe(false);
      expect(isDeliveryDateOrderable('2026-11-12', schedule, now, { ...order, goLive: null }, community)).toBe(true);
    });
  });

  test('schedule document keys keep the resolved name first and skip blanks', () => {
    expect(getDeliveryScheduleDocumentKeys('  Community X  ')).toEqual(['Community X']);
    expect(getDeliveryScheduleDocumentKeys('')).toEqual([]);
  });
});
