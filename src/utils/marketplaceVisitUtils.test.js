import {
  MARKETPLACE_LAST_VISIT_KEY,
  hasNewApprovedMarketplaceBusinesses,
  recordMarketplaceVisit,
} from './marketplaceVisitUtils';

describe('marketplace visit indicator', () => {
  const stores = [
    { status: 'active', visible: true, createdAt: '2026-07-20T00:00:00.000Z' },
    { status: 'pending', visible: true, createdAt: '2026-07-23T00:00:00.000Z' },
  ];

  test('shows only for approved visible businesses newer than the visit', () => {
    expect(hasNewApprovedMarketplaceBusinesses(stores, '2026-07-19T00:00:00.000Z')).toBe(true);
    expect(hasNewApprovedMarketplaceBusinesses(stores, '2026-07-21T00:00:00.000Z')).toBe(false);
    expect(hasNewApprovedMarketplaceBusinesses(
      [{ ...stores[0], visible: false }],
      '2026-07-19T00:00:00.000Z',
    )).toBe(false);
  });

  test('treats approved businesses as new before the first visit', () => {
    expect(hasNewApprovedMarketplaceBusinesses(stores, null)).toBe(true);
    expect(hasNewApprovedMarketplaceBusinesses([], null)).toBe(false);
  });

  test('records an ISO visit timestamp', () => {
    const storage = { setItem: jest.fn() };
    const value = recordMarketplaceVisit(storage, new Date('2026-07-24T10:00:00.000Z'));
    expect(storage.setItem).toHaveBeenCalledWith(
      MARKETPLACE_LAST_VISIT_KEY,
      '2026-07-24T10:00:00.000Z',
    );
    expect(value).toBe('2026-07-24T10:00:00.000Z');
  });
});
