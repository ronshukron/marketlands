const mockFirestore = { getDocsCalls: 0, release: null };

jest.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ name }),
  doc: () => ({}),
  getDoc: async () => ({ exists: () => false }),
  setDoc: async () => {},
  getDocs: async ({ name }) => {
    mockFirestore.getDocsCalls += 1;
    if (mockFirestore.release) await mockFirestore.release;
    const docs = name === 'customerOrdersDelayed'
      ? [{ data: () => ({ delayedOrderStatus: 'settled', customerDetails: { phone: '050-1' }, createdAt: '2026-10-01' }) }]
      : [{ data: () => ({ paymentStatus: 'completed', customerDetails: { phone: '050-1' }, createdAt: '2026-09-01' }) }];
    return { docs };
  },
}));
jest.mock('../firebase/firebase', () => ({ db: {} }));

// eslint-disable-next-line import/first
import { invalidateCustomerHistoryCache, loadCustomerHistoryStats } from './customerHistoryService';

beforeEach(() => {
  mockFirestore.getDocsCalls = 0;
  mockFirestore.release = null;
  invalidateCustomerHistoryCache();
});

test('a burst of calls while the cache is empty runs one scan, not one per call', async () => {
  let open;
  mockFirestore.release = new Promise((resolve) => { open = resolve; });
  const calls = Array.from({ length: 10 }, () => loadCustomerHistoryStats());
  open();
  const results = await Promise.all(calls);
  expect(mockFirestore.getDocsCalls).toBe(2);
  results.forEach((stats) => expect(stats['050-1'].completedCount).toBe(2));
});

test('cached stats are reused, and force starts a fresh scan', async () => {
  await loadCustomerHistoryStats();
  await loadCustomerHistoryStats();
  expect(mockFirestore.getDocsCalls).toBe(2);
  await loadCustomerHistoryStats({ force: true });
  expect(mockFirestore.getDocsCalls).toBe(4);
});
