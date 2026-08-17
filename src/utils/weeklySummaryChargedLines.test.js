import {
  isPaidWeeklySummaryOrder,
  parseLineId,
  reconcileChargedOrder,
  reconcileWeeklyOrders,
} from './weeklySummaryChargedLines';

const checkoutItem = (overrides = {}) => ({
  lineId: 'order-1::tomato::business-a::Large::s0',
  productId: 'tomato',
  productName: 'Tomato',
  selectedOption: 'Large',
  quantity: 2,
  effectivePrice: 10,
  estimatedLineTotal: 20,
  ...overrides,
});

const delayedOrder = (overrides = {}) => ({
  id: 'order-1',
  isDelayed: true,
  paymentStatus: 'completed',
  delayedOrderStatus: 'settled',
  customerDetails: { deliveryDetails: { deliveryFee: 15 } },
  orderBreakdown: {
    'business-a': {
      businessId: 'business-a',
      businessName: 'Farm',
      items: [checkoutItem()],
    },
  },
  weighing: {
    finalSum: 22.5,
    finalInvoiceLines: [{
      lineId: 'order-1::tomato::business-a::Large::s0',
      productId: 'tomato',
      productName: 'Tomato',
      actualQuantity: 2.25,
      linePrice: 22.5,
    }],
  },
  ...overrides,
});

describe('weekly charged-line reconciliation', () => {
  test('normalizes paid and terminal failure statuses consistently', () => {
    expect(isPaidWeeklySummaryOrder({ paymentStatus: 'paid' }, false)).toBe(true);
    expect(isPaidWeeklySummaryOrder({
      paymentStatus: 'held',
      delayedOrderStatus: 'pending-weighing',
    }, true)).toBe(true);
    expect(isPaidWeeklySummaryOrder({
      paymentStatus: 'cancelled',
      delayedOrderStatus: 'settled',
    }, true)).toBe(false);
  });

  test('parses stable and legacy line ids without losing option identity', () => {
    expect(parseLineId('o::p::business::Extra::Large::s1')).toMatchObject({
      itemToken: 'p',
      businessOrderKey: 'business',
      selectedOption: 'Extra::Large',
    });
    expect(parseLineId('o::p::Large::0')).toMatchObject({
      itemToken: 'p',
      businessOrderKey: '',
      selectedOption: 'Large',
    });
  });

  test('uses final invoice quantity and line price as authoritative', () => {
    const result = reconcileChargedOrder(delayedOrder());
    expect(result.lines[0]).toMatchObject({
      actualQuantity: 2.25,
      chargedTotal: 22.5,
      estimatedTotal: 20,
    });
    expect(result.productCharges).toBe(22.5);
    expect(result.deliveryFee).toBe(15);
    expect(result.totalPaid).toBe(37.5);
    expect(result.actualVsEstimated).toBe(2.5);
    expect(result.hasDiscrepancy).toBe(false);
  });

  test('matches a legacy final line through parsed product and option', () => {
    const result = reconcileChargedOrder(delayedOrder({
      weighing: {
        finalSum: 19,
        finalInvoiceLines: [{
          lineId: 'order-1::tomato::Large::0',
          actualQuantity: 1.9,
          linePrice: 19,
        }],
      },
    }));
    expect(result.lines[0].businessId).toBe('business-a');
    expect(result.missingLines).toHaveLength(0);
  });

  test('keeps unmatched weighed additions and reports checkout lines missing from settlement', () => {
    const result = reconcileChargedOrder(delayedOrder({
      weighing: {
        finalSum: 7,
        finalInvoiceLines: [{
          lineId: 'order-1::extra::manual::None::s0',
          productId: 'extra',
          productName: 'Added item',
          actualQuantity: 1,
          linePrice: 7,
        }],
      },
    }));
    expect(result.lines[0]).toMatchObject({ isAdditional: true, chargedTotal: 7 });
    expect(result.missingLines).toHaveLength(1);
    expect(result.missingEstimated).toBe(20);
  });

  test('aggregates a basket invoice line and does not mark its components missing', () => {
    const component = checkoutItem({
      lineId: 'component-1',
      basketInstanceId: 'basket-1',
      basketId: 'intro',
      basketTitle: 'Starter',
      isBasketComponent: true,
      estimatedLineTotal: 16,
    });
    const adjustment = checkoutItem({
      lineId: 'adjustment-1',
      productId: 'adjustment',
      basketInstanceId: 'basket-1',
      isBasketAdjustment: true,
      estimatedLineTotal: 4,
    });
    const result = reconcileChargedOrder(delayedOrder({
      orderBreakdown: {
        basket: { businessName: 'Basket', items: [component, adjustment] },
      },
      weighing: {
        finalSum: 20,
        finalInvoiceLines: [{
          lineId: 'basket::basket-1',
          productId: 'intro',
          productName: 'Starter basket',
          basketInstanceId: 'basket-1',
          componentLineIds: ['component-1'],
          isIntroductionBasket: true,
          actualQuantity: 1,
          linePrice: 20,
        }],
      },
    }));
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      isIntroductionBasket: true,
      estimatedTotal: 20,
      chargedTotal: 20,
    });
    expect(result.missingLines).toHaveLength(0);
  });

  test('regular orders use checkout-snapshotted totals and weekly stats share that model', () => {
    const regular = {
      id: 'regular',
      paymentStatus: 'completed',
      grandTotal: 35,
      customerDetails: { deliveryDetails: { deliveryFee: 15 } },
      orderBreakdown: {
        business: {
          items: [checkoutItem({ estimatedLineTotal: 20, effectivePrice: 999 })],
        },
      },
    };
    const result = reconcileWeeklyOrders([regular, delayedOrder()]);
    expect(result.successfulCount).toBe(2);
    expect(result.productCharges).toBe(42.5);
    expect(result.deliveryFees).toBe(30);
    expect(result.totalPaid).toBe(72.5);
  });

  test('flags a per-order reported total discrepancy above two agorot', () => {
    const result = reconcileChargedOrder(delayedOrder({
      weighing: {
        finalSum: 22.47,
        finalInvoiceLines: [{
          lineId: 'order-1::tomato::business-a::Large::s0',
          actualQuantity: 2.25,
          linePrice: 22.5,
        }],
      },
    }));
    expect(result.discrepancy).toBe(0.03);
    expect(result.hasDiscrepancy).toBe(true);
  });

  test('skips customer-excluded checkout lines from regular order charges', () => {
    const result = reconcileChargedOrder({
      id: 'regular',
      paymentStatus: 'completed',
      grandTotal: 20,
      customerExcludedLineIds: { 'order-1::tomato::business-a::Large::s0': true },
      customerDetails: { deliveryDetails: { deliveryFee: 0 } },
      orderBreakdown: {
        business: {
          items: [checkoutItem()],
        },
      },
    });
    expect(result.lines).toHaveLength(0);
    expect(result.productCharges).toBe(0);
  });
});
