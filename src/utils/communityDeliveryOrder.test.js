import {
  assignCommunityDeliveryGroup,
  buildCommunityOrderingEntries,
  compareCommunitiesForDelivery,
  sortCommunitiesForDelivery,
} from './communityDeliveryOrder';

describe('compareCommunitiesForDelivery', () => {
  test('keeps grouped communities contiguous even when input is interleaved', () => {
    const communities = [
      { name: 'X', sortOrder: 10, deliveryGroup: 'north' },
      { name: 'Solo', sortOrder: 20, deliveryGroup: '' },
      { name: 'Y', sortOrder: 30, deliveryGroup: 'north' },
      { name: 'Z', sortOrder: 40, deliveryGroup: 'north' },
      { name: 'South-A', sortOrder: 50, deliveryGroup: 'south' },
    ];

    const sorted = sortCommunitiesForDelivery(communities).map((community) => community.name);
    expect(sorted).toEqual(['X', 'Y', 'Z', 'Solo', 'South-A']);
  });

  test('orders groups by the lowest sortOrder in the group', () => {
    const communities = [
      { name: 'LateNorth', sortOrder: 80, deliveryGroup: 'north' },
      { name: 'EarlySouth', sortOrder: 10, deliveryGroup: 'south' },
      { name: 'SouthTwo', sortOrder: 20, deliveryGroup: 'south' },
      { name: 'NorthTwo', sortOrder: 90, deliveryGroup: 'north' },
    ];

    const sorted = [...communities].sort(compareCommunitiesForDelivery(communities));
    expect(sorted.map((community) => community.name)).toEqual([
      'EarlySouth',
      'SouthTwo',
      'LateNorth',
      'NorthTwo',
    ]);
  });

  test('treats ungrouped communities as singletons', () => {
    const communities = [
      { name: 'B', sortOrder: 20, deliveryGroup: '' },
      { name: 'A', sortOrder: 10, deliveryGroup: '' },
    ];
    expect(sortCommunitiesForDelivery(communities).map((community) => community.name)).toEqual(['A', 'B']);
  });
});

describe('assignCommunityDeliveryGroup', () => {
  test('appends a community to the end of an existing group', () => {
    const communities = [
      { name: 'A', deliveryGroup: 'g1' },
      { name: 'B', deliveryGroup: 'g1' },
      { name: 'C', deliveryGroup: '' },
    ];
    const next = assignCommunityDeliveryGroup(communities, 'C', 'g1');
    expect(next.map((community) => community.name)).toEqual(['A', 'B', 'C']);
    expect(next[2].deliveryGroup).toBe('g1');
  });
});

describe('buildCommunityOrderingEntries', () => {
  test('renumbers sortOrder in tens', () => {
    expect(buildCommunityOrderingEntries([
      { name: 'A', deliveryGroup: 'g' },
      { name: 'B', deliveryGroup: '' },
    ])).toEqual([
      { name: 'A', sortOrder: 10, deliveryGroup: 'g' },
      { name: 'B', sortOrder: 20, deliveryGroup: '' },
    ]);
  });
});
