import { resolveCommunityName } from '../services/pickupSpotsService';

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (value) => String(value).padStart(2, '0');

export function toLocalDateKey(date) {
  const parsed = parseDateSafe(date);
  if (!parsed) return '';
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
}

export function parseDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (value?.toDate && typeof value.toDate === 'function') {
    try {
      const parsed = value.toDate();
      return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    } catch (error) {
      return null;
    }
  }
  if (typeof value === 'string') {
    if (DATE_KEY_REGEX.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function getWeekKey(date) {
  const parsed = parseDateSafe(date);
  if (!parsed) return '';
  const sunday = new Date(parsed);
  sunday.setDate(parsed.getDate() - parsed.getDay());
  sunday.setHours(0, 0, 0, 0);
  return toLocalDateKey(sunday);
}

/** Recent Sunday week keys (newest first) without a Firestore scan — safer on mobile Safari. */
export function getRecentWeekKeys(count = 24) {
  const weeks = [];
  const sunday = new Date();
  sunday.setDate(sunday.getDate() - sunday.getDay());
  sunday.setHours(0, 0, 0, 0);

  for (let index = 0; index < count; index += 1) {
    weeks.push(toLocalDateKey(sunday));
    sunday.setDate(sunday.getDate() - 7);
  }

  return weeks;
}

export function getDateRangeFromWeekKey(weekKey, options = {}) {
  const { includeSaturday = false } = options;
  const start = parseDateSafe(weekKey);
  if (!start) return null;
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + (includeSaturday ? 6 : 5));
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function normalizeDateRange(startDate, endDate) {
  if (!startDate && !endDate) return null;
  const rawStart = startDate || endDate;
  const rawEnd = endDate || startDate;
  const start = parseDateSafe(rawStart);
  const end = parseDateSafe(rawEnd);
  if (!start || !end) return null;
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return start <= end ? { start, end } : { start: end, end: start };
}

export function isAlwaysOnGroceryOrder(orderData = {}) {
  return orderData.orderMode === 'always_on_grocery'
    || orderData.orderType === 'always_on_grocery'
    || orderData.alwaysOn === true
    || orderData.groceryStore === true;
}

export function isAlwaysOnGroceryOrderEnabled(orderData = {}) {
  if (!isAlwaysOnGroceryOrder(orderData)) return true;
  return orderData.archived !== true
    && orderData.alwaysOnEnabled !== false
    && orderData.alwaysOnDisabled !== true
    && orderData.fulfillmentConfig?.enabled !== false
    && orderData.fulfillmentConfig?.orderFormEnabled !== false;
}

export function getEffectiveCutoffAt(deliveryDate, scheduleDoc = {}) {
  const dateKey = toLocalDateKey(deliveryDate);
  if (!dateKey) return null;

  const exception = scheduleDoc.exceptions?.[dateKey];
  const exceptionCutoff = parseDateSafe(exception?.cutoffAt);
  if (exceptionCutoff) return exceptionCutoff;

  const hoursBeforeDelivery = Number(scheduleDoc.defaultCutoff?.hoursBeforeDelivery);
  if (!Number.isFinite(hoursBeforeDelivery)) return null;

  const deliveryDateEnd = parseDateSafe(dateKey);
  if (!deliveryDateEnd) return null;
  deliveryDateEnd.setHours(23, 59, 59, 999);
  return new Date(deliveryDateEnd.getTime() - hoursBeforeDelivery * 60 * 60 * 1000);
}

export function getOrderCutoffOverrideAt(deliveryDate, orderData = {}, communityName = '') {
  const dateKey = toLocalDateKey(deliveryDate);
  if (!dateKey) return null;

  const overrides = orderData.fulfillmentConfig?.cutoffOverrides || orderData.cutoffOverrides || {};
  const communityOverride = communityName ? overrides?.[communityName]?.[dateKey] : null;
  const dateOverride = overrides?.[dateKey];
  return parseDateSafe(communityOverride?.cutoffAt || dateOverride?.cutoffAt || communityOverride || dateOverride);
}

const LEGACY_CUTOFF_TIME_REGEX = /^\d{1,2}:\d{2}$/;

function readWeekdayCutoffValue(config = {}, communityName = '', weekday) {
  const dayKey = String(weekday);
  const byCommunity = config.cutoffByWeekdayByCommunity?.[communityName];
  const communityValue = byCommunity?.[dayKey] ?? byCommunity?.[weekday];
  if (communityValue !== undefined && communityValue !== null && communityValue !== '') return communityValue;
  return config.weeklyCutoffByDay?.[dayKey] ?? config.weeklyCutoffByDay?.[weekday] ?? null;
}

function parseHoursBeforeDelivery(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (LEGACY_CUTOFF_TIME_REGEX.test(trimmed)) return null;
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

/** Recurring cutoff for a delivery weekday — hours before end of delivery day, or legacy HH:mm same day. */
export function getWeeklyCutoffAt(deliveryDate, orderData = {}, communityName = '') {
  const dateKey = toLocalDateKey(deliveryDate);
  const deliveryDay = parseDateSafe(dateKey);
  if (!deliveryDay) return null;

  const cutoffValue = readWeekdayCutoffValue(orderData.fulfillmentConfig || {}, communityName, deliveryDay.getDay());
  if (cutoffValue === null || cutoffValue === undefined || cutoffValue === '') return null;

  const hoursBeforeDelivery = parseHoursBeforeDelivery(cutoffValue);
  if (hoursBeforeDelivery !== null) {
    const deliveryDateEnd = parseDateSafe(dateKey);
    if (!deliveryDateEnd) return null;
    deliveryDateEnd.setHours(23, 59, 59, 999);
    return new Date(deliveryDateEnd.getTime() - hoursBeforeDelivery * 60 * 60 * 1000);
  }

  if (typeof cutoffValue === 'string' && LEGACY_CUTOFF_TIME_REGEX.test(cutoffValue.trim())) {
    const [hours, minutes] = cutoffValue.split(':').map((part) => Number.parseInt(part, 10));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    const cutoff = new Date(deliveryDay);
    cutoff.setHours(hours, minutes, 0, 0);
    return cutoff;
  }

  return null;
}

export function getEffectiveOrderCutoffAt(deliveryDate, scheduleDoc = {}, orderData = {}, communityName = '') {
  return getOrderCutoffOverrideAt(deliveryDate, orderData, communityName)
    || getWeeklyCutoffAt(deliveryDate, orderData, communityName)
    || getEffectiveCutoffAt(deliveryDate, scheduleDoc);
}

export function isOrderParticipatingInDeliveryDate(deliveryDate, orderData = {}, communityName = '') {
  const dateKey = toLocalDateKey(deliveryDate);
  if (!dateKey) return false;

  const availability = orderData.fulfillmentConfig?.deliveryDateAvailability
    || orderData.deliveryDateAvailability
    || {};
  const communityAvailability = communityName ? availability?.[communityName]?.[dateKey] : null;
  const dateAvailability = availability?.[dateKey];
  const value = communityAvailability?.enabled ?? dateAvailability?.enabled ?? communityAvailability ?? dateAvailability;
  return value !== false;
}

export function isDeliveryDateOrderable(deliveryDate, scheduleDoc = {}, now = new Date(), orderData = null, communityName = '') {
  if (!scheduleDoc || scheduleDoc.active === false) return false;
  if (orderData && !isAlwaysOnGroceryOrderEnabled(orderData)) return false;

  const dateKey = toLocalDateKey(deliveryDate);
  if (!dateKey) return false;

  const exception = scheduleDoc.exceptions?.[dateKey];
  if (exception?.enabled === false) return false;
  if (orderData && !isOrderParticipatingInDeliveryDate(dateKey, orderData, communityName)) return false;

  const parsedDeliveryDate = parseDateSafe(dateKey);
  if (!parsedDeliveryDate) return false;
  parsedDeliveryDate.setHours(23, 59, 59, 999);
  if (parsedDeliveryDate < now) return false;

  const cutoffAt = orderData
    ? getEffectiveOrderCutoffAt(dateKey, scheduleDoc, orderData, communityName)
    : getEffectiveCutoffAt(dateKey, scheduleDoc);
  return !cutoffAt || now < cutoffAt;
}

export function generateAvailableDeliveryDates(scheduleDoc, options = {}) {
  if (!scheduleDoc || scheduleDoc.active === false) return [];

  const {
    fromDate = new Date(),
    horizonWeeks = scheduleDoc.horizonWeeks || 8,
    now = new Date(),
    includePastCutoff = false,
  } = options;

  const start = parseDateSafe(fromDate) || new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + Math.max(1, Number(horizonWeeks) || 8) * 7);

  const weeklyDays = Array.isArray(scheduleDoc.weeklyDays)
    ? scheduleDoc.weeklyDays.map(Number).filter((day) => day >= 0 && day <= 6)
    : [];

  const fulfillmentConfig = options.orderData?.fulfillmentConfig || {};
  const globalBusinessDays = fulfillmentConfig.weeklyDeliveryDays;
  const perCommunityDays = options.communityName
    ? fulfillmentConfig.weeklyDaysByCommunity?.[options.communityName]
    : null;
  const businessWeeklyDays = Array.isArray(globalBusinessDays) && globalBusinessDays.length > 0
    ? globalBusinessDays
    : perCommunityDays;
  const allowedBusinessDays = Array.isArray(businessWeeklyDays) && businessWeeklyDays.length > 0
    ? businessWeeklyDays.map(Number).filter((day) => day >= 0 && day <= 6)
    : null;

  const dateKeys = new Set();
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const day = cursor.getDay();
    if (!weeklyDays.includes(day)) continue;
    if (allowedBusinessDays && !allowedBusinessDays.includes(day)) continue;
    dateKeys.add(toLocalDateKey(cursor));
  }

  Object.entries(scheduleDoc.exceptions || {}).forEach(([dateKey, exception]) => {
    if (!DATE_KEY_REGEX.test(dateKey)) return;
    if (exception?.enabled === false) {
      dateKeys.delete(dateKey);
    } else if (exception?.enabled === true) {
      dateKeys.add(dateKey);
    }
  });

  return Array.from(dateKeys)
    .filter((dateKey) => includePastCutoff || isDeliveryDateOrderable(dateKey, scheduleDoc, now, options.orderData, options.communityName))
    .sort();
}

export function getOrderDeliveryDate(orderData = {}) {
  return parseDateSafe(orderData.fulfillment?.deliveryDate)
    || parseDateSafe(orderData.deliveryDate)
    || parseDateSafe(orderData.createdAt)
    || parseDateSafe(orderData.createdAtIso)
    || parseDateSafe(orderData.updatedAt);
}

export function getOrderDeliveryWeekKey(orderData = {}) {
  return orderData.fulfillment?.deliveryWeekKey
    || orderData.deliveryWeekKey
    || getWeekKey(getOrderDeliveryDate(orderData));
}

export function isOrderDeliveryDateFallback(orderData = {}) {
  return !parseDateSafe(orderData.fulfillment?.deliveryDate) && !parseDateSafe(orderData.deliveryDate);
}

export function getOrderCommunity(orderData = {}) {
  const raw = orderData.fulfillment?.community
    || orderData.community
    || orderData.customerDetails?.pickupSpot
    || 'לא צוין';
  return resolveCommunityName(raw) || raw;
}

/** True when the visible delivery dates are in a week after the current week. */
export function isShowingNextDeliveryWeek(availableDates, now = new Date()) {
  if (!availableDates?.length) return false;
  return getWeekKey(availableDates[0]) !== getWeekKey(now);
}

/** Delivery date keys for the week shown to customers (current week if any remain, else next). */
export function getVisibleWeekDeliveryDateKeys(scheduleDoc, now = new Date()) {
  if (!scheduleDoc || scheduleDoc.active === false) return [];

  const dates = generateAvailableDeliveryDates(scheduleDoc, { now });
  if (!dates.length) return [];

  const currentWeekKey = getWeekKey(now);
  const currentWeekDates = dates.filter((dateKey) => getWeekKey(dateKey) === currentWeekKey);
  const visibleWeekKey = currentWeekDates.length > 0 ? currentWeekKey : getWeekKey(dates[0]);
  return dates.filter((dateKey) => getWeekKey(dateKey) === visibleWeekKey);
}
