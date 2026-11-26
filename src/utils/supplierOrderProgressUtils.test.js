import {
  applyProcurementOverrides,
  buildSupplierOrderText,
  computeRemainingLines,
  getOrderEnteredAt,
  getProcurementCutoffGroups,
  getProcurementOverrideCandidates,
  getSupplierProgressStatus,
  sumOrderedByProductKey,
  toNativeQuantity,
} from './supplierOrderProgressUtils';

jest.mock('../services/pickupSpotsService', () => ({
  resolveCommunityName: (value) => value,
}));

const products = {
  banana_: {
    productName: 'בננה', selectedOption: '', quantity: 33, unitSize: 1, measurementType: 'kg', totalRevenue: 300,
  },
  ginger_: {
    productName: 'ג׳ינג׳ר', selectedOption: 'None', quantity: 6, unitSize: 1, measurementType: 'unit', totalRevenue: 40,
  },
};

describe('supplier order progress', () => {
  test('sums batches and computes the remaining quantities', () => {
    const batches = [
      { lines: { banana_: { quantity: 20 } } },
      { lines: { banana_: { quantity: 5.5 }, ginger_: { quantity: 6 } } },
    ];
    const ordered = sumOrderedByProductKey(batches);
    expect(ordered).toEqual({ banana_: 25.5, ginger_: 6 });

    const rows = computeRemainingLines(products, ordered);
    expect(rows.map((row) => [row.key, row.remainingQty])).toEqual([
      ['banana_', 7.5],
      ['ginger_', 0],
    ]);
    expect(rows[1].selectedOption).toBe('');
  });

  test('flags over-ordered products and clamps remaining at zero', () => {
    const rows = computeRemainingLines(products, { banana_: 40 });
    expect(rows[0]).toMatchObject({ remainingQty: 0, overOrdered: true });
  });

  test('reports progress status', () => {
    expect(getSupplierProgressStatus(products, [])).toMatchObject({ batchCount: 0, isComplete: false });
    expect(getSupplierProgressStatus(products, [
      { lines: { banana_: { quantity: 33 }, ginger_: { quantity: 6 } } },
    ])).toMatchObject({ batchCount: 1, remainingCount: 0, isComplete: true });
  });

  test('converts entered quantities to native units', () => {
    expect(toNativeQuantity(3, 'unit', 0.5, 'kg')).toBe(1.5);
    expect(toNativeQuantity(2.4, 'kg', 0.5, 'kg')).toBe(2.4);
    expect(toNativeQuantity(4, 'kg', 1, 'unit')).toBe(4);
  });

  test('builds supplier text grouped by packaging', () => {
    const text = buildSupplierOrderText({
      header: 'הזמנה ל05.11.26:',
      items: [
        { productName: 'בננה', mode: 'kg', isUnitBased: false, quantity: 20 },
        { productName: 'ג׳ינג׳ר', selectedOption: 'גדול', mode: 'unit', isUnitBased: true, quantity: 6 },
        { productName: 'עגבניה', mode: 'unit', isUnitBased: false, quantity: 0 },
      ],
    });
    expect(text).toBe([
      'הזמנה ל05.11.26:',
      '',
      'הזמנה סיטונאית לא ארוז:',
      '* בננה - 20.0 ק"ג',
      '',
      'הזמנה ארוז:',
      '* ג׳ינג׳ר *גדול* - 6 יח\'',
    ].join('\n'));
  });
});

