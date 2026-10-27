/**
 * Reliability checks for the real V8 page on a busy picking day: slow network,
 * many order updates, label printing, failures and messy order data.
 * Firestore / scale / printer are in-memory fakes (same approach as
 * handoffV8toV7.test.js). CRA resets jest.fn mocks between tests, so the fakes
 * are plain functions that record calls in mockState.
 */
import React from 'react';
import {
  act, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockState = {};

function mockRecord(name, args) {
  if (!mockState.calls[name]) mockState.calls[name] = [];
  mockState.calls[name].push(args);
}

function mockDeferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

function mockPushDrafts() {
  const snapshot = JSON.parse(JSON.stringify(mockState.drafts));
  mockState.draftListeners.forEach((listener) => listener(snapshot));
}

function mockDraft(orderId) {
  if (!mockState.drafts[orderId]) {
    mockState.drafts[orderId] = { orderId, weightsByLineId: {}, removedLineIds: {} };
  }
  return mockState.drafts[orderId];
}

// Firestore applies a write to local listeners immediately and resolves the
// promise only when the server confirms; holdWrites simulates a slow server.
async function mockServerAck() {
  if (!mockState.holdWrites) return;
  const gate = mockDeferred();
  mockState.heldWrites.push(gate);
  await gate.promise;
}

jest.mock('firebase/firestore', () => ({
  doc: (...parts) => ({ path: parts.slice(1).join('/'), id: parts[parts.length - 1] }),
  getDoc: async (ref) => {
    mockRecord('getDoc', ref.path);
    return {
      exists: () => ref.path.startsWith('customerNumbers/') && mockState.numbers[ref.id] != null,
      data: () => ({ number: mockState.numbers[ref.id] }),
    };
  },
  runTransaction: async () => {},
  collection: () => ({}),
  getDocs: async () => ({ docs: [] }),
  writeBatch: () => ({ set: () => {}, commit: async () => {} }),
}));
jest.mock('../../../../firebase/firebase', () => ({ db: {} }));
jest.mock('../../../../contexts/authContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'rfHOLhNoJOW8ByNypCtm3hlSNKs2', displayName: 'Tester' }, userRole: 'admin' }),
}));
jest.mock('sweetalert2', () => ({ fire: async () => ({ isConfirmed: false }) }));

jest.mock('../../../../services/pickupSpotsService', () => {
  const snapshot = {
    pickupSpots: ['X', 'Y', 'Z'],
    pickupSpotsData: {
      X: { deliveryGroup: 'משלוח ראשון' },
      Y: { deliveryGroup: 'משלוח ראשון' },
      Z: { deliveryGroup: '' },
    },
  };
  return {
    getPickupSpotsSync: () => snapshot,
    subscribePickupSpots: (cb) => { cb(snapshot); return () => {}; },
    resolveCommunityName: (name) => name,
    getCommunityColor: () => '#336699',
    getCommunityCode: (name) => (name ? `code-${name}` : ''),
  };
});

jest.mock('../apiV7', () => ({
  addItemToDelayedOrderV7: async () => {},
  fetchAvailableDeliveryWeeksV7: async () => ['2026-09-27'],
  fetchProductDetailsV7: async (ids) => {
    mockRecord('fetchProducts', ids);
    if (mockState.holdNextProductFetch) {
      mockState.holdNextProductFetch = false;
      mockState.heldProductFetch = mockDeferred();
      await mockState.heldProductFetch.promise;
    }
    return {};
  },
  removeDelayedOrderLineV7: async () => {},
  searchProductsV7: async () => [],
  setPackedCartonCountV7: async (args) => {
    mockRecord('packed', args);
    return { packedCartonCount: args.printedIndex };
  },
  subscribeDelayedOrdersForWeekV7: (args) => {
    mockRecord('subscribeOrders', args);
    mockState.onOrders = args.onOrders;
    Promise.resolve().then(() => args.onOrders({ allOrders: mockState.orders }));
    return () => {};
  },
  updateDelayedOrderLineV7: async () => {},
  handleSuspendedPaymentV7: async () => {},
  prepareCommunityDiscountForSettlementV7: async () => {},
  prepareCommunityWeeklyPromotionForSettlementV7: async () => {},
  fetchWeeklyPromotionsForWeekV7: async () => [],
  fetchWeeklyPromotionUnlocksV7: async () => ({}),
}));

