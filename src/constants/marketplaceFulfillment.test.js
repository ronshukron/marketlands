import {
  FULFILLMENT_METHOD_VOLUNTEER_PICKUP,
  getCommonServiceableCommunityNames,
  getCustomerFulfillmentOptions,
  getServiceableCommunityNames,
  isCommunityServed,
  preparePromotionFulfillmentForSave,
  promotionToCustomerFulfillment,
  resolvePromotionFulfillment,
  validateFulfillmentChoice,
} from './marketplaceFulfillment';
import { setMarketplaceCommunityIdentity } from '../utils/marketplaceCommunityIdentity';
import { FULFILLMENT_LABEL_BUSINESS_PICKUP, FULFILLMENT_LABEL_VOLUNTEER_PICKUP } from '../utils/marketplaceVolunteerUtils';

beforeEach(() => {
  setMarketplaceCommunityIdentity({
    communities: ['ניצנים', 'נגבה', 'גת'],
    aliases: { 'ניצנים הישנה': 'ניצנים' },
  });
});

test('uses live aliases when matching configured communities', () => {
  const fulfillment = {
    pickupEnabled: true,
    pickupScope: 'selected',
    pickupCommunities: ['ניצנים'],
    deliveryEnabled: false,
    deliveryCommunities: [],
  };

  expect(getServiceableCommunityNames(fulfillment, ['ניצנים הישנה', 'נגבה'])).toEqual([
    'ניצנים',
  ]);
});

test('returns only communities served by every store', () => {
  const first = {
    pickupEnabled: true,
    pickupScope: 'selected',
    pickupCommunities: ['ניצנים', 'נגבה'],
  };
  const second = {
    pickupEnabled: true,
    pickupScope: 'selected',
    pickupCommunities: ['נגבה'],
  };

  expect(getCommonServiceableCommunityNames([first, second], ['ניצנים', 'נגבה', 'גת'])).toEqual([
    'נגבה',
  ]);
});

test('persists inherited promotion communities for listing and ordering consistently', () => {
  const store = {
    pickupEnabled: true,
    pickupScope: 'selected',
    pickupCommunities: ['נגבה'],
    deliveryEnabled: true,
    deliveryCommunities: ['גת'],
    deliveryPrice: 18,
  };
  const promotion = {
    allowSelfPickup: true,
    pickupScope: 'inherit',
    deliveryEnabled: true,
    deliveryInheritFromStore: true,
    deliveryPriceInheritFromStore: true,
  };
  const saved = preparePromotionFulfillmentForSave(promotion, store);
  const listing = promotionToCustomerFulfillment(saved);
  const ordering = resolvePromotionFulfillment(promotion, store);
  const listingViaStore = promotionToCustomerFulfillment(promotion, store);

  expect(listing.pickupCommunities).toEqual(['נגבה']);
  expect(listing.deliveryCommunities).toEqual(['גת']);
  expect(listing.deliveryPrice).toBe(18);
  expect(isCommunityServed(listing, 'נגבה')).toBe(true);
  expect(isCommunityServed(ordering, 'נגבה')).toBe(true);
  expect(isCommunityServed(listingViaStore, 'נגבה')).toBe(true);
  expect(isCommunityServed(listing, 'ניצנים')).toBe(false);
  expect(isCommunityServed(ordering, 'ניצנים')).toBe(false);
  expect(isCommunityServed(listingViaStore, 'ניצנים')).toBe(false);
});

test('does not treat unresolved inherit scope as open-to-all', () => {
  const listing = promotionToCustomerFulfillment({
    allowSelfPickup: true,
    pickupScope: 'inherit',
    pickupCommunities: [],
    deliveryEnabled: false,
  });

  expect(listing.pickupScope).toBe('selected');
  expect(isCommunityServed(listing, 'נגבה')).toBe(false);
});

test('exposes distinct business and volunteer pickup options when a volunteer is available', () => {
  const fulfillment = {
    pickupEnabled: true,
    allowVolunteerPickup: true,
    pickupScope: 'all',
    pickupCommunities: [],
    deliveryEnabled: false,
    deliveryCommunities: [],
    pickupInstructions: 'מהחצר',
  };
  const volunteer = {
    id: 'vol-1',
    fullName: 'דנה',
    community: 'נגבה',
    address: 'רחוב 1',
  };
  const options = getCustomerFulfillmentOptions(fulfillment, 'נגבה', {
    volunteerAvailable: true,
    volunteer,
  });

  expect(options.map((option) => option.id)).toEqual([
    'pickup',
    FULFILLMENT_METHOD_VOLUNTEER_PICKUP,
  ]);
  expect(options[0].label).toBe(FULFILLMENT_LABEL_BUSINESS_PICKUP);
  expect(options[1].label).toBe(FULFILLMENT_LABEL_VOLUNTEER_PICKUP);
  expect(
    validateFulfillmentChoice(fulfillment, 'נגבה', FULFILLMENT_METHOD_VOLUNTEER_PICKUP, {
      volunteerAvailable: true,
    })
  ).toBeNull();
  expect(
    validateFulfillmentChoice(fulfillment, 'נגבה', FULFILLMENT_METHOD_VOLUNTEER_PICKUP, {
      volunteerAvailable: false,
    })
  ).toMatch(/מתנדב/);
});

test('persists allowVolunteerPickup on promotion save payload', () => {
  const saved = preparePromotionFulfillmentForSave(
    {
      allowSelfPickup: true,
      allowVolunteerPickup: true,
      pickupScope: 'all',
      deliveryEnabled: false,
    },
    { pickupEnabled: true, pickupScope: 'all' }
  );
  expect(saved.allowVolunteerPickup).toBe(true);
});
