import {
  FULFILLMENT_LABEL_BUSINESS_PICKUP,
  FULFILLMENT_LABEL_VOLUNTEER_PICKUP,
  FULFILLMENT_METHOD_VOLUNTEER_PICKUP,
  buildMarketplaceVolunteerCommitment,
  getFulfillmentMethodLabel,
  isMarketplaceVolunteerActive,
  pickActiveVolunteerForCommunity,
  summarizeVolunteerPickupPoint,
} from './marketplaceVolunteerUtils';
import { setMarketplaceCommunityIdentity } from './marketplaceCommunityIdentity';

beforeEach(() => {
  setMarketplaceCommunityIdentity({
    communities: ['ניצנים', 'נגבה'],
    aliases: { 'ניצנים הישנה': 'ניצנים' },
  });
});

test('labels distinguish business pickup from volunteer pickup', () => {
  expect(getFulfillmentMethodLabel('pickup')).toBe(FULFILLMENT_LABEL_BUSINESS_PICKUP);
  expect(getFulfillmentMethodLabel(FULFILLMENT_METHOD_VOLUNTEER_PICKUP)).toBe(
    FULFILLMENT_LABEL_VOLUNTEER_PICKUP
  );
});

test('active volunteer must cover the current time and not be cancelled', () => {
  const now = '2026-07-20T12:00:00.000Z';
  expect(
    isMarketplaceVolunteerActive(
      {
        status: 'active',
        cancelled: false,
        commitment: {
          startAt: '2026-07-01T00:00:00.000Z',
          endAt: '2026-07-25T00:00:00.000Z',
        },
      },
      now
    )
  ).toBe(true);
  expect(
    isMarketplaceVolunteerActive(
      {
        status: 'active',
        cancelled: true,
        commitment: {
          startAt: '2026-07-01T00:00:00.000Z',
          endAt: '2026-07-25T00:00:00.000Z',
        },
      },
      now
    )
  ).toBe(false);
});

test('picks an active volunteer for a community alias', () => {
  const volunteer = {
    id: 'v1',
    community: 'ניצנים',
    status: 'active',
    commitment: {
      startAt: '2026-07-01T00:00:00.000Z',
      endAt: '2026-07-25T00:00:00.000Z',
    },
  };
  expect(pickActiveVolunteerForCommunity([volunteer], 'ניצנים הישנה', '2026-07-20T12:00:00.000Z')).toEqual(
    volunteer
  );
});

test('builds a promotion commitment window', () => {
  const commitment = buildMarketplaceVolunteerCommitment({
    startsAt: '2026-07-10T00:00:00.000Z',
    endsAt: '2026-07-18T20:00:00.000Z',
    deliveryDate: '2026-07-19',
    now: new Date('2026-07-11T10:00:00.000Z'),
  });
  expect(commitment.type).toBe('promotion_window');
  expect(commitment.startAt).toBe('2026-07-11T10:00:00.000Z');
  expect(new Date(commitment.endAt).getTime()).toBeGreaterThanOrEqual(
    new Date('2026-07-19T00:00:00.000Z').getTime()
  );
});

test('summarizes volunteer pickup point for order display', () => {
  expect(
    summarizeVolunteerPickupPoint({
      fullName: 'דנה',
      community: 'נגבה',
      address: 'רחוב 1',
      locationInstructions: 'ליד הגן',
    })
  ).toBe('דנה · נגבה · רחוב 1 · ליד הגן');
});