jest.mock('../realtimeStateV7', () => ({
  buildSessionIdV7: ({ userId, stationId }) => `${userId}::${stationId}`,
  getOrCreateStationIdV7: () => 'station-test',
  isClaimStaleV7: () => false,
  claimOrderV7: async () => {},
  releaseOrderClaimV7: async () => {},
  upsertPresenceV7: async () => {},
  clearPresenceV7: async () => {},
  subscribePresenceV7: ({ onData }) => { onData([]); return () => {}; },
  subscribeClaimsV7: ({ onData }) => { onData({}); return () => {}; },
  subscribeDraftsV7: ({ onData }) => {
    mockState.draftListeners.add(onData);
    onData(JSON.parse(JSON.stringify(mockState.drafts)));
    return () => mockState.draftListeners.delete(onData);
  },
  setDraftLineWeightV7: async (args) => {
    mockRecord('setWeight', args);
    const draft = mockDraft(args.orderId);
    draft.weightsByLineId[args.lineId] = { actualQuantity: args.actualQuantity, source: args.source };
    if (args.status) draft.status = args.status;
    mockPushDrafts();
    await mockServerAck();
  },
  clearDraftLineWeightV7: async (args) => {
    mockRecord('clearWeight', args);
    if (mockState.failReset) throw new Error('boom-reset');
    const draft = mockDraft(args.orderId);
    draft.weightsByLineId[args.lineId] = { actualQuantity: null, source: 'manual' };
    if (args.status) draft.status = args.status;
    mockPushDrafts();
  },
  setDraftLineRemovedV7: async (args) => {
    mockRecord('setRemoved', args);
    if (mockState.failRestore && !args.removed) throw new Error('boom-restore');
    const draft = mockDraft(args.orderId);
    if (args.removed) draft.removedLineIds[args.lineId] = true;
    else delete draft.removedLineIds[args.lineId];
    mockPushDrafts();
  },
  saveOrderDraftV7: async (args) => {
    mockRecord('saveDraft', args);
    Object.assign(mockDraft(args.orderId), args.draftPatch);
    mockPushDrafts();
  },
  bulkSetDraftWeightsV7: async () => {},
  buildStationAuditV7: () => ({}),
  clearOrderDraftV7: async () => {},
}));

jest.mock('../v7/chargeRefundAlertV7', () => ({
  ...jest.requireActual('../v7/chargeRefundAlertV7'),
  fetchOpenRefundsForChargeV7: async () => [],
}));
jest.mock('../../../../hooks/useWeightScale', () => ({
  useWeightScale: () => ({ isElectron: false, isConnected: false, weight: null, lastStableWeight: null }),
}));
jest.mock('../../../../hooks/useBrotherLabelPrinter', () => ({
  useBrotherLabelPrinter: () => ({
    hasPrinterSupport: mockState.printerSupport,
    status: {},
    isPrinting: false,
    printImage: async (image) => {
      mockRecord('print', image);
      return mockState.printResult;
    },
  }),
}));
jest.mock('../../../scale/ScaleConnectionPanel', () => () => null);
jest.mock('../../../printer/LabelPrinterPanel', () => () => null);
jest.mock('../../../admin/CustomerOrderDeliveryTransferControl', () => () => null);
jest.mock('../../../../services/customerProfileService', () => ({
  getCustomerKey: ({ phone, email }) => phone || email || '',
  getCustomerProfiles: async (keys) => {
    mockRecord('profiles', keys);
    return {};
  },
}));
jest.mock('../../../../services/customerHistoryService', () => ({
  classifyCustomer: () => ({ isNew: false, isLapsed: false }),
  loadCustomerHistoryStats: async () => ({}),
}));
jest.mock('../../../../services/communityDiscountService', () => ({
  getDisplayDiscountInfo: async () => null,
  getDiscountConfig: async () => ({}),
  subscribeDisplayDiscountInfo: ({ onValue }) => { onValue(null); return () => {}; },
}));
jest.mock('../../../../utils/ql800LabelCanvas', () => ({ renderQl800Label: (label) => ({ label }) }));

// eslint-disable-next-line import/first
import DeliveryManagementV8 from '../DeliveryManagementV8';

const WEEK = '2026-09-27';
const line = (orderId, productId, seed) => `${orderId}::${productId}::biz1::::${seed}`;
const calls = (name) => mockState.calls[name] || [];
const lastCall = (name) => calls(name)[calls(name).length - 1];

