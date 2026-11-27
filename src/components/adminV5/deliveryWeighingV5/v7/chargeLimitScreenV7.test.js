/**
 * Item E on the real V7 and V8 pages: the card-hold maximum is shown before
 * and during weighing, and an over-limit order is charged at exactly the hold
 * after one confirmation. Firestore, scale and printer are in-memory fakes
 * (same approach as v8/handoffV8toV7.test.js). CRA resets jest.fn mocks
 * between tests, so the fakes are plain functions recording into mockState.
 */
import React from 'react';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockState = {};

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
  const snapshot = { pickupSpots: ['X'], pickupSpotsData: { X: { deliveryGroup: '' } } };
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
    Promise.resolve().then(() => args.onOrders({ allOrders: mockState.orders }));
    return () => {};
  },
  updateDelayedOrderLineV7: async () => {},
  handleSuspendedPaymentV7: async (args) => {
    mockRecord('settle', args);
    const error = mockState.settleErrors.shift();
    if (error) throw error;
    return { status: 1 };
  },
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
    const draft = mockDraft(args.orderId);
    draft.weightsByLineId[args.lineId] = { actualQuantity: args.actualQuantity, source: args.source };
    mockPushDrafts();
  },
  clearDraftLineWeightV7: async () => {},
  setDraftLineRemovedV7: async () => {},
  saveOrderDraftV7: async (args) => {
    Object.assign(mockDraft(args.orderId), args.draftPatch);
    mockPushDrafts();
  },
  bulkSetDraftWeightsV7: async () => {},
  buildStationAuditV7: () => ({}),
  clearOrderDraftV7: async () => {},
}));
jest.mock('./chargeRefundAlertV7', () => ({
  ...jest.requireActual('./chargeRefundAlertV7'),
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
  customerHistoryFromProfiles: () => ({}),
}));
jest.mock('../../../../services/communityDiscountService', () => ({
  getDisplayDiscountInfo: async () => null,
  getDiscountConfig: async () => ({}),
  subscribeDisplayDiscountInfo: ({ onValue }) => { onValue(null); return () => {}; },
}));
jest.mock('../../../../utils/ql800LabelCanvas', () => ({ renderQl800Label: () => ({}) }));

// eslint-disable-next-line import/first
import DeliveryManagementV7 from '../DeliveryManagementV7';
// eslint-disable-next-line import/first
import DeliveryManagementV8 from '../DeliveryManagementV8';
// eslint-disable-next-line import/first
import BatchChargeControlModal from './BatchChargeControlModal';
// eslint-disable-next-line import/first
import { CHARGE_LIMIT_TEXT } from './chargeLimitTextV7';

const WEEK = '2026-09-27';
const TOMATO = 'o1::tom::biz1::::s0';
const EGGS = 'o1::egg::biz1::::s1';

// Tomato 1.5 kg x ₪10 + eggs 2 packs x ₪10 = ₪35, all weighed.
function seed(holdSum) {
  const order = {
    id: 'o1',
    status: 'pending',
    pickupSpot: 'X',
    customerDetails: { name: 'דנה', phone: '050-1', pickupSpot: 'X' },
    suspendedPaymentRef: { holdSum },
    items: [
      { lineId: TOMATO, productId: 'tom', productName: 'עגבניה', requestedQuantity: 1.5, measurementType: 'kg', price: 10, businessId: 'biz1' },
      { lineId: EGGS, productId: 'egg', productName: 'ביצים', requestedQuantity: 2, measurementType: 'package', price: 10, businessId: 'biz1' },
    ],
  };
  order.rawData = { ...order, delayedPayment: { holdSum } };
  Object.assign(mockState, {
    orders: [order],
    drafts: {
      o1: {
        orderId: 'o1',
        status: 'weighed',
        removedLineIds: {},
        weightsByLineId: {
          [TOMATO]: { actualQuantity: 1.5, source: 'scale' },
          [EGGS]: { actualQuantity: 2, source: 'package' },
        },
      },
    },
    draftListeners: new Set(),
    numbers: { '050-1': 11 },
    calls: {},
    settleErrors: [],
  });
}

const calls = (name) => mockState.calls[name] || [];

