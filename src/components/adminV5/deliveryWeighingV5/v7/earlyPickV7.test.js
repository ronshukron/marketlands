jest.mock('../../../../services/supplierOrderProgressService', () => ({
  fetchProcurementOverrides: jest.fn(),
}));

import {
  buildPickedElsewhereMap,
  findEarlyPickEntry,
  getEarlyPickCommunities,
  getEarlyPickWeekKeys,
  getExtraWeekKeysForEntries,
  loadEarlyPickForDay,
  selectEarlyPickedElsewhere,
  selectEarlyPickEntries,
  sortCommunitiesEarlyPickLast,
  withoutEarlyPickOrders,
} from './earlyPickV7';

const overrides = [
  { community: 'K', originalDeliveryDate: '2026-11-12', procureOnDate: '2026-11-10' },
  { community: 'M', originalDeliveryDate: '2026-11-10', procureOnDate: '2026-11-09' },
  { community: 'S', originalDeliveryDate: '2026-11-15', procureOnDate: '2026-11-12' },
];

describe('early-pick selectors', () => {
  test('pulled-in entries are those procured on the selected day', () => {
    expect(selectEarlyPickEntries(overrides, '2026-11-10').map((entry) => entry.community)).toEqual(['K']);
    expect(selectEarlyPickEntries(overrides, '')).toEqual([]);
  });

  test('picked-elsewhere entries are this day\'s communities procured on another day', () => {
    expect(selectEarlyPickedElsewhere(overrides, '2026-11-10').map((entry) => entry.community)).toEqual(['M']);
    expect(buildPickedElsewhereMap(selectEarlyPickedElsewhere(overrides, '2026-11-10'))).toEqual({ M: '2026-11-09' });
  });

  test('matches an order by community and its real delivery date', () => {
    expect(findEarlyPickEntry(overrides, 'K', '2026-11-12')).toBe(overrides[0]);
    expect(findEarlyPickEntry(overrides, 'K', '2026-11-13')).toBeNull();
  });
});

describe('early-pick week keys', () => {
  test('a day reads overrides from its own week and the next one', () => {
    expect(getEarlyPickWeekKeys('2026-11-12')).toEqual(['2026-11-08', '2026-11-15']);
  });

  test('only entries from another week require extra week keys', () => {
    expect(getExtraWeekKeysForEntries([overrides[0]], '2026-11-08')).toEqual([]);
    expect(getExtraWeekKeysForEntries([overrides[0], overrides[2]], '2026-11-08')).toEqual(['2026-11-15']);
  });
});

describe('loadEarlyPickForDay', () => {
  test('returns pulled-in and picked-elsewhere entries', async () => {
    const fetchOverrides = jest.fn().mockResolvedValue(overrides);
    const result = await loadEarlyPickForDay({ dayKey: '2026-11-12', fetchOverrides });
    expect(fetchOverrides).toHaveBeenCalledWith(['2026-11-08', '2026-11-15']);
    expect(result.pulledIn.map((entry) => entry.community)).toEqual(['S']);
    expect(result.pickedElsewhere.map((entry) => entry.community)).toEqual(['K']);
  });

  test('never blocks loading when overrides cannot be read', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const fetchOverrides = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(loadEarlyPickForDay({ dayKey: '2026-11-12', fetchOverrides }))
      .resolves.toEqual({ pulledIn: [], pickedElsewhere: [] });
    spy.mockRestore();
  });
});

describe('early-pick ordering', () => {
  const orders = [
    { id: '1', pickupSpot: 'A' },
    { id: '2', pickupSpot: 'K', earlyPick: { originalDeliveryDate: '2026-11-12' } },
    { id: '3', pickupSpot: 'B' },
  ];

  test('early-pick-only communities move to the end, others keep their order', () => {
    const early = getEarlyPickCommunities(orders);
    expect(Array.from(early)).toEqual(['K']);
    expect(sortCommunitiesEarlyPickLast(['K', 'B', 'A'], early)).toEqual(['B', 'A', 'K']);
  });

  test('a community that also has regular orders is not treated as early pick', () => {
    const mixed = [...orders, { id: '4', pickupSpot: 'K' }];
    expect(getEarlyPickCommunities(mixed).size).toBe(0);
  });

  test('withoutEarlyPickOrders keeps only regular orders', () => {
    expect(withoutEarlyPickOrders(orders).map((order) => order.id)).toEqual(['1', '3']);
  });
});