function makeOrder({ id, name, phone, community, items }) {
  const order = {
    id,
    status: 'pending',
    pickupSpot: community,
    customerDetails: { name, phone, pickupSpot: community },
    items: items.map((item) => ({ businessName: 'משק', businessId: 'biz1', price: 10, ...item })),
  };
  order.rawData = { ...order };
  return order;
}

function seed() {
  Object.assign(mockState, {
    drafts: {},
    draftListeners: new Set(),
    calls: {},
    numbers: { '050-1': 11, '050-2': 12, '050-3': 13 },
    holdWrites: false,
    heldWrites: [],
    holdNextProductFetch: false,
    heldProductFetch: null,
    failRestore: false,
    failReset: false,
    printerSupport: false,
    printResult: { ok: true },
    onOrders: null,
  });
  mockState.orders = [
    makeOrder({
      id: 'o1',
      name: 'דנה',
      phone: '050-1',
      community: 'X',
      items: [
        { lineId: line('o1', 'tom', 's0'), productId: 'tom', productName: 'עגבניה', requestedQuantity: 1.5, measurementType: 'kg' },
        { lineId: line('o1', 'egg', 's1'), productId: 'egg', productName: 'ביצים', requestedQuantity: 2, measurementType: 'package' },
      ],
    }),
    makeOrder({
      id: 'o2',
      name: 'יוסי',
      phone: '050-2',
      community: 'Y',
      items: [
        { lineId: line('o2', 'tom', 's0'), productId: 'tom', productName: 'עגבניה', requestedQuantity: 2, measurementType: 'kg' },
        { lineId: line('o2', 'let', 's1'), productId: 'let', productName: 'חסה', requestedQuantity: 1, measurementType: 'unit', averageWeightKg: 0.4 },
      ],
    }),
    makeOrder({
      id: 'o3',
      name: 'רונית',
      phone: '050-3',
      community: 'Z',
      items: [
        { lineId: line('o3', 'cuc', 's0'), productId: 'cuc', productName: 'מלפפון', requestedQuantity: 1, measurementType: 'kg' },
      ],
    }),
  ];
}

function renderV8() {
  return render(
    <MemoryRouter initialEntries={['/admin/delivery-v8']}>
      <DeliveryManagementV8 />
    </MemoryRouter>,
  );
}

async function goToItems() {
  fireEvent.click(await screen.findByRole('tab', { name: /ליקוט לפי פריט/ }));
}

async function openItem(name) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
  return screen.findByText('שים בארגז');
}

async function releaseAllWrites() {
  mockState.holdWrites = false;
  await act(async () => {
    mockState.heldWrites.splice(0).forEach((gate) => gate.resolve());
  });
}

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('deliveryV7::lastSetup', JSON.stringify({ weekKey: WEEK, communities: [] }));
  seed();
});

test('slow network: a save confirmed late does not hide a newer save', async () => {
  renderV8();
  await goToItems();
  await openItem('עגבניה');

  mockState.holdWrites = true;
  // Box of דנה: saved locally, server has not confirmed yet.
  fireEvent.click(screen.getByRole('button', { name: 'לפי ההזמנה' }));
  await waitFor(() => expect(calls('setWeight')).toHaveLength(1));

  // Worker does not wait: taps יוסי's box and confirms it too.
  fireEvent.click(screen.getByRole('button', { name: /יוסי/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'לפי ההזמנה' }));
  await waitFor(() => expect(calls('setWeight')).toHaveLength(2));
  expect(lastCall('setWeight')).toEqual(expect.objectContaining({ orderId: 'o2', actualQuantity: 2 }));

  // דנה's save is confirmed first. יוסי's box must stay picked and still count as unsynced.
  await act(async () => { mockState.heldWrites[0].resolve(); });
  await waitFor(() => expect(screen.getByRole('button', { name: /עגבניה/ })).toHaveTextContent('2/2'));
  expect(screen.getByText(/יש 1 שינויים שממתינים לסנכרון/)).toBeInTheDocument();

  await releaseAllWrites();
  await waitFor(() => expect(screen.queryByText(/שממתינים לסנכרון/)).toBeNull());
  expect(screen.getByRole('button', { name: /עגבניה/ })).toHaveTextContent('2/2');
  expect(mockState.drafts.o1.weightsByLineId[line('o1', 'tom', 's0')].actualQuantity).toBe(1.5);
  expect(mockState.drafts.o2.weightsByLineId[line('o2', 'tom', 's0')].actualQuantity).toBe(2);
});

