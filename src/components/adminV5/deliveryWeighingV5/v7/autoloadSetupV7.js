import { getWeekKey, toLocalDateKey } from '../../../../utils/deliveryScheduleUtils';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseAutoloadSetupFromSearch(search, now = new Date()) {
  const params = new URLSearchParams(typeof search === 'string' ? search : '');
  const autoload = String(params.get('autoload') || '').trim().toLowerCase();
  const dateParam = String(params.get('date') || '').trim();
  if (autoload !== 'today' && !DATE_KEY_RE.test(dateParam)) return null;

  const todayKey = DATE_KEY_RE.test(dateParam) ? dateParam : toLocalDateKey(now);
  if (!todayKey) return null;
  const weekKey = getWeekKey(todayKey);
  if (!weekKey) return null;

  return {
    weekKey,
    startDate: todayKey,
    endDate: todayKey,
    communities: [],
  };
}

export function readAutoloadSetupFromLocation(location = typeof window === 'undefined' ? null : window.location, now = new Date()) {
  if (!location) return null;
  return parseAutoloadSetupFromSearch(location.search, now);
}
