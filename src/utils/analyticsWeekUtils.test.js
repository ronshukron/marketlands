import {
  formatAnalyticsWeekLabel,
  getAnalyticsWeekEndKey,
  getAnalyticsWeekStartKey,
  getDefaultCompletedAnalyticsRange,
  normalizeAnalyticsDateRange,
} from './analyticsWeekUtils';

describe('analytics Sunday-Saturday weeks', () => {
  test('normalizes any date to its full calendar week', () => {
    expect(getAnalyticsWeekStartKey('2026-08-14')).toBe('2026-08-09');
    expect(getAnalyticsWeekEndKey('2026-08-14')).toBe('2026-08-15');

    const range = normalizeAnalyticsDateRange('2025-11-22', '2026-08-14');
    expect(range.start).toEqual(new Date(2025, 10, 16, 0, 0, 0, 0));
    expect(range.end).toEqual(new Date(2026, 7, 15, 23, 59, 59, 999));
  });

  test('defaults to a fixed number of completed weeks', () => {
    expect(getDefaultCompletedAnalyticsRange(12, new Date(2026, 7, 14))).toEqual({
      startDate: '2026-05-17',
      endDate: '2026-08-08',
    });
  });

  test('formats the full week instead of only its first day', () => {
    expect(formatAnalyticsWeekLabel('2026-08-14')).toBe('09/08–15/08');
  });
});
