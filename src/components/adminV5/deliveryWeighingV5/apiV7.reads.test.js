jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn((db, name) => ({ path: name })),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  query: jest.fn((ref, ...constraints) => ({ ref, constraints })),
  runTransaction: jest.fn(),
  updateDoc: jest.fn(),
  where: jest.fn((field, op, value) => ({ field, op, value })),
}));
jest.mock('../../../firebase/firebase', () => ({ db: {} }));
jest.mock('../../../utils/functionsClient', () => ({
  __esModule: true,
  functionsEndpoint: jest.fn((name) => `https://example.test/${name}`),
}));

import { getDocs, onSnapshot, where } from 'firebase/firestore';
import {
  fetchAvailableDeliveryWeeksV7,
  searchProductsV7,
  subscribeDelayedOrdersForWeekV7,
} from './apiV7';

const productDoc = (id, data) => ({ id, data: () => data });

describe('delivery week list', () => {
  test('is generated locally and does not scan delayed orders', async () => {
    const weeks = await fetchAvailableDeliveryWeeksV7();
    expect(getDocs).not.toHaveBeenCalled();
    expect(weeks).toHaveLength(25);
    expect(weeks[0] > weeks[1]).toBe(true);
    weeks.forEach((week) => expect(week).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });
});

describe('product search cache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-05T10:00:00.000Z'));
    const { collection } = require('firebase/firestore');
    collection.mockImplementation((db, name) => ({ path: name }));
    getDocs.mockReset();
    getDocs.mockResolvedValue({
      docs: [
        productDoc('p1', { name: 'שמיר', thaiName: 'dill', catalogNumber: 670, businessName: 'הבסטה' }),
        productDoc('p2', { name: 'תרד', independentFarmer: true, businessName: 'עצמאי' }),
        productDoc('p3', { name: 'ביצים', catalogNumber: '382', businessName: 'משק בסון' }),
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('loads products once, hides independent farmers, filters, and limits', async () => {
    await expect(searchProductsV7({ term: 'שמ', limit: 1 })).resolves.toEqual([
      expect.objectContaining({ id: 'p1', name: 'שמיר' }),
    ]);
    await searchProductsV7({ term: '382', limit: 12 });
    expect(getDocs).toHaveBeenCalledTimes(1);

    const eggs = await searchProductsV7({ term: 'בסון', limit: 12 });
    expect(eggs.map((product) => product.id)).toEqual(['p3']);
    expect(eggs.some((product) => product.independentFarmer)).toBe(false);
  });

  test('reloads after the cache expires', async () => {
    jest.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
    await searchProductsV7({ term: '', limit: 20 });
    const callsAfterLoad = getDocs.mock.calls.length;
    jest.setSystemTime(new Date('2027-01-01T00:11:00.000Z'));
    await searchProductsV7({ term: '', limit: 20 });
    expect(getDocs).toHaveBeenCalledTimes(callsAfterLoad + 1);
  });
});

describe('delayed order subscription', () => {
  beforeEach(() => {
    const { collection, query } = require('firebase/firestore');
    collection.mockImplementation((db, name) => ({ path: name }));
    query.mockImplementation((ref, ...constraints) => ({ ref, constraints }));
    where.mockImplementation((field, op, value) => ({ field, op, value }));
    onSnapshot.mockReset();
    onSnapshot.mockImplementation((watched, onNext) => {
      onNext({ forEach: () => {} });
      return jest.fn();
    });
  });

  test('does nothing when no week and no dates are selected', () => {
    const unsubscribe = subscribeDelayedOrdersForWeekV7({ onOrders: jest.fn() });
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(unsubscribe()).toBeUndefined();
  });

  test('a selected week listens only to that week key', () => {
    subscribeDelayedOrdersForWeekV7({ weekKey: '2026-11-08', onOrders: jest.fn() });
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledWith('deliveryWeekKey', '==', '2026-11-08');
  });

  test('a date range listens to its week keys and createdAt, not the whole collection', () => {
    const onOrders = jest.fn();
    const unsubscribe = subscribeDelayedOrdersForWeekV7({
      startDate: '2026-11-11',
      endDate: '2026-11-12',
      onOrders,
    });

    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(where).toHaveBeenCalledWith('deliveryWeekKey', 'in', ['2026-11-08']);
    expect(where).toHaveBeenCalledWith('createdAt', '>=', expect.any(String));
    expect(where).toHaveBeenCalledWith('createdAt', '<=', expect.any(String));
    expect(onSnapshot.mock.calls.every(([watched]) => Array.isArray(watched.constraints))).toBe(true);
    expect(onOrders).toHaveBeenCalledWith({ pendingOrders: [], completedOrders: [], allOrders: [] });

    unsubscribe();
    onSnapshot.mock.results.forEach((result) => expect(result.value).toHaveBeenCalled());
  });

  describe('early-pick communities', () => {
    const orderDoc = (id, community, deliveryDate) => ({
      id,
      data: () => ({
        isDelayedOrder: true,
        paymentStatus: 'held',
        delayedOrderStatus: 'pending_weighing',
        deliveryDate,
        customerDetails: { name: id, pickupSpot: community },
        orderBreakdown: {
          b1: { businessName: 'Farm', items: [{ productId: 'p1', productName: 'Tomato', quantity: 1, price: 10 }] },
        },
      }),
    });
    const docs = [
      orderDoc('tue', 'A', '2026-11-10'),
      orderDoc('thu-k', 'K', '2026-11-12'),
      orderDoc('thu-m', 'M', '2026-11-12'),
    ];
    const subscribeTuesday = (earlyPickEntries) => {
      require('firebase/firestore').updateDoc.mockResolvedValue();
      onSnapshot.mockImplementation((watched, onNext) => {
        onNext({ forEach: (callback) => docs.forEach(callback) });
        return jest.fn();
      });
      const onOrders = jest.fn();
      subscribeDelayedOrdersForWeekV7({
        weekKey: '2026-11-08',
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        earlyPickEntries,
        onOrders,
      });
      return onOrders.mock.calls[0][0].allOrders;
    };

    test('without entries only the selected day is returned', () => {
      expect(subscribeTuesday(undefined).map((order) => order.id)).toEqual(['tue']);
    });

    test('pulled-in communities are kept and tagged, delivery date unchanged', () => {
      const orders = subscribeTuesday([
        { community: 'K', originalDeliveryDate: '2026-11-12', procureOnDate: '2026-11-10' },
      ]);
      expect(orders.map((order) => order.id).sort()).toEqual(['thu-k', 'tue']);
      const early = orders.find((order) => order.id === 'thu-k');
      expect(early.earlyPick).toEqual({ originalDeliveryDate: '2026-11-12', procureOnDate: '2026-11-10' });
      expect(early.deliveryDateKey).toBe('2026-11-12');
      expect(orders.find((order) => order.id === 'tue').earlyPick).toBeUndefined();
      expect(where).toHaveBeenCalledWith('deliveryWeekKey', '==', '2026-11-08');
    });

    test('an entry from the next week widens the week query', () => {
      subscribeTuesday([
        { community: 'S', originalDeliveryDate: '2026-11-15', procureOnDate: '2026-11-12' },
      ]);
      expect(where).toHaveBeenCalledWith('deliveryWeekKey', 'in', ['2026-11-08', '2026-11-15']);
    });
  });
});
