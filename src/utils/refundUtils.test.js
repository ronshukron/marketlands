import {
  REFUND_STATUSES,
  buildRefundCompletedWhatsAppMessage,
  calculateDiscountedUnitPrice,
  getRefundStatusDetails,
  isUnsupportedV7RefundLine,
  isV7OrderEditableForRefund,
} from './refundUtils';

describe('refundUtils', () => {
  test('calculates percentage reductions from the current unit price', () => {
    expect(calculateDiscountedUnitPrice(20, 50)).toBe(10);
    expect(calculateDiscountedUnitPrice(20, 25)).toBe(15);
    expect(calculateDiscountedUnitPrice(20, 100)).toBe(0);
    expect(calculateDiscountedUnitPrice(20, 150)).toBe(0);
  });

  test('only treats held V7 orders awaiting weighing as editable', () => {
    expect(isV7OrderEditableForRefund({
      paymentStatus: 'held',
      delayedOrderStatus: 'pending_weighing',
    })).toBe(true);
    expect(isV7OrderEditableForRefund({
      paymentStatus: 'completed',
      delayedOrderStatus: 'pending_weighing',
    })).toBe(false);
    expect(isV7OrderEditableForRefund({
      paymentStatus: 'held',
      delayedOrderStatus: 'settling',
    })).toBe(false);
    expect(isV7OrderEditableForRefund({
      paymentStatus: 'held',
      delayedOrderStatus: 'pending_weighing',
    }, { status: 'settling' })).toBe(false);
    expect(isV7OrderEditableForRefund({
      paymentStatus: 'completed',
      delayedOrderStatus: 'completed',
    }, null)).toBe(false);
  });

  test('routes basket lines away from direct V7 price discounts', () => {
    expect(isUnsupportedV7RefundLine({ isBasketComponent: true })).toBe(true);
    expect(isUnsupportedV7RefundLine({ basketInstanceId: 'basket-1' })).toBe(true);
    expect(isUnsupportedV7RefundLine({ catalogNumber: '999003' })).toBe(true);
    expect(isUnsupportedV7RefundLine({ productId: 'tomato' })).toBe(false);
  });

  test('provides labels for the manual refund workflow', () => {
    expect(getRefundStatusDetails(REFUND_STATUSES.PENDING_MANUAL_REFUND).adminLabel)
      .toBe('ממתין להחזר ידני');
    expect(getRefundStatusDetails(REFUND_STATUSES.MANUALLY_REFUNDED).customerLabel)
      .toBe('הזיכוי הוחזר');
  });

  test('builds a prewritten refund completion message', () => {
    const message = buildRefundCompletedWhatsAppMessage({
      customerName: 'נועה',
      amount: 25,
      orderId: 'abcdefgh1234',
    });

    expect(message).toContain('נועה');
    expect(message).toContain('25.00');
    expect(message).toContain('abcdefgh');
  });
});