test('order updates (e.g. every label print) do not re-read every customer number', async () => {
  renderV8();
  expect(await screen.findByText('דנה')).toBeInTheDocument();
  const numberReads = () => calls('getDoc').filter((path) => path.startsWith('customerNumbers/')).length;
  await waitFor(() => expect(numberReads()).toBeGreaterThanOrEqual(3));
  const profileLoads = calls('profiles').length;
  const before = numberReads();

  await act(async () => {
    await mockState.onOrders({ allOrders: mockState.orders.map((order) => ({ ...order, packedCartonCount: 1 })) });
  });
  expect(numberReads()).toBe(before);
  expect(calls('profiles')).toHaveLength(profileLoads);

  // A new customer is still read (once) and shown.
  mockState.numbers['050-4'] = 14;
  const newcomer = makeOrder({
    id: 'o4',
    name: 'מיכל',
    phone: '050-4',
    community: 'X',
    items: [{ lineId: line('o4', 'tom', 's0'), productId: 'tom', productName: 'עגבניה', requestedQuantity: 1, measurementType: 'kg' }],
  });
  await act(async () => {
    await mockState.onOrders({ allOrders: [...mockState.orders, newcomer] });
  });
  expect(numberReads()).toBe(before + 1);
  expect(await screen.findByText('מיכל')).toBeInTheDocument();
  expect(screen.getAllByText('14').length).toBeGreaterThan(0);
});

test('an older orders snapshot that finishes late does not overwrite a newer one', async () => {
  renderV8();
  expect(await screen.findByText('דנה')).toBeInTheDocument();
  const renamed = (name) => mockState.orders.map((order) => (
    order.id === 'o1' ? { ...order, customerDetails: { ...order.customerDetails, name } } : order
  ));

  mockState.holdNextProductFetch = true;
  let older;
  act(() => {
    older = mockState.onOrders({ allOrders: renamed('דנה ישן') });
  });
  await act(async () => {
    await mockState.onOrders({ allOrders: renamed('דנה חדש') });
  });
  expect(await screen.findByText('דנה חדש')).toBeInTheDocument();

  await act(async () => {
    mockState.heldProductFetch.resolve();
    await older;
  });
  expect(screen.getByText('דנה חדש')).toBeInTheDocument();
  expect(screen.queryByText('דנה ישן')).toBeNull();
});

test('a failed restore or reset tells the worker instead of doing nothing', async () => {
  renderV8();
  await goToItems();
  await openItem('עגבניה');

  fireEvent.click(screen.getByRole('button', { name: 'חסר במלאי' }));
  fireEvent.click(await screen.findByRole('button', { name: /אישור/ }));
  await waitFor(() => expect(lastCall('setRemoved')).toEqual(expect.objectContaining({ orderId: 'o1', removed: true })));

  fireEvent.click(await screen.findByRole('button', { name: /דנה/ }));
  mockState.failRestore = true;
  fireEvent.click(await screen.findByRole('button', { name: 'החזר' }));
  expect((await screen.findAllByText('boom-restore')).length).toBeGreaterThan(0);
  // Busy flag is cleared before the error dialog, so the worker can retry
  // immediately and is not stuck behind a disabled button.
  expect(screen.getByRole('button', { name: 'החזר' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: /אישור/ }));
  await waitFor(() => expect(screen.queryByText('boom-restore')).toBeNull());
  // Still marked missing (nothing half-applied) and usable again.
  await waitFor(() => expect(screen.getByRole('button', { name: 'החזר' })).toBeEnabled());

  mockState.failRestore = false;
  fireEvent.click(screen.getByRole('button', { name: 'החזר' }));
  await waitFor(() => expect(lastCall('setRemoved')).toEqual(expect.objectContaining({ orderId: 'o1', removed: false })));

  // Weigh it, then make the reset fail. Wait until restore has released the busy flag.
  const useOrdered = await screen.findByRole('button', { name: 'לפי ההזמנה' });
  await waitFor(() => expect(useOrdered).toBeEnabled());
  fireEvent.click(useOrdered);
  await waitFor(() => expect(lastCall('setWeight')).toEqual(expect.objectContaining({ orderId: 'o1' })));
  fireEvent.click(await screen.findByRole('button', { name: /דנה/ }));
  mockState.failReset = true;
  fireEvent.click(await screen.findByRole('button', { name: 'אפס' }));
  expect((await screen.findAllByText('boom-reset')).length).toBeGreaterThan(0);
});

