jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(),
  Timestamp: {
    fromDate: (date) => ({ __timestamp: date.toISOString() }),
  },
}));

jest.mock('../firebase/firebase', () => ({ db: { mocked: true }, auth: {} }));

import { collection, getDocs, query, where } from 'firebase/firestore';
import { getOrderDeliveryDate } from './deliveryScheduleUtils';
import {
  DELIVERY_WINDOW_INDEX_FIELDS,
  buildIndexedStringRange,
  fetchDocsForDeliveryWindow,
} from './customerOrderDateQueries';

const start = new Date(2026, 10, 1, 0, 0, 0, 0);
const end = new Date(2026, 10, 6, 23, 59, 59, 999);

const timestamp = (date) => ({ toDate: () => date });

const catalog = [
  {
    id: 'placed-earlier',
    createdAt: new Date(2026, 9, 4, 9, 0).toISOString(),
    deliveryDate: '2026-11-04',
    fulfillment: { deliveryDate: '2026-11-04' },
  },
  {
    id: 'legacy-created-at',
    createdAt: new Date(2026, 10, 3, 15, 0).toISOString(),
  },
  {
    id: 'legacy-timestamp',
    createdAt: timestamp(new Date(2026, 10, 2, 11, 0)),
  },
  {
    id: 'fulfillment-wins',
    createdAt: new Date(2026, 9, 1, 8, 0).toISOString(),
    deliveryDate: '2026-11-20',
    fulfillment: { deliveryDate: '2026-11-03' },
  },
  {
    id: 'created-this-week-delivers-later',
    createdAt: new Date(2026, 10, 2, 8, 0).toISOString(),
    deliveryDate: '2026-11-18',
    fulfillment: { deliveryDate: '2026-11-18' },
  },
  {
    id: 'outside',
    createdAt: new Date(2026, 8, 1, 8, 0).toISOString(),
    deliveryDate: '2026-09-02',
    fulfillment: { deliveryDate: '2026-09-02' },
  },
  {
    id: 'created-at-iso-only',
    createdAtIso: new Date(2026, 10, 5, 18, 0).toISOString(),
  },
  {
    id: 'updated-at-only',
    updatedAt: new Date(2026, 10, 4, 12, 0).toISOString(),
  },
  {
    id: 'sunday-midnight-iso',
    createdAt: new Date(2026, 9, 20, 8, 0).toISOString(),
    deliveryDate: new Date(2026, 10, 1, 0, 30).toISOString(),
  },
  {
    id: 'timestamp-delivery-date',
    createdAt: new Date(2026, 8, 15, 8, 0).toISOString(),
    deliveryDate: timestamp(new Date(2026, 10, 5, 8, 0)),
  },
];

const readField = (order, fieldPath) => (
  fieldPath.split('.').reduce((current, key) => current?.[key], order)
);

const valueInIndexedRange = (value, stringRange) => {
  if (typeof value === 'string') {
    return value >= stringRange.start && value <= stringRange.end;
  }
  const date = value?.toDate ? value.toDate() : null;
  if (!date || Number.isNaN(date.getTime())) return false;
  return date >= start && date <= end;
};

const isIndexedCandidate = (order, stringRange) => (
  DELIVERY_WINDOW_INDEX_FIELDS.some((fieldPath) => (
    valueInIndexedRange(readField(order, fieldPath), stringRange)
  ))
);

const visibleIds = (orders) => orders
  .filter((order) => {
    const deliveryDate = getOrderDeliveryDate(order);
    return deliveryDate && deliveryDate >= start && deliveryDate <= end;
  })
  .map((order) => order.id)
  .sort();

describe('delivery window order queries', () => {
  const stringRange = buildIndexedStringRange(start, end);

  beforeEach(() => {
    collection.mockImplementation((dbRef, name) => ({ path: name, dbRef }));
    query.mockImplementation((ref, ...constraints) => ({ ref, constraints }));
    where.mockImplementation((field, op, value) => ({ field, op, value }));
  });

  test('keeps the same delivery-date result as a full scan', () => {
    const candidates = catalog.filter((order) => isIndexedCandidate(order, stringRange));

    expect(visibleIds(candidates)).toEqual(visibleIds(catalog));
    expect(visibleIds(catalog)).toEqual([
      'created-at-iso-only',
      'fulfillment-wins',
      'legacy-created-at',
      'legacy-timestamp',
      'placed-earlier',
      'sunday-midnight-iso',
      'timestamp-delivery-date',
      'updated-at-only',
    ]);
    expect(candidates.map((order) => order.id)).toContain('created-this-week-delivers-later');
    expect(candidates.map((order) => order.id)).not.toContain('outside');
    expect(stringRange.start <= '2026-11-04' && '2026-11-04' <= stringRange.end).toBe(true);
    expect(
      catalog.find((order) => order.id === 'placed-earlier').createdAt >= stringRange.start
      && catalog.find((order) => order.id === 'placed-earlier').createdAt <= stringRange.end
    ).toBe(false);
  });

  test('queries each indexed field as a string and as a timestamp, then dedupes', async () => {
    const shared = { id: 'order-1' };
    getDocs.mockResolvedValue({ docs: [shared] });

    const docs = await fetchDocsForDeliveryWindow('customerOrdersDelayed', start, end);

    expect(docs).toEqual([shared]);
    const calls = getDocs.mock.calls.map(([queryRef]) => queryRef);
    expect(calls).toHaveLength(DELIVERY_WINDOW_INDEX_FIELDS.length * 2);
    calls.forEach((queryRef) => {
      expect(queryRef.ref.path).toBe('customerOrdersDelayed');
      expect(queryRef.constraints.map((constraint) => constraint.op)).toEqual(['>=', '<=']);
    });

    DELIVERY_WINDOW_INDEX_FIELDS.forEach((fieldPath) => {
      const fieldCalls = calls.filter((queryRef) => (
        queryRef.constraints.every((constraint) => constraint.field === fieldPath)
      ));
      expect(fieldCalls).toHaveLength(2);
      expect(fieldCalls.some((queryRef) => typeof queryRef.constraints[0].value === 'string')).toBe(true);
      expect(fieldCalls.some((queryRef) => queryRef.constraints[0].value?.__timestamp)).toBe(true);
    });
  });

  test('does not query when the window has no date', async () => {
    await expect(fetchDocsForDeliveryWindow('customerOrders', null, null)).resolves.toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
  });
});
