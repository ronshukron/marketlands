import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PickingWorkspaceV8 from './PickingWorkspaceV8';
import { buildItemPickGroups } from './itemPickingV8';
import { TR8 } from './translationsV8';

const t8 = TR8.he;

const orders = [
  { id: 'o1', customerDetails: { name: 'דנה', pickupSpot: 'X' }, items: [{}, {}] },
  { id: 'o2', customerDetails: { name: 'יוסי', pickupSpot: 'Y' }, items: [{}] },
];

const contexts = {
  o1: {
    items: [
      { lineId: 'o1::tom', productId: 'tom', productName: 'עגבניה', requestedQuantity: 1.5, measurementType: 'kg' },
      { lineId: 'o1::egg', productId: 'egg', productName: 'ביצים', requestedQuantity: 2, measurementType: 'package' },
    ],
    draft: {},
  },
  o2: {
    items: [
      { lineId: 'o2::tom', productId: 'tom', productName: 'עגבניה', requestedQuantity: 2, measurementType: 'kg' },
    ],
    draft: { weightsByLineId: { 'o2::tom': { actualQuantity: 2.05, source: 'scale' } } },
  },
};

const groups = buildItemPickGroups({ orders, getOrderContext: (order) => contexts[order.id] });
const tomato = groups.find((group) => group.productId === 'tom');
const eggs = groups.find((group) => group.productId === 'egg');

function renderWorkspace(overrides = {}) {
  const props = {
    t8,
    lang: 'he',
    view: 'boxes',
    hasOrdersLoaded: true,
    scopeBlocks: [
      { key: 'g1', group: 'משלוח ראשון', communities: ['X', 'Y'] },
      { key: '__single:Z', group: '', communities: ['Z'] },
    ],
    scopeCommunities: ['X', 'Y'],
    allCommunities: ['X', 'Y', 'Z'],
    onSelectScopeCommunities: jest.fn(),
    onToggleScopeCommunity: jest.fn(),
    communityProgress: { X: { picked: 0, total: 1 }, Y: { picked: 1, total: 1 }, Z: { picked: 0, total: 3 } },
    getCommunityColor: () => '#123456',
    getCommunityGroup: (name) => (name === 'Z' ? '' : 'משלוח ראשון'),
    onSaveScopeAsGroup: jest.fn(),
    onClearGroup: jest.fn(),
    savingGroup: false,
    scopeOrders: orders,
    completedInScopeCount: 0,
    isAdmin: true,
    onOpenBatchCharge: jest.fn(),
    batchChargeBusy: false,
    getBoxInfo: (order) => ({
      customerNumber: order.id === 'o1' ? 17 : 42,
      communityNumber: 1,
      communityIndex: order.id === 'o1' ? 0 : 1,
      community: order.customerDetails.pickupSpot,
      color: '#123456',
      name: order.customerDetails.name,
      wantsReusableCartons: false,
    }),
    getOrderLock: () => null,
    cachedImg: (url) => url,
    printedCountByOrder: { o1: 1, o2: 0 },
    boxesReadyIds: new Set(['o1']),
    onToggleBoxReady: jest.fn(),
    onMarkAllReady: jest.fn(),
    onClearReady: jest.fn(),
    onPrintLabel: jest.fn(),
    onPrintMissing: jest.fn(),
    printAllProgress: null,
    isPrinting: false,
    hasPrinterSupport: true,
    printerHint: 'no printer',
    onStartPicking: jest.fn(),
    groups,
    summary: { items: 2, doneItems: 0, lines: 3, doneLines: 1 },
    itemSortMode: 'name',
    onChangeItemSort: jest.fn(),
    hideDoneItems: false,
    onToggleHideDone: jest.fn(),
    activeGroup: null,
    onOpenGroup: jest.fn(),
    onCloseGroup: jest.fn(),
    onNextGroup: jest.fn(),
    activeLineId: '',
    onSelectEntry: jest.fn(),
    weighProps: {
      savingActionKey: '',
      scaleConnected: false,
      liveWeight: null,
      lastStableWeight: null,
      onSaveWeight: jest.fn(() => Promise.resolve(true)),
      onUseOrdered: jest.fn(),
      onMarkMissing: jest.fn(),
      onRestore: jest.fn(),
      onReset: jest.fn(),
    },
    ...overrides,
  };
  const utils = render(<PickingWorkspaceV8 {...props} />);
  return { ...utils, props };
}