describe('procurement overrides', () => {
  const tuesday = new Date(2026, 10, 10);
  const wednesday = new Date(2026, 10, 11);
  const orders = [
    { id: 'x1', community: 'X', deliveryDate: tuesday },
    { id: 'k1', community: 'K', deliveryDate: wednesday },
    { id: 'k2', community: 'K', deliveryDate: wednesday },
    { id: 'm1', community: 'M', deliveryDate: wednesday },
  ];
  const overrides = [
    { community: 'K', originalDeliveryDate: '2026-11-11', procureOnDate: '2026-11-10' },
  ];

  test('pulls overridden communities into the procurement day', () => {
    const result = applyProcurementOverrides(orders, overrides, '2026-11-10');
    expect(result.orders.map((order) => order.id)).toEqual(['x1', 'k1', 'k2']);
    expect(result.pulledIn).toEqual([{ community: 'K', originalDeliveryDate: '2026-11-11', count: 2 }]);
    expect(result.pushedOut).toEqual([]);
  });

  test('removes overridden communities from their original day', () => {
    const result = applyProcurementOverrides(orders, overrides, '2026-11-11');
    expect(result.orders.map((order) => order.id)).toEqual(['m1']);
    expect(result.pushedOut).toEqual([{ community: 'K', procureOnDate: '2026-11-10', count: 2 }]);
  });

  test('returns every order when no day is selected', () => {
    expect(applyProcurementOverrides(orders, overrides, '').orders).toHaveLength(4);
  });

  test('lists candidates from other days that are not pulled in yet', () => {
    expect(getProcurementOverrideCandidates(orders, overrides, '2026-11-10')).toEqual([
      { key: 'M__2026-11-11', community: 'M', originalDeliveryDate: '2026-11-11', count: 1 },
    ]);
  });

  describe('closing time', () => {
    const closed = [{ ...overrides[0], cutoffAt: new Date(2026, 10, 9, 15, 30).toISOString() }];
    const held = (id, hour, minute, extra = {}) => ({
      id,
      community: 'K',
      deliveryDate: wednesday,
      createdAt: new Date(2026, 10, 9, hour, minute - 1).toISOString(),
      delayedPayment: { heldAt: { toDate: () => new Date(2026, 10, 9, hour, minute) } },
      ...extra,
    });
    const early = held('early', 15, 11);
    const late = held('late', 19, 17);
    // Opened before the closing time but paid after it: it was not in the purchase.
    const paidLate = held('paidLate', 15, 31);
    const moved = held('moved', 10, 5, { adminDeliveryTransferredAt: new Date(2026, 10, 9, 18, 0).toISOString() });
    const all = [early, late, paidLate, moved, orders[0], orders[3]];
    const ids = (list) => list.map((order) => order.id);

    test('every order is purchased on exactly one of the two days', () => {
      const tuesdayView = applyProcurementOverrides(all, closed, '2026-11-10');
      const wednesdayView = applyProcurementOverrides(all, closed, '2026-11-11');
      expect(ids(tuesdayView.orders)).toEqual(['early', 'x1']);
      expect(ids(wednesdayView.orders)).toEqual(['late', 'paidLate', 'moved', 'm1']);
      expect(ids(wednesdayView.lateOrders)).toEqual(['late', 'paidLate', 'moved']);
      expect(ids(tuesdayView.lateOrders)).toEqual(['late', 'paidLate', 'moved']);
      expect(wednesdayView.pushedOut).toEqual([{ community: 'K', procureOnDate: '2026-11-10', count: 1 }]);
    });

    test('late orders are not offered as a community to add again', () => {
      expect(getProcurementOverrideCandidates(all, closed, '2026-11-10').map((entry) => entry.community)).toEqual(['M']);
    });

    test('without a closing time every order stays in the early purchase', () => {
      expect(ids(applyProcurementOverrides(all, overrides, '2026-11-11').orders)).toEqual(['m1']);
    });

    test('an order counts from when it was paid, or moved to this day', () => {
      expect(getOrderEnteredAt(paidLate)).toEqual(new Date(2026, 10, 9, 15, 31));
      expect(getOrderEnteredAt(moved)).toEqual(new Date(2026, 10, 9, 18, 0));
      expect(getOrderEnteredAt({ createdAt: new Date(2026, 10, 9, 9, 0).toISOString() })).toEqual(new Date(2026, 10, 9, 9, 0));
      expect(getOrderEnteredAt({})).toBeNull();
    });

    test('groups show the orders of the early purchase on both days, newest first', () => {
      ['2026-11-10', '2026-11-11'].forEach((day) => {
        const groups = getProcurementCutoffGroups(all, closed, day);
        expect(groups).toHaveLength(1);
        expect(groups[0]).toEqual(expect.objectContaining({ procureOnDate: '2026-11-10', originalDeliveryDate: '2026-11-11' }));
        expect(groups[0].orders.map(({ order }) => order.id)).toEqual(['late', 'moved', 'paidLate', 'early']);
      });
      expect(getProcurementCutoffGroups(all, closed, '2026-11-12')).toEqual([]);
    });
  });
});
