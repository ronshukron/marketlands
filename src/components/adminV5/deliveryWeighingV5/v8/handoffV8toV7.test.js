/**
 * End-to-end handoff: pick a delivery item-by-item in V8, then open V7 on the
 * same realtime drafts and verify the picked orders are chargeable there.
 * Firestore / scale / printer are replaced by in-memory fakes; the V7 and V8
 * page components themselves are the real ones.
 *
 * CRA runs Jest with resetMocks, which wipes jest.fn implementations between
 * tests, so the fakes are plain functions that record calls in mockState.
 */
import React from 'react';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockState = {
  orders: [],
  drafts: {},
  draftListeners: new Set(),
  numbers: {},
  claims: {},
  calls: {},
};

function mockRecord(name, args) {
  if (!mockState.calls[name]) mockState.calls[name] = [];
  mockState.calls[name].push(args);
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

jest.mock('firebase/firestore', () => ({
  doc: (...parts) => ({ path: parts.slice(1).join('/'), id: parts[parts.length - 1] }),
  getDoc: async (ref) => ({
    exists: () => mockState.numbers[ref.id] != null,
    data: () => ({ number: mockState.numbers[ref.id] }),
  }),
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
  fetchProductDetailsV7: async () => ({}),
  removeDelayedOrderLineV7: async () => {},
  searchProductsV7: async () => [],
  setPackedCartonCountV7: async () => ({ packedCartonCount: 1 }),
  subscribeDelayedOrdersForWeekV7: (args) => {
    mockRecord('subscribeOrders', args);
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
  claimOrderV7: async (args) => { mockRecord('claim', args); },
  releaseOrderClaimV7: async () => {},
  upsertPresenceV7: async () => {},
  clearPresenceV7: async () => {},
  subscribePresenceV7: ({ onData }) => { onData([]); return () => {}; },
  subscribeClaimsV7: ({ onData }) => { onData(mockState.claims); return () => {}; },
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
  },
  clearDraftLineWeightV7: async (args) => {
    mockRecord('clearWeight', args);
    const draft = mockDraft(args.orderId);
    draft.weightsByLineId[args.lineId] = { actualQuantity: null, source: 'manual' };
    if (args.status) draft.status = args.status;
    mockPushDrafts();
  },
  setDraftLineRemovedV7: async (args) => {
    mockRecord('setRemoved', args);
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
  useBrotherLabelPrinter: () => ({ hasPrinterSupport: false, status: {}, isPrinting: false, printImage: async () => ({ ok: true }) }),
}));
jest.mock('../../../scale/ScaleConnectionPanel', () => () => null);
jest.mock('../../../printer/LabelPrinterPanel', () => () => null);
jest.mock('../../../admin/CustomerOrderDeliveryTransferControl', () => () => null);
jest.mock('../../../../services/customerProfileService', () => ({
  getCustomerKey: ({ phone, email }) => phone || email || '',
  getCustomerProfiles: async () => ({}),
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
jest.mock('../../../../utils/ql800LabelCanvas', () => ({ renderQl800Label: () => ({}) }));

// eslint-disable-next-line import/first
import DeliveryManagementV8 from '../DeliveryManagementV8';
// eslint-disable-next-line import/first
import DeliveryManagementV7 from '../DeliveryManagementV7';

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
  mockState.drafts = {};
  mockState.draftListeners = new Set();
  mockState.claims = {};
  mockState.calls = {};
  mockState.numbers = { '050-1': 11, '050-2': 12, '050-3': 13 };
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

function renderPage(Page, url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Page />
    </MemoryRouter>,
  );
}

async function openItem(name) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
  return screen.findByText('שים בארגז');
}

function weighPanel() {
  return screen.getByText('שים בארגז').parentElement; // eslint-disable-line testing-library/no-node-access
}

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('deliveryV7::lastSetup', JSON.stringify({ weekKey: WEEK, communities: [] }));
  seed();
});

test('V8 picks a delivery group item-by-item and V7 can charge the result', async () => {
  const view = renderPage(DeliveryManagementV8, '/admin/delivery-v8');

  // Step 1: box prep defaults to the first delivery group with unpicked orders (X + Y), not Z.
  expect(await screen.findByText('📦 הכינו ארגז עם מדבקה לכל הזמנה')).toBeInTheDocument();
  expect(screen.getByText('דנה')).toBeInTheDocument();
  expect(screen.getByText('יוסי')).toBeInTheDocument();
  expect(screen.queryByText('רונית')).toBeNull();

  // V8 must not claim orders while in box/item views (other stations keep working).
  expect(calls('claim')).toHaveLength(0);

  // Step 2: item view. Z's cucumber is out of scope.
  fireEvent.click(screen.getByRole('tab', { name: /ליקוט לפי פריט/ }));
  expect(await screen.findByRole('button', { name: /עגבניה/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /מלפפון/ })).toBeNull();

  // Tomato: box of דנה first (X, lower customer number), then יוסי.
  await openItem('עגבניה');
  expect(within(weighPanel()).getByText('דנה')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'לפי ההזמנה' }));
  await waitFor(() => expect(calls('setWeight')).toHaveLength(1));
  expect(lastCall('setWeight')).toEqual(expect.objectContaining({
    weekKey: WEEK,
    orderId: 'o1',
    lineId: line('o1', 'tom', 's0'),
    actualQuantity: 1.5,
    source: 'ordered_default',
    status: 'in_progress',
  }));

  // Auto-advanced to the next box.
  await waitFor(() => expect(within(weighPanel()).getByText('יוסי')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'לפי ההזמנה' }));
  await waitFor(() => expect(calls('setWeight')).toHaveLength(2));
  expect(lastCall('setWeight')).toEqual(expect.objectContaining({
    orderId: 'o2', actualQuantity: 2, source: 'ordered_default', status: 'in_progress',
  }));
  expect(await screen.findByText('✓ הפריט הושלם בכל הארגזים')).toBeInTheDocument();

  // Lettuce (unit) is out of stock for יוסי -> marking missing completes o2.
  await openItem('חסה');
  fireEvent.click(screen.getByRole('button', { name: 'חסר במלאי' }));
  fireEvent.click(await screen.findByRole('button', { name: /אישור/ }));
  await waitFor(() => expect(lastCall('setRemoved')).toEqual(expect.objectContaining({
    orderId: 'o2', lineId: line('o2', 'let', 's1'), removed: true,
  })));
  await waitFor(() => expect(lastCall('saveDraft')).toEqual(expect.objectContaining({
    orderId: 'o2', draftPatch: { status: 'weighed' },
  })));

  // Eggs (package): one-tap confirm completes o1.
  await openItem('ביצים');
  fireEvent.click(screen.getByRole('button', { name: 'אשר 2 מארז' }));
  await waitFor(() => expect(lastCall('setWeight')).toEqual(expect.objectContaining({
    orderId: 'o1', lineId: line('o1', 'egg', 's1'), actualQuantity: 2, source: 'package', status: 'weighed',
  })));

  // Whole group shows as picked. The item list stays on screen.
  expect(await screen.findByText('3/3 פריטים הושלמו')).toBeInTheDocument();
  expect(mockState.drafts.o1.status).toBe('weighed');
  expect(mockState.drafts.o2.status).toBe('weighed');
  expect(mockState.drafts.o3).toBeUndefined();

  view.unmount();

  // ---- Transition to V7 for charging, same browser, same drafts ----
  renderPage(DeliveryManagementV7, '/admin/delivery-v7');
  const completeButton = await screen.findByRole('button', { name: 'השלם + חיוב' });

  const expectChargeable = async (customerName, enabled) => {
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(customerName) })[0]);
    await waitFor(() => {
      const header = screen.getAllByText(customerName).find((el) => el.className.includes('text-lg'));
      expect(header).toBeTruthy();
    });
    await waitFor(() => expect(completeButton.disabled).toBe(!enabled));
  };

  await expectChargeable('דנה', true);
  await expectChargeable('יוסי', true);
  // Z was never picked -> V7 must not allow charging it.
  await expectChargeable('רונית', false);
}, 30000);

