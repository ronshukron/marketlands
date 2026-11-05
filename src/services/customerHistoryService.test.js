import { classifyCustomer, customerHistoryFromProfiles } from './customerHistoryService';

test('builds history entries from profile counters and skips customers without completed orders', () => {
  const stats = customerHistoryFromProfiles({
    '050-1': { completedCount: 7, lastOrderDate: '2026-10-01T08:00:00.000Z' },
    '050-2': { completedCount: 0, lastOrderDate: '' },
    '050-3': { isVip: true },
  });

  expect(Object.keys(stats)).toEqual(['050-1']);
  expect(stats['050-1'].completedCount).toBe(7);
  expect(stats['050-1'].lastOrderDate).toEqual(new Date('2026-10-01T08:00:00.000Z'));
});

test('classifies a profile-derived entry the same way as before', () => {
  const recent = new Date();
  const stats = customerHistoryFromProfiles({
    loyal: { completedCount: 9, lastOrderDate: recent.toISOString() },
  });

  expect(classifyCustomer(stats.loyal)).toMatchObject({ isNew: false, isLapsed: false, completedCount: 9 });
  expect(classifyCustomer(stats.unknown)).toMatchObject({ isNew: true, isLapsed: false, completedCount: 0 });
});