test('"print missing labels" prints each box once and stores the carton count', async () => {
  mockState.printerSupport = true;
  renderV8();
  fireEvent.click(await screen.findByRole('button', { name: /הדפס מדבקות חסרות \(2\)/ }));
  await waitFor(() => expect(calls('packed')).toHaveLength(2));
  expect(calls('print')).toHaveLength(2);
  expect(calls('print').map((image) => image.label.customerNumber)).toEqual([11, 12]);
  expect(calls('packed').map((entry) => entry.orderId)).toEqual(['o1', 'o2']);
  expect(await screen.findByRole('button', { name: /הדפס מדבקות חסרות \(0\)/ })).toBeDisabled();
  expect(screen.getAllByText(/הודפסו 1/)).toHaveLength(2);
});

test('"print missing labels" stops at the first printer error', async () => {
  mockState.printerSupport = true;
  mockState.printResult = { ok: false, code: 'PAPER', message: 'out of labels' };
  renderV8();
  fireEvent.click(await screen.findByRole('button', { name: /הדפס מדבקות חסרות \(2\)/ }));
  await waitFor(() => expect(calls('print')).toHaveLength(1));
  await waitFor(() => expect(screen.getByRole('button', { name: /הדפס מדבקות חסרות \(2\)/ })).toBeEnabled());
  expect(calls('packed')).toHaveLength(0);
});

test('an empty or non-numeric weight is ignored and the box stays pending', async () => {
  renderV8();
  await goToItems();
  await openItem('עגבניה');
  const input = screen.getByPlaceholderText('1.500');
  fireEvent.change(input, { target: { value: 'abc' } });
  fireEvent.click(screen.getByRole('button', { name: 'שמור' }));
  fireEvent.change(input, { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'שמור' }));
  fireEvent.change(input, { target: { value: '-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'שמור' }));
  await act(async () => {});
  expect(calls('setWeight')).toHaveLength(0);
  expect(screen.getByRole('button', { name: /עגבניה/ })).toHaveTextContent('0/2');
});

test('a second tap on the same box while the first save is in flight is ignored', async () => {
  renderV8();
  await goToItems();
  await openItem('עגבניה');
  mockState.holdWrites = true;
  const useOrdered = screen.getByRole('button', { name: 'לפי ההזמנה' });
  fireEvent.click(useOrdered);
  fireEvent.click(useOrdered);
  await waitFor(() => expect(calls('setWeight')).toHaveLength(1));
  await releaseAllWrites();
  await waitFor(() => expect(screen.queryByText(/שממתינים לסנכרון/)).toBeNull());
  expect(calls('setWeight')).toHaveLength(1);
});

test('messy order data does not crash any of the three V8 steps', async () => {
  mockState.orders = [
    {
      id: 'o5',
      status: 'pending',
      pickupSpot: 'X',
      customerDetails: { pickupSpot: 'X' },
      items: [
        { lineId: line('o5', 'tom', 's0'), productId: 'tom', productName: 'עגבניה' },
        { productName: 'שורה בלי מזהה', requestedQuantity: 1 },
        { lineId: line('o5', 'mys', 's1'), requestedQuantity: '2', measurementType: 'unit' },
        { lineId: line('o5', 'pkg', 's2'), productId: 'pkg', productName: 'גבינה', requestedQuantity: 'x', measurementType: 'package' },
      ],
      rawData: {},
    },
    {
      id: 'o6',
      status: 'pending',
      customerDetails: { name: 'בלי יישוב' },
      items: [{ lineId: line('o6', 'tom', 's0'), productId: 'tom', requestedQuantity: 1 }],
      rawData: {},
    },
    ...mockState.orders,
  ];
  renderV8();
  expect(await screen.findByText('דנה')).toBeInTheDocument();

  await goToItems();
  await openItem('עגבניה');
  fireEvent.click(screen.getByRole('button', { name: /גבינה/ }));
  expect(await screen.findByText('שים בארגז')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /לפי שם/ }));
  fireEvent.click(screen.getByRole('button', { name: /הכי מוזמן/ }));

  fireEvent.click(screen.getByRole('tab', { name: /הזמנות וחיוב/ }));
  expect(await screen.findAllByText(/דנה/)).not.toHaveLength(0);
  fireEvent.click(screen.getByRole('tab', { name: /הכנת ארגזים/ }));
  expect(await screen.findByText('📦 הכינו ארגז עם מדבקה לכל הזמנה')).toBeInTheDocument();
});