test('V8 loads the same delivery setup V7 last used (and vice versa)', async () => {
  localStorage.setItem('deliveryV7::lastSetup', JSON.stringify({ weekKey: WEEK, communities: ['X'], startDate: '', endDate: '' }));
  const v8 = renderPage(DeliveryManagementV8, '/admin/delivery-v8');
  await waitFor(() => expect(lastCall('subscribeOrders')).toEqual(expect.objectContaining({
    weekKey: WEEK,
    communities: ['X'],
  })));
  v8.unmount();

  localStorage.setItem('deliveryV7::lastSetup', JSON.stringify({
    weekKey: WEEK, communities: ['Y', 'Z'], startDate: '2026-09-30', endDate: '2026-09-30',
  }));
  mockState.calls = {};
  renderPage(DeliveryManagementV7, '/admin/delivery-v7');
  await waitFor(() => expect(lastCall('subscribeOrders')).toEqual(expect.objectContaining({
    weekKey: WEEK,
    communities: ['Y', 'Z'],
    startDate: '2026-09-30',
    endDate: '2026-09-30',
  })));
});

test('V8 respects an order that another station claimed in V7', async () => {
  mockState.claims = { o1: { sessionId: 'other-session', stationId: 'station-2', userName: 'עובד אחר' } };
  renderPage(DeliveryManagementV8, '/admin/delivery-v8');
  fireEvent.click(await screen.findByRole('tab', { name: /ליקוט לפי פריט/ }));
  await openItem('עגבניה');
  expect(screen.getByText(/פתוח בתחנה אחרת: עובד אחר/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'חסר במלאי' })).toBeDisabled();
  expect(calls('setWeight')).toHaveLength(0);
});