describe('ScopeBar', () => {
  test('selecting a delivery group selects all its communities', () => {
    const { props } = renderWorkspace({ scopeCommunities: ['Z'] });
    // Group button comes first; community pills also carry the group name as a tag.
    fireEvent.click(screen.getAllByRole('button', { name: /משלוח ראשון/ })[0]);
    expect(props.onSelectScopeCommunities).toHaveBeenCalledWith(['X', 'Y']);
  });

  test('numbers deliveries and tells the worker what to do next', () => {
    renderWorkspace({
      scopeBlocks: [
        { key: 'g1', group: 'שפלה צפון', communities: ['X', 'Y'] },
        { key: 'g2', group: 'כוכב', communities: ['Z'] },
      ],
    });
    expect(screen.getByRole('button', { name: /משלוח 1/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /משלוח 2/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(t8.deliverySelected(1))).toBeInTheDocument();
    expect(screen.getByText(t8.deliveryThenNext(2))).toBeInTheDocument();
  });

  test('Thai copy tells the worker to press the numbered button, not the town names', () => {
    renderWorkspace({ t8: TR8.th, lang: 'th' });
    expect(screen.getByText(TR8.th.scopeHint)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /รอบส่งที่ 1/ })[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(TR8.th.deliverySelected(1))).toBeInTheDocument();
    expect(screen.getByText(/ชื่อหมู่บ้านด้านล่างไม่ต้องกด/)).toBeInTheDocument();
  });

  test('community pills toggle individually (multi-select)', () => {
    const { props } = renderWorkspace();
    const zPill = screen.getAllByRole('button', { pressed: false }).find((el) => /Z/.test(el.textContent) && /0\/3/.test(el.textContent));
    fireEvent.click(zPill);
    expect(props.onToggleScopeCommunity).toHaveBeenCalledWith('Z');
  });

  test('offers "save as group" only when the selection is not already a group', () => {
    renderWorkspace({ scopeCommunities: ['X', 'Z'] });
    expect(screen.getByRole('button', { name: /שמור כקבוצת משלוח/ })).toBeInTheDocument();
  });

  test('offers "ungroup" when the selection equals a group', () => {
    const { props } = renderWorkspace({ scopeCommunities: ['X', 'Y'] });
    expect(screen.queryByRole('button', { name: /שמור כקבוצת משלוח/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /בטל קבוצה/ }));
    expect(props.onClearGroup).toHaveBeenCalledWith(expect.objectContaining({ group: 'משלוח ראשון' }));
  });

  test('non-admins cannot save groups', () => {
    renderWorkspace({ isAdmin: false, scopeCommunities: ['X', 'Z'] });
    expect(screen.queryByRole('button', { name: /שמור כקבוצת משלוח/ })).toBeNull();
  });

  test('empty selection shows a prompt instead of orders', () => {
    renderWorkspace({ scopeCommunities: [] });
    expect(screen.getByText(t8.noCommunitiesSelected)).toBeInTheDocument();
  });

  test('shows a V7 charge banner when every item is picked and nothing is waiting to sync', () => {
    renderWorkspace({ summary: { items: 2, doneItems: 2, lines: 3, doneLines: 3 }, pendingSyncCount: 0 });
    expect(screen.getByText(t8.readyForV7, { exact: false })).toBeInTheDocument();
  });

  test('warns not to switch to V7 while local changes are still syncing', () => {
    renderWorkspace({ pendingSyncCount: 4 });
    expect(screen.getByText(t8.pendingSyncBeforeV7(4), { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(t8.readyForV7, { exact: false })).toBeNull();
  });
});

describe('BoxesStep', () => {
  test('lists every order with its box number and label state', () => {
    renderWorkspace();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(t8.boxesReadyCount(1, 2))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(t8.printMissing(1).replace(/[()]/g, '\\$&')) })).toBeEnabled();
  });

  test('ready toggle, print and start picking call their handlers', () => {
    const { props } = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: t8.boxNotReady }));
    expect(props.onToggleBoxReady).toHaveBeenCalledWith('o2');
    fireEvent.click(screen.getAllByRole('button', { name: t8.printOne })[0]);
    expect(props.onPrintLabel).toHaveBeenCalledWith(orders[0]);
    fireEvent.click(screen.getByRole('button', { name: t8.startPicking }));
    expect(props.onStartPicking).toHaveBeenCalled();
  });

  test('without a printer the print buttons are hidden and a hint is shown', () => {
    renderWorkspace({ hasPrinterSupport: false });
    expect(screen.queryByRole('button', { name: t8.printOne })).toBeNull();
    expect(screen.getByText('no printer')).toBeInTheDocument();
  });
});

describe('ItemsStep list', () => {
  test('lists products like V7 lists orders, and opens a product', () => {
    const { props } = renderWorkspace({ view: 'items', itemSortMode: 'business' });
    expect(screen.getByText(t8.itemsProgress(0, 2), { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t8.sortByPopular })).toBeInTheDocument();
    const tomatoCard = screen.getByRole('button', { name: /עגבניה/ });
    expect(tomatoCard).toHaveTextContent(t8.boxesCount(2));
    expect(tomatoCard).toHaveTextContent('1/2');
    fireEvent.click(tomatoCard);
    expect(props.onOpenGroup).toHaveBeenCalledWith(tomato.key);
  });
});

