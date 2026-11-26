import { fetchProcurementOverrides } from '../../../../services/supplierOrderProgressService';
import { getWeekKey, parseDateSafe, toLocalDateKey } from '../../../../utils/deliveryScheduleUtils';
import { isOrderAfterProcurementCutoff } from '../../../../utils/supplierOrderProgressUtils';

// Early pick = a community the admin pulled into another day's procurement
// (procurementOverrides). Orders keep their real delivery date; V7/V8 only
// show them on the procurement day as an extra, display-only block.

const EMPTY_EARLY_PICK = Object.freeze({ pulledIn: [], pickedElsewhere: [] });

export function selectEarlyPickEntries(overrides = [], dayKey = '') {
  if (!dayKey) return [];
  return (overrides || []).filter((entry) => (
    entry
    && entry.community
    && entry.originalDeliveryDate
    && entry.procureOnDate === dayKey
    && entry.originalDeliveryDate !== dayKey
  ));
}

export function selectEarlyPickedElsewhere(overrides = [], dayKey = '') {
  if (!dayKey) return [];
  return (overrides || []).filter((entry) => (
    entry
    && entry.community
    && entry.procureOnDate
    && entry.originalDeliveryDate === dayKey
    && entry.procureOnDate !== dayKey
  ));
}

function addDaysToDateKey(dateKey, days) {
  const date = parseDateSafe(dateKey);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

// Overrides are stored under the week of the original delivery date, so a day
// can receive communities from its own week or (e.g. Sunday deliveries) the next.
export function getEarlyPickWeekKeys(dayKey = '') {
  const weekKey = getWeekKey(dayKey);
  if (!weekKey) return [];
  const nextWeekKey = addDaysToDateKey(weekKey, 7);
  return nextWeekKey ? [weekKey, nextWeekKey] : [weekKey];
}

export function getExtraWeekKeysForEntries(entries = [], weekKey = '') {
  const keys = new Set();
  (entries || []).forEach((entry) => {
    const entryWeekKey = getWeekKey(entry?.originalDeliveryDate);
    if (entryWeekKey && entryWeekKey !== weekKey) keys.add(entryWeekKey);
  });
  return Array.from(keys).sort();
}

export async function loadEarlyPickForDay({ dayKey = '', fetchOverrides = fetchProcurementOverrides } = {}) {
  const weekKeys = getEarlyPickWeekKeys(dayKey);
  if (weekKeys.length === 0) return EMPTY_EARLY_PICK;
  try {
    const overrides = await fetchOverrides(weekKeys);
    return {
      pulledIn: selectEarlyPickEntries(overrides, dayKey),
      pickedElsewhere: selectEarlyPickedElsewhere(overrides, dayKey),
    };
  } catch (error) {
    console.error('Failed to load early-pick communities:', error);
    return EMPTY_EARLY_PICK;
  }
}

// With orderData, an order that entered after the early purchase closed is not part
// of it: it is purchased and picked on its own delivery day.
export function findEarlyPickEntry(entries = [], community = '', deliveryDateKey = '', orderData = null) {
  if (!community || !deliveryDateKey) return null;
  const entry = (entries || []).find((candidate) => (
    candidate.community === community && candidate.originalDeliveryDate === deliveryDateKey
  ));
  if (!entry || (orderData && isOrderAfterProcurementCutoff(orderData, entry))) return null;
  return entry;
}

export function isEarlyPickOrder(order) {
  return !!order?.earlyPick;
}

// Communities whose loaded orders are all early-pick orders.
export function getEarlyPickCommunities(orders = []) {
  const early = new Set();
  const regular = new Set();
  (orders || []).forEach((order) => {
    const community = order?.customerDetails?.pickupSpot || order?.pickupSpot || '';
    if (!community) return;
    if (isEarlyPickOrder(order)) early.add(community);
    else regular.add(community);
  });
  regular.forEach((community) => early.delete(community));
  return early;
}

export function withoutEarlyPickOrders(orders = []) {
  return (orders || []).filter((order) => !isEarlyPickOrder(order));
}

export function sortCommunitiesEarlyPickLast(communities = [], earlyPickCommunities = new Set()) {
  if (!earlyPickCommunities || earlyPickCommunities.size === 0) return communities;
  return [
    ...communities.filter((community) => !earlyPickCommunities.has(community)),
    ...communities.filter((community) => earlyPickCommunities.has(community)),
  ];
}

// The day this order's goods were purchased early, or '' when it belongs to its own day.
export function getPickedElsewhereDay(order, entries = []) {
  const community = order?.customerDetails?.pickupSpot || order?.pickupSpot || '';
  const entry = (entries || []).find((candidate) => candidate?.community === community);
  if (!entry || isOrderAfterProcurementCutoff(order.rawData || order, entry)) return '';
  return entry.procureOnDate || '';
}

export function formatEarlyPickDayLabel(dateKey, lang = 'he') {
  const date = parseDateSafe(dateKey);
  if (!date) return dateKey || '';
  return date.toLocaleDateString(lang === 'th' ? 'th-TH' : 'he-IL', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
}
