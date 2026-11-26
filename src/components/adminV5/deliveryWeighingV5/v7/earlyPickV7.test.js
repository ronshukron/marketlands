jest.mock('../../../../services/supplierOrderProgressService', () => ({
  fetchProcurementOverrides: jest.fn(),
}));

import {
  findEarlyPickEntry,
  getEarlyPickCommunities,
  getEarlyPickWeekKeys,
  getExtraWeekKeysForEntries,
  getPickedElsewhereDay,
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
    const entries = selectEarlyPickedElsewhere(overrides, '2026-11-10');
    expect(getPickedElsewhereDay({ pickupSpot: 'M' }, entries)).toBe('2026-11-09');
    expect(getPickedElsewhereDay({ pickupSpot: 'Z' }, entries)).toBe('');
  });

  test('matches an order by community and its real delivery date', () => {
    expect(findEarlyPickEntry(overrides, 'K', '2026-11-12')).toBe(overrides[0]);
    expect(findEarlyPickEntry(overrides, 'K', '2026-11-13')).toBeNull();
  });

  test('an order that entered after the early purchase closed stays on its own day', () => {
    const closed = [{ ...overrides[0], cutoffAt: '2026-11-09T13:30:00.000Z' }];
    const early = { delayedPayment: { heldAt: '2026-11-09T13:11:00.000Z' } };
    const late = { delayedPayment: { heldAt: '2026-11-09T17:00:00.000Z' } };
    expect(findEarlyPickEntry(closed, 'K', '2026-11-12', early)).toBe(closed[0]);
    expect(findEarlyPickEntry(closed, 'K', '2026-11-12', late)).toBeNull();
    expect(getPickedElsewhereDay({ pickupSpot: 'K', rawData: early }, closed)).toBe('2026-11-10');
    expect(getPickedElsewhereDay({ pickupSpot: 'K', rawData: late }, closed)).toBe('');
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
