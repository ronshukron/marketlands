jest.mock('../services/pickupSpotsService', () => ({
  resolveCommunityName: (name) => name,
}));

import {
  generateAvailableDeliveryDates,
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
});