async function openOrder(Page) {
  render(
    <MemoryRouter initialEntries={['/admin/delivery']}>
      <Page />
    </MemoryRouter>,
  );
  if (Page === DeliveryManagementV8) {
    fireEvent.click(await screen.findByRole('tab', { name: /הזמנות וחיוב/ }));
  }
  fireEvent.click((await screen.findAllByRole('button', { name: /דנה/ }))[0]);
  return screen.findByRole('button', { name: 'השלם + חיוב' });
}

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('deliveryV7::lastSetup', JSON.stringify({ weekKey: WEEK, communities: [] }));
});

describe.each([
  ['V7', DeliveryManagementV7],
  ['V8', DeliveryManagementV8],
])('%s: card hold maximum', (_name, Page) => {
  test('shows the maximum and the overrun, and charges exactly the hold after one confirmation', async () => {
    seed(30);
    const complete = await openOrder(Page);

    const tile = await screen.findByTestId('charge-limit-tile');
    expect(tile).toHaveTextContent('מקסימום לסליקה');
    expect(tile).toHaveTextContent('₪30.00');
    expect(tile).toHaveTextContent('חריגה ₪5.00');
    // The order list marks it.
    expect(screen.getByTitle('מקסימום לסליקה')).toHaveTextContent('חריגה');

    // The line being weighed: eggs take ₪20 of the ₪30, so at most 1 kg of tomatoes at ₪10.
    fireEvent.click(screen.getAllByText('עגבניה')[0]);
    expect(await screen.findByTestId('line-charge-max')).toHaveTextContent('מקסימום לשקילה במוצר זה: 1.000');

    await waitFor(() => expect(complete).toBeEnabled());
    fireEvent.click(complete);
    expect(await screen.findByText(/הסכום שנשקל ₪35\.00 גבוה מהמקסימום לסליקה ₪30\.00/)).toBeInTheDocument();
    expect(screen.getByText(/הלקוח לא יחויב על ₪5\.00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /חזרה לשקילה/ })).toBeInTheDocument();
    // Two-second delay before the charge button works.
    expect(screen.getByRole('button', { name: /לחייב ₪30\.00/ })).toBeDisabled();
    const chargeAtHold = await screen.findByRole('button', { name: /^✓ לחייב ₪30\.00 \/ เรียกเก็บ ₪30\.00$/ }, { timeout: 4000 });
    fireEvent.click(chargeAtHold);

    await waitFor(() => expect(calls('settle')).toHaveLength(1));
    const sent = calls('settle')[0];
    expect(sent.finalSum).toBe(30);
    expect(sent.holdCap).toEqual({ max: 30, originalSum: 35, reducedBy: 5 });
    const growTotal = Object.keys(sent.productDataForGrow)
      .filter((key) => key.endsWith('[price]'))
      .reduce((sum, key) => sum + sent.productDataForGrow[key], 0);
    expect(Math.round(growTotal * 100)).toBe(3000);
  }, 20000);

  test('"back to weighing" charges nothing', async () => {
    seed(30);
    const complete = await openOrder(Page);
    await waitFor(() => expect(complete).toBeEnabled());
    fireEvent.click(complete);
    fireEvent.click(await screen.findByRole('button', { name: /חזרה לשקילה/ }));
    await waitFor(() => expect(screen.queryByText(/גבוה מהמקסימום לסליקה/)).toBeNull());
    expect(calls('settle')).toHaveLength(0);
  });

  test('within the hold: the usual confirmation and no cap', async () => {
    seed(40);
    const complete = await openOrder(Page);
    expect(await screen.findByTestId('charge-limit-tile')).toHaveTextContent('נותר ₪5.00');
    expect(screen.queryByTitle('מקסימום לסליקה')).toBeNull();
    await waitFor(() => expect(complete).toBeEnabled());
    fireEvent.click(complete);
    fireEvent.click(await screen.findByRole('button', { name: /^✓ אישור \/ ตกลง$/ }));
    await waitFor(() => expect(calls('settle')).toHaveLength(1));
    expect(calls('settle')[0].finalSum).toBe(35);
    expect(calls('settle')[0].holdCap).toBeUndefined();
  });

  test('stale data: the server refuses above the hold, the station offers the hold and charges it', async () => {
    seed(40);
    mockState.settleErrors.push(Object.assign(new Error('Request failed with status code 422'), {
      response: {
        status: 422,
        data: { status: 0, err: { code: 'amount_above_hold', message: 'above', total: 35, holdSum: 30 } },
      },
    }));
    const complete = await openOrder(Page);
    await waitFor(() => expect(complete).toBeEnabled());
    fireEvent.click(complete);
    fireEvent.click(await screen.findByRole('button', { name: /^✓ אישור \/ ตกลง$/ }));

    expect(await screen.findByText(/הסכום שנשקל ₪35\.00 גבוה מהמקסימום לסליקה ₪30\.00/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /^✓ לחייב ₪30\.00 \/ เรียกเก็บ ₪30\.00$/ }, { timeout: 4000 }));
    await waitFor(() => expect(calls('settle')).toHaveLength(2));
    expect(calls('settle')[0].holdCap).toBeUndefined();
    expect(calls('settle')[1]).toEqual(expect.objectContaining({ finalSum: 30, holdCap: { max: 30, originalSum: 35, reducedBy: 5 } }));
  }, 20000);
});

