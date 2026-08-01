import {
  buildSettlementPayload,
  ensureLineIdsInBreakdown,
  recomputeBreakdownTotals,
  sumItemsTotal,
} from './orderDraftUtils';

describe('V7 order draft baseline contracts', () => {
  const breakdown = {
    'business-b': {
      businessId: 'b',
      items: [
        { productId: 'tomato', productName: 'Tomato', selectedOption: 'large', quantity: 1.25, price: 8 },
        { productId: 'tomato', productName: 'Tomato', selectedOption: 'large', quantity: 0.5, price: 8 },
      ],
    },
    'business-a': {
      businessId: 'a',
      items: [
        { productId: 'apple', productName: 'Apple', quantity: 3, price: 2.345 },
      ],
    },
  };

  test('assigns deterministic seeds and stable line IDs without changing line order', () => {
    const first = ensureLineIdsInBreakdown('order-7', breakdown);
    const second = ensureLineIdsInBreakdown('order-7', first.breakdown);

    expect(Object.keys(first.breakdown)).toEqual(['business-a', 'business-b']);
    expect(first.breakdown['business-b'].items.map((item) => item.lineId)).toEqual([
      'order-7::tomato::business-b::large::s0',
      'order-7::tomato::business-b::large::s1',
    ]);
    expect(first.newSeedsAssigned).toBe(true);
    expect(second.newSeedsAssigned).toBe(false);
    expect(second.breakdown).toEqual(first.breakdown);
  });

  test('keeps raw and rounded order totals at their established precision', () => {
    expect(sumItemsTotal(breakdown)).toBeCloseTo(21.035, 10);

    const recomputed = recomputeBreakdownTotals(breakdown);
    expect(recomputed['business-a'].subTotal).toBe(7.04);
    expect(recomputed['business-b'].subTotal).toBe(14);
  });

  test('keeps settlement line IDs, quantities, and totals stable', () => {
    const items = [
      {
        lineId: 'order-7::tomato::business-b::large::s0',
        productId: 'tomato',
        productName: 'Tomato',
        requestedQuantity: 1.25,
        pricePerUnit: 8,
        measurementType: 'kg',
        catalogNumber: 'T1',
      },
      {
        lineId: 'order-7::box::business-a::::s0',
        productId: 'box',
        productName: 'Box',
        requestedQuantity: 2,
        pricePerUnit: 3.5,
        measurementType: 'package',
        catalogNumber: 'B1',
      },
    ];

    const result = buildSettlementPayload({
      selectedOrder: { id: 'order-7' },
      items,
      draft: {
        weightsByLineId: {
          [items[0].lineId]: { actualQuantity: 1.2345, source: 'scale' },
        },
      },
    });

    expect(result.finalInvoiceLines.map((line) => line.lineId)).toEqual(items.map((item) => item.lineId));
    expect(result.finalInvoiceLines.map((line) => line.actualQuantity)).toEqual([1.2345, 2]);
    expect(result.finalInvoiceLines.map((line) => line.linePrice)).toEqual([9.88, 7]);
    expect(result.finalSum).toBe(16.88);
  });

  test('adds attribution without changing settlement identity or totals', () => {
    const lineId = 'order-7::tomato::business-b::large::s0';
    const audit = {
      stationId: 'station-a',
      sessionId: 'user-a::station-a',
      userId: 'user-a',
      userName: 'Admin',
      updatedAtIso: '2026-07-24T12:00:00.000Z',
    };
    const result = buildSettlementPayload({
      selectedOrder: { id: 'order-7' },
      items: [{
        lineId,
        productId: 'tomato',
        productName: 'Tomato',
        requestedQuantity: 1,
        pricePerUnit: 10,
        measurementType: 'kg',
      }],
      draft: {
        weightsByLineId: {
          [lineId]: { actualQuantity: 1.5, source: 'manual' },
        },
      },
      weighingAudit: audit,
    });

    expect(result.finalSum).toBe(15);
    expect(result.finalInvoiceLines[0]).toMatchObject({ lineId, linePrice: 15, audit });
    expect(result.weightsByLineId[lineId].audit).toEqual(audit);
    expect(result.weighingAudit).toEqual(audit);
  });

  test('keeps per-line audit when present and omits audit fields without weighingAudit', () => {
    const lineId = 'order-7::tomato::business-b::large::s0';
    const lineAudit = {
      stationId: 'station-line',
      sessionId: 'user-line::station-line',
      userId: 'user-line',
      userName: 'Weigher',
      updatedAtIso: '2026-07-24T11:00:00.000Z',
    };
    const finalizerAudit = {
      stationId: 'station-final',
      sessionId: 'user-final::station-final',
      userId: 'user-final',
      userName: 'Finalizer',
      updatedAtIso: '2026-07-24T12:00:00.000Z',
      finalizedAtIso: '2026-07-24T12:00:00.000Z',
      source: 'delivery-v7',
    };

    const attributed = buildSettlementPayload({
      selectedOrder: { id: 'order-7' },
      items: [{
        lineId,
        productId: 'tomato',
        productName: 'Tomato',
        requestedQuantity: 1,
        pricePerUnit: 10,
        measurementType: 'kg',
      }],
      draft: {
        weightsByLineId: {
          [lineId]: { actualQuantity: 1.5, source: 'manual', audit: lineAudit },
        },
      },
      weighingAudit: finalizerAudit,
    });
    expect(attributed.finalInvoiceLines[0].audit).toEqual(lineAudit);
    expect(attributed.weightsByLineId[lineId].audit).toEqual(lineAudit);
    expect(attributed.weighingAudit).toEqual(finalizerAudit);

    const plain = buildSettlementPayload({
      selectedOrder: { id: 'order-7' },
      items: [{
        lineId,
        productId: 'tomato',
        productName: 'Tomato',
        requestedQuantity: 1,
        pricePerUnit: 10,
        measurementType: 'kg',
      }],
      draft: {
        weightsByLineId: {
          [lineId]: { actualQuantity: 1.5, source: 'manual' },
        },
      },
    });
    expect(plain.weighingAudit).toBeUndefined();
    expect(plain.finalInvoiceLines[0].audit).toBeUndefined();
    expect(plain.weightsByLineId[lineId].audit).toBeUndefined();
    expect(plain.finalSum).toBe(15);
  });
});
