import {
  buildCommunityDiscountFingerprint,
  buildCommunityDiscountOrderPatch,
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

  test('allocates a community discount across invoice lines and keeps Grow totals exact', () => {
    const items = [
      {
        lineId: 'order-7::a::business::::s0',
        productId: 'a',
        productName: 'A',
        requestedQuantity: 1,
        pricePerUnit: 10.01,
        measurementType: 'package',
        catalogNumber: 'A1',
        vatType: 1,
      },
      {
        lineId: 'order-7::b::business::::s0',
        productId: 'b',
        productName: 'B',
        requestedQuantity: 1,
        pricePerUnit: 20.02,
        measurementType: 'package',
        catalogNumber: 'B1',
        vatType: 3,
      },
    ];
    const discount = {
      percent: 10,
      tierIndex: 0,
      cohortTotal: 1000,
      deliveryWeekKey: '2026-08-09',
      community: 'קהילה א',
      mode: 'manual',
    };
    const result = buildSettlementPayload({
      selectedOrder: { id: 'order-7' },
      items,
      draft: {},
      weighingAudit: { stationId: 'station-a' },
      communityDiscount: discount,
    });

    expect(result.communityDiscount).toMatchObject({
      percent: 10,
      preDiscountTotal: 30.03,
      amount: 3,
      finalTotal: 27.03,
    });
    expect(result.finalInvoiceLines).toEqual([
      expect.objectContaining({
        catalogNumber: 'A1',
        vatType: 1,
        preDiscountLinePrice: 10.01,
        communityDiscountShare: 1,
        linePrice: 9.01,
      }),
      expect.objectContaining({
        catalogNumber: 'B1',
        vatType: 3,
        preDiscountLinePrice: 20.02,
        communityDiscountShare: 2,
        linePrice: 18.02,
      }),
    ]);
    expect(result.finalSum).toBe(27.03);
    expect(result.productDataForGrow['productData[0][price]']).toBe(9.01);
    expect(result.productDataForGrow['productData[1][price]']).toBe(18.02);
    expect(result.weighingAudit.communityDiscount).toEqual(result.communityDiscount);
  });

  test('discounts unit prices before line rounding and leaves zero discounts unchanged', () => {
    const items = [0, 1, 2].map((index) => ({
      lineId: `order-7::p${index}::business::::s0`,
      productId: `p${index}`,
      productName: `P${index}`,
      requestedQuantity: 1,
      pricePerUnit: 0.05,
      measurementType: 'package',
    }));
    const discounted = buildSettlementPayload({
      selectedOrder: { id: 'order-7' },
      items,
      communityDiscount: { percent: 10 },
    });
    const plain = buildSettlementPayload({
      selectedOrder: { id: 'order-7' },
      items,
      communityDiscount: { percent: 0 },
    });

    expect(discounted.communityDiscount.amount).toBe(0);
    expect(discounted.finalInvoiceLines.map((line) => line.pricePerUnit)).toEqual([0.045, 0.045, 0.045]);
    expect(discounted.finalInvoiceLines.map((line) => line.communityDiscountShare)).toEqual([0, 0, 0]);
    expect(discounted.finalInvoiceLines.reduce((sum, line) => sum + line.linePrice, 0)).toBeCloseTo(discounted.finalSum, 10);
    expect(plain.finalSum).toBe(0.15);
    expect(plain.communityDiscount).toBeUndefined();
    expect(plain.finalInvoiceLines.every((line) => line.preDiscountLinePrice === undefined)).toBe(true);
  });

  test('keeps every discounted line non-negative across many tiny prices', () => {
    const items = Array.from({ length: 37 }, (_, index) => ({
      lineId: `order-7::tiny-${index}::business::::s0`,
      productId: `tiny-${index}`,
      productName: `Tiny ${index}`,
      requestedQuantity: 1,
      pricePerUnit: index % 3 === 0 ? 0.01 : 0.02,
      measurementType: 'package',
    }));
    const result = buildSettlementPayload({
      selectedOrder: { id: 'order-7' },
      items,
      communityDiscount: { percent: 33.33 },
    });

    const lineSum = result.finalInvoiceLines.reduce((sum, line) => sum + line.linePrice, 0);
    const shareSum = result.finalInvoiceLines.reduce((sum, line) => sum + line.communityDiscountShare, 0);
    expect(result.finalInvoiceLines.every((line) => (
      line.linePrice >= 0
      && line.communityDiscountShare >= 0
      && line.communityDiscountShare <= line.preDiscountLinePrice
    ))).toBe(true);
    expect(lineSum).toBeCloseTo(result.finalSum, 10);
    expect(shareSum).toBeCloseTo(result.communityDiscount.amount, 10);
  });

  test('discounts a fixed introduction basket once and excludes the hold buffer line', () => {
    const items = [
      {
        lineId: 'basket-component-a',
        productId: 'a',
        productName: 'A',
        requestedQuantity: 1,
        pricePerUnit: 18,
        isBasketComponent: true,
        basketId: 'basket-product',
        basketInstanceId: 'basket-1',
        basketTitle: 'Starter',
        basketPrice: 30,
        basketComponentSubtotal: 35,
      },
      {
        lineId: 'basket-component-b',
        productId: 'b',
        productName: 'B',
        requestedQuantity: 1,
        pricePerUnit: 17,
        isBasketComponent: true,
        basketId: 'basket-product',
        basketInstanceId: 'basket-1',
        basketTitle: 'Starter',
        basketPrice: 30,
        basketComponentSubtotal: 35,
      },
      {
        lineId: 'buffer',
        productId: 'buffer',
        productName: 'Buffer',
        requestedQuantity: 1,
        pricePerUnit: 500,
        catalogNumber: '999003',
        measurementType: 'package',
      },
    ];
    const result = buildSettlementPayload({
      selectedOrder: { id: 'order-7' },
      items,
      communityDiscount: { percent: 10 },
    });

    expect(result.finalInvoiceLines).toHaveLength(1);
    expect(result.finalInvoiceLines[0]).toMatchObject({
      isIntroductionBasket: true,
      preDiscountLinePrice: 30,
      communityDiscountShare: 3,
      linePrice: 27,
    });
    expect(result.finalSum).toBe(27);
    expect(result.communityDiscount.preDiscountTotal).toBe(30);
  });

  test('clamps excessive discounts to 100 percent and ignores negative discounts', () => {
    const item = {
      lineId: 'line-a',
      productId: 'a',
      productName: 'A',
      requestedQuantity: 1,
      pricePerUnit: 12.34,
      measurementType: 'package',
    };
    const free = buildSettlementPayload({
      selectedOrder: { id: 'order-7' },
      items: [item],
      communityDiscount: { percent: 150 },
    });
    const unchanged = buildSettlementPayload({
      selectedOrder: { id: 'order-7' },
      items: [item],
      communityDiscount: { percent: -5 },
    });

    expect(free.communityDiscount).toMatchObject({ percent: 100, amount: 12.34, finalTotal: 0 });
    expect(free.finalInvoiceLines[0].linePrice).toBe(0);
    expect(free.productDataForGrow['productData[0][price]']).toBe(0);
    expect(unchanged.finalSum).toBe(12.34);
    expect(unchanged.communityDiscount).toBeUndefined();
  });

  test('does not mutate source items, draft, or discount metadata', () => {
    const item = {
      lineId: 'line-a',
      productId: 'a',
      productName: 'A',
      requestedQuantity: 2,
      pricePerUnit: 10,
      measurementType: 'package',
    };
    const draft = { weightsByLineId: {}, removedLineIds: {} };
    const discount = { percent: 5, mode: 'manual', cohortTotal: 500 };
    const before = JSON.stringify({ item, draft, discount });

    buildSettlementPayload({
      selectedOrder: { id: 'order-7' },
      items: [item],
      draft,
      communityDiscount: discount,
    });

    expect(JSON.stringify({ item, draft, discount })).toBe(before);
  });

  test('builds retry-stable discounted item prices and preserves original estimates', () => {
    const orderData = {
      grandTotal: 125,
      customerExcludedLineIds: { 'order-7::excluded::business::::s1': true },
      orderBreakdown: {
        business: {
          businessId: 'business',
          items: [
            {
              productId: 'weighted',
              productName: 'Weighted',
              lineSeed: 's0',
              quantity: 2,
              estimatedChargeQuantity: 1.5,
              estimatedLineTotal: 15,
              price: 10,
              effectivePrice: 10,
            },
            {
              productId: 'excluded',
              productName: 'Excluded',
              lineSeed: 's1',
              lineId: 'order-7::excluded::business::::s1',
              quantity: 1,
              estimatedLineTotal: 100,
              price: 100,
            },
          ],
        },
      },
    };
    const communityDiscount = {
      percent: 10,
      tierIndex: 1,
      deliveryWeekKey: '2026-08-09',
      community: 'קהילה א',
    };
    const fingerprint = buildCommunityDiscountFingerprint({
      orderId: 'order-7',
      communityDiscount,
    });
    const first = buildCommunityDiscountOrderPatch({
      orderId: 'order-7',
      orderData,
      communityDiscount,
      fingerprint,
    });
    const second = buildCommunityDiscountOrderPatch({
      orderId: 'order-7',
      orderData: { ...orderData, orderBreakdown: first.orderBreakdown, grandTotal: first.grandTotal },
      communityDiscount,
      fingerprint,
    });
    const weighted = first.orderBreakdown.business.items[0];
    const excluded = first.orderBreakdown.business.items[1];

    expect(weighted).toMatchObject({
      communityDiscountOriginalPrice: 10,
      communityDiscountOriginalEffectivePrice: 10,
      communityDiscountOriginalEstimatedLineTotal: 15,
      price: 9,
      effectivePrice: 9,
      estimatedLineTotal: 13.5,
      communityDiscountPercent: 10,
      communityDiscountFingerprint: fingerprint,
    });
    expect(excluded.price).toBe(100);
    expect(first.grandTotal).toBe(123.5);
    expect(second.orderBreakdown).toEqual(first.orderBreakdown);
  });

  test('scales a basket and its adjustment while leaving shipping, buffer, and removed lines unchanged', () => {
    const orderId = 'order-7';
    const breakdown = ensureLineIdsInBreakdown(orderId, {
      business: {
        items: [
          {
            productId: 'basket-a',
            productName: 'Basket A',
            lineSeed: 's0',
            quantity: 1,
            price: 18,
            estimatedLineTotal: 18,
            isBasketComponent: true,
            basketInstanceId: 'basket-1',
            basketPrice: 30,
          },
          {
            productId: 'basket-b',
            productName: 'Basket B',
            lineSeed: 's1',
            quantity: 1,
            price: 17,
            estimatedLineTotal: 17,
            isBasketComponent: true,
            basketInstanceId: 'basket-1',
            basketPrice: 30,
          },
          {
            productId: 'adjustment',
            productName: 'Adjustment',
            lineSeed: 's2',
            quantity: 1,
            price: -5,
            estimatedLineTotal: -5,
            isShipping: true,
            isBasketAdjustment: true,
            basketInstanceId: 'basket-1',
            basketPrice: 30,
          },
          {
            productId: 'shipping',
            productName: 'Shipping',
            lineSeed: 's3',
            quantity: 1,
            price: 20,
            estimatedLineTotal: 20,
            isShipping: true,
          },
          {
            productId: 'buffer',
            productName: 'Buffer',
            lineSeed: 's4',
            quantity: 1,
            price: 50,
            estimatedLineTotal: 50,
            catalogNumber: '999003',
          },
          {
            productId: 'removed',
            productName: 'Removed',
            lineSeed: 's5',
            quantity: 1,
            price: 10,
            estimatedLineTotal: 10,
          },
        ],
      },
    }).breakdown;
    const removedLineId = breakdown.business.items[5].lineId;
    const communityDiscount = { percent: 10, deliveryWeekKey: '2026-08-09', community: 'קהילה א' };
    const fingerprint = buildCommunityDiscountFingerprint({
      orderId,
      communityDiscount,
      removedLineIds: { [removedLineId]: true },
    });
    const patch = buildCommunityDiscountOrderPatch({
      orderId,
      orderData: { grandTotal: 130, orderBreakdown: breakdown },
      communityDiscount,
      fingerprint,
      removedLineIds: { [removedLineId]: true },
    });
    const items = patch.orderBreakdown.business.items;

    expect(items.slice(0, 3).map((item) => item.basketPrice)).toEqual([27, 27, 27]);
    expect(items.slice(0, 3).map((item) => item.price)).toEqual([16.2, 15.3, -4.5]);
    expect(items[3].price).toBe(20);
    expect(items[4].price).toBe(50);
    expect(items[5].price).toBe(10);
    expect(patch.estimatedDiscountAmount).toBe(3);
    expect(patch.grandTotal).toBe(127);
  });
});