describe('batch charging modal', () => {
  const t = {
    ...CHARGE_LIMIT_TEXT.he,
    batchChargeModalTitle: 'חיוב', batchChargeModalHint: '', cancel: 'ביטול', batchChargePickCommunities: '',
    selectAll: '', clearSel: '', batchChargeSelectAllOrders: '', batchChargeClearOrders: '', stWeighed: 'נשקל',
    batchChargeExcludedBadge: '', batchChargeSkippedSection: '', batchChargeCompletedCount: () => '',
    batchChargePreviewCharge: 'לחיוב', batchChargePreviewDiscount: '', batchWeeklyPromotionSavings: () => '',
    confirmWait: (n) => `${n}`, batchChargeRun: (n) => `לחייב ${n}`, batchChargeNoReadySelected: '', refundChargeWarning: '',
  };
  const order = { id: 'o1', pickupSpot: 'X', customerDetails: { name: 'דנה', pickupSpot: 'X' } };
  const props = (overrides = {}) => ({
    open: true,
    t,
    isRTL: true,
    communities: ['X'],
    selectedCommunityNames: ['X'],
    plans: [{ communityName: 'X', ready: [{ order }], skipped: [] }],
    excludedOrderIds: new Set(),
    orderPreviews: { o1: { finalSum: 35, holdMax: 30 } },
    readyCount: 1,
    holdCapSummary: { overOrderIds: new Set(['o1']), overCount: 1, waived: 5 },
    capOverHold: true,
    onToggleCapOverHold: jest.fn(),
    onToggleCommunity: jest.fn(),
    onToggleOrderIncluded: jest.fn(),
    getCommunityColor: () => '#000',
    skipReasonLabel: (reason) => reason,
    ...overrides,
  });

  test('says how many orders are over and what is waived; capping is on and can be turned off', () => {
    const view = props();
    render(<BatchChargeControlModal {...view} />);
    expect(screen.getByText('1 הזמנות שנבחרו חורגות מהמקסימום לסליקה. הלקוחות לא יחויבו על ₪5.00.')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox', { name: 'לחייב את המקסימום בהזמנות שחורגות' });
    expect(checkbox).toBeChecked();
    expect(screen.getByText('חריגה: ₪35.00 · יחויב ₪30.00')).toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(view.onToggleCapOverHold).toHaveBeenCalled();
  });

  test('capping off: the over-limit order is marked as left out', () => {
    render(<BatchChargeControlModal {...props({ capOverHold: false })} />);
    expect(screen.getByRole('checkbox', { name: 'לחייב את המקסימום בהזמנות שחורגות' })).not.toBeChecked();
    expect(screen.getByText('הזמנות שחורגות לא ייכללו בחיוב הזה')).toBeInTheDocument();
    const row = screen.getByText('דנה').closest('label'); // eslint-disable-line testing-library/no-node-access
    expect(within(row).getByText('חורגת מהמקסימום לסליקה')).toBeInTheDocument();
  });

  test('no order over its hold: no summary', () => {
    render(<BatchChargeControlModal {...props({ holdCapSummary: { overOrderIds: new Set(), overCount: 0, waived: 0 } })} />);
    expect(screen.queryByRole('checkbox', { name: 'לחייב את המקסימום בהזמנות שחורגות' })).toBeNull();
  });
});