describe('WeighPanel', () => {
  const openTomato = (overrides = {}) => renderWorkspace({
    view: 'items',
    activeGroup: tomato,
    activeLineId: 'o1::tom',
    ...overrides,
  });

  test('shows which box to put the item in and the ordered amount', () => {
    openTomato();
    expect(screen.getByText(t8.putInBox)).toBeInTheDocument();
    expect(screen.getAllByText('1.500 ק"ג').length).toBeGreaterThan(0);
  });

  test('manual weight + Enter saves for the active line', () => {
    const { props } = openTomato();
    const input = screen.getByPlaceholderText('1.500');
    fireEvent.change(input, { target: { value: '1.4' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.weighProps.onSaveWeight).toHaveBeenCalledWith(expect.objectContaining({ lineId: 'o1::tom', orderId: 'o1' }), '1.4', 'manual');
  });

  test('pressing שמור saves the typed weight and does not pass the click event', () => {
    const { props } = openTomato();
    const input = screen.getByPlaceholderText('1.500');
    fireEvent.change(input, { target: { value: '1.25' } });
    fireEvent.click(screen.getByRole('button', { name: t8.save }));
    expect(props.weighProps.onSaveWeight).toHaveBeenCalledWith(expect.objectContaining({ lineId: 'o1::tom' }), '1.25', 'manual');
  });

  test('saves a stable scale reading, then refuses the same reading until the scale is emptied', async () => {
    const weighProps = {
      ...renderWorkspace().props.weighProps,
      scaleConnected: true,
      liveWeight: { value: 1.234, stable: true },
      onSaveWeight: jest.fn(() => Promise.resolve(true)),
    };
    document.body.innerHTML = '';
    const { props, rerender } = openTomato({ weighProps });
    const saveButton = screen.getByRole('button', { name: /שמור מהמשקל · 1.234/ });
    fireEvent.click(saveButton);
    expect(weighProps.onSaveWeight).toHaveBeenCalledWith(expect.objectContaining({ lineId: 'o1::tom' }), 1.234, 'scale');

    // Next box, item still on the scale: must not be savable.
    const nextProps = { ...props, activeLineId: 'o1::tom', weighProps: { ...weighProps } };
    rerender(<PickingWorkspaceV8 {...nextProps} />);
    expect(await screen.findByRole('button', { name: t8.liftFromScale })).toBeDisabled();

    // Scale emptied -> re-armed.
    rerender(<PickingWorkspaceV8 {...nextProps} weighProps={{ ...weighProps, liveWeight: { value: 0, stable: true } }} />);
    rerender(<PickingWorkspaceV8 {...nextProps} weighProps={{ ...weighProps, liveWeight: { value: 0.9, stable: true } }} />);
    expect(screen.getByRole('button', { name: /שמור מהמשקל · 0.900/ })).toBeEnabled();
  });

  test('never uses an unstable or stale reading', () => {
    openTomato({
      weighProps: {
        ...renderWorkspace().props.weighProps,
        scaleConnected: true,
        liveWeight: { value: 0.004, stable: true },
        lastStableWeight: { value: 1.8 },
      },
    });
    document.body.innerHTML = '';
    openTomato({
      weighProps: {
        ...renderWorkspace().props.weighProps,
        scaleConnected: true,
        liveWeight: { value: 0.004, stable: true },
        lastStableWeight: { value: 1.8 },
      },
    });
    screen.getAllByRole('button', { name: new RegExp(t8.saveFromScale) }).forEach((btn) => expect(btn).toBeDisabled());
  });

  test('packages are confirmed with one tap using the ordered amount', () => {
    const { props } = renderWorkspace({ view: 'items', activeGroup: eggs, activeLineId: 'o1::egg' });
    fireEvent.click(screen.getByRole('button', { name: t8.confirmPackage(2, t8.pkgLbl) }));
    expect(props.weighProps.onUseOrdered).toHaveBeenCalledWith(expect.objectContaining({ lineId: 'o1::egg' }));
  });

  test('picked line shows its weight and can be reset', () => {
    const { props } = openTomato({ activeLineId: 'o2::tom' });
    expect(screen.getAllByText('2.050 ק"ג').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: t8.reset }));
    expect(props.weighProps.onReset).toHaveBeenCalledWith(expect.objectContaining({ lineId: 'o2::tom' }));
  });

  test('out-of-stock and locked orders', () => {
    const { props } = openTomato();
    fireEvent.click(screen.getByRole('button', { name: t8.markMissing }));
    expect(props.weighProps.onMarkMissing).toHaveBeenCalledWith(expect.objectContaining({ lineId: 'o1::tom' }));
    document.body.innerHTML = '';
    openTomato({ getOrderLock: (orderId) => (orderId === 'o1' ? { stationId: 'st-2' } : null) });
    expect(screen.getByRole('button', { name: t8.markMissing })).toBeDisabled();
    expect(screen.getByRole('button', { name: t8.save })).toBeDisabled();
  });

  test('tapping a box in the list selects it', () => {
    const { props } = openTomato();
    fireEvent.click(screen.getByRole('button', { name: /יוסי/ }));
    expect(props.onSelectEntry).toHaveBeenCalledWith('o2::tom');
  });
});
