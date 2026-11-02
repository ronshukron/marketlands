import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { format, startOfWeek, subWeeks } from 'date-fns';
import { db } from '../firebase/firebase';
import { toLocalDateKey } from './deliveryScheduleUtils';

export const buildRecentWeekKeys = (count = 104) => {
  const currentSunday = startOfWeek(new Date(), { weekStartsOn: 0 });
  return Array.from({ length: count }, (_, i) =>
    format(subWeeks(currentSunday, i), 'yyyy-MM-dd')
  );
};

// createdAt is stored as an ISO string by current writers and as a Timestamp in older
// documents; Firestore range filters only match values of the same type, so query both.
export const fetchDocsByCreatedAtRange = async (collectionName, startDate, endDate) => {
  const ref = collection(db, collectionName);
  const [isoSnap, tsSnap] = await Promise.all([
    getDocs(query(
      ref,
      where('createdAt', '>=', startDate.toISOString()),
      where('createdAt', '<=', endDate.toISOString())
    )),
    getDocs(query(
      ref,
      where('createdAt', '>=', Timestamp.fromDate(startDate)),
      where('createdAt', '<=', Timestamp.fromDate(endDate))
    ))
  ]);
  return [...isoSnap.docs, ...tsSnap.docs];
};

// Same priority as getOrderDeliveryDate(): an order is in the delivery window only
// when one of these fields parses into that window. Querying them directly keeps
// the full-scan result without reading every historical order.
export const DELIVERY_WINDOW_INDEX_FIELDS = [
  'fulfillment.deliveryDate',
  'deliveryDate',
  'createdAt',
  'createdAtIso',
  'updatedAt',
];

// Date keys (YYYY-MM-DD) and ISO strings do not share a sort position around
// midnight, so the bounds cover both. \uf8ff keeps every string on the end day.
export const buildIndexedStringRange = (startDate, endDate) => {
  const startKey = toLocalDateKey(startDate);
  const endKey = toLocalDateKey(endDate);
  if (!startKey || !endKey) return null;

  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const start = startIso < startKey ? startIso : startKey;
  const end = endIso > `${endKey}\uf8ff` ? endIso : `${endKey}\uf8ff`;
  if (start > end) return null;
  return { start, end };
};

const dedupeDocs = (groups) => {
  const byId = new Map();
  groups.flat().forEach((docSnap) => {
    if (!docSnap?.id || byId.has(docSnap.id)) return;
    byId.set(docSnap.id, docSnap);
  });
  return Array.from(byId.values());
};

const fetchFieldRange = async (ref, fieldPath, start, end) => {
  const snap = await getDocs(query(
    ref,
    where(fieldPath, '>=', start),
    where(fieldPath, '<=', end)
  ));
  return snap.docs;
};

// Indexed superset of a full collection scan filtered by delivery date.
// Callers still apply getOrderDeliveryDate() so documents matched by an
// earlier field (for example createdAt) but delivering outside the window
// are dropped, and the visible result stays the same.
export const fetchDocsForDeliveryWindow = async (collectionName, startDate, endDate) => {
  const stringRange = buildIndexedStringRange(startDate, endDate);
  if (!stringRange) return [];

  const ref = collection(db, collectionName);
  const startTimestamp = Timestamp.fromDate(startDate);
  const endTimestamp = Timestamp.fromDate(endDate);
  const groups = await Promise.all(DELIVERY_WINDOW_INDEX_FIELDS.flatMap((fieldPath) => [
    fetchFieldRange(ref, fieldPath, stringRange.start, stringRange.end),
    fetchFieldRange(ref, fieldPath, startTimestamp, endTimestamp),
  ]));
  return dedupeDocs(groups);
};
