import { getWeekKey, parseDateSafe, toLocalDateKey } from './deliveryScheduleUtils';

export function getAnalyticsWeekRange(value) {
  const weekKey = getWeekKey(value);
  const start = parseDateSafe(weekKey);
  if (!start) return null;
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getAnalyticsWeekStartKey(value) {
  return getWeekKey(value);
}

export function getAnalyticsWeekEndKey(value) {
  const range = getAnalyticsWeekRange(value);
  return range ? toLocalDateKey(range.end) : '';
}

export function normalizeAnalyticsDateRange(startValue, endValue) {
  const startRange = getAnalyticsWeekRange(startValue || endValue);
  const endRange = getAnalyticsWeekRange(endValue || startValue);
  if (!startRange || !endRange) return null;

  if (startRange.start <= endRange.end) {
    return { start: startRange.start, end: endRange.end };
  }
  return { start: endRange.start, end: startRange.end };
}

export function getDefaultCompletedAnalyticsRange(weekCount = 12, now = new Date()) {
  const currentWeek = getAnalyticsWeekRange(now);
  if (!currentWeek) return { startDate: '', endDate: '' };

  const end = new Date(currentWeek.start);
  end.setDate(currentWeek.start.getDate() - 1);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(end.getDate() - (Math.max(1, Number(weekCount) || 12) * 7) + 1);
  start.setHours(0, 0, 0, 0);

  return {
    startDate: toLocalDateKey(start),
    endDate: toLocalDateKey(end),
  };
}

export function formatAnalyticsWeekLabel(value) {
  const range = getAnalyticsWeekRange(value);
  if (!range) return '';
  const format = (date) => (
    `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
  );
  return `${format(range.start)}–${format(range.end)}`;
}
