jest.mock('../services/pickupSpotsService', () => ({
  resolveCommunityName: (name) => name,
}));

import {
  findDeliveryDateBlockers,
  generateAvailableDeliveryDates,
  generateSharedAvailableDeliveryDates,
  getDeliveryScheduleDocumentKeys,
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

  test('schedule document keys keep the resolved name first and skip blanks', () => {
    expect(getDeliveryScheduleDocumentKeys('  Community X  ')).toEqual(['Community X']);
    expect(getDeliveryScheduleDocumentKeys('')).toEqual([]);
  });
});
