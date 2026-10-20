import {
  attachProductFeedbackContext,
  buildProductFeedbackId,
  isDismissedProductFeedback,
  isProductFeedbackEligible,
  validateDismissReason,
  validateProductFeedback,
} from './productFeedbackUtils';

describe('product feedback validation', () => {
  test('accepts a valid rating with constructive feedback', () => {
    expect(validateProductFeedback({ rating: 5, feedback: 'מוצר טרי וטעים מאוד' })).toBe('');
  });

  test('accepts a rating without text and with known tags', () => {
    expect(validateProductFeedback({ rating: 4, feedback: '', tags: ['טרי', 'טעים'] })).toBe('');
  });

  test('rejects unknown tags and more than six tags', () => {
    expect(validateProductFeedback({ rating: 4, feedback: '', tags: ['לא קיים'] })).toMatch('תגית');
    expect(validateProductFeedback({
      rating: 4,
      feedback: '',
      tags: ['טרי', 'טרי', 'טרי', 'טרי', 'טרי', 'טרי', 'טעים'],
    })).toMatch('6');
  });

  test('rejects invalid ratings and feedback that is too short or too long', () => {
    expect(validateProductFeedback({ rating: 0, feedback: 'מוצר טרי וטעים מאוד' })).toMatch('דירוג');
    expect(validateProductFeedback({ rating: 4, feedback: 'טעים' })).toMatch('לפחות 10');
    expect(validateProductFeedback({ rating: 4, feedback: 'א'.repeat(1001) })).toMatch('עד 1000');
  });
});

describe('dismissing a review', () => {
  test('requires a short reason and recognizes only an explicit dismissal', () => {
    expect(validateDismissReason('  בדיקה  ')).toBe('');
    expect(validateDismissReason('   ')).toMatch('למה');
    expect(validateDismissReason('א'.repeat(301))).toMatch('300');
    expect(isDismissedProductFeedback({ dismissed: true })).toBe(true);
    expect(isDismissedProductFeedback({ dismissed: false })).toBe(false);
    expect(isDismissedProductFeedback({})).toBe(false);
  });
});

describe('product feedback eligibility', () => {
  const order = { userId: 'customer-1', paymentStatus: 'paid', customerExcludedLineIds: {} };
  const line = { lineId: 'line::1', productId: 'product-1' };

  test('requires an authenticated owner and a purchased active product line', () => {
    expect(isProductFeedbackEligible({ order, line, userId: 'customer-1' })).toBe(true);
    expect(isProductFeedbackEligible({
      order: { ...order, paymentStatus: 'Paid', delayedOrderStatus: 'pending-weighing' },
      line,
      userId: 'customer-1',
    })).toBe(true);
    expect(isProductFeedbackEligible({
      order: { userId: 'customer-1', paymentStatus: 'held', delayedOrderStatus: 'pending-weighing' },
      line,
      userId: 'customer-1',
    })).toBe(true);
    expect(isProductFeedbackEligible({
      order: { userId: 'customer-1', paymentStatus: 'held', delayedOrderStatus: 'cancelled' },
      line,
      userId: 'customer-1',
    })).toBe(false);
    expect(isProductFeedbackEligible({ order, line, userId: 'other' })).toBe(false);
    expect(isProductFeedbackEligible({
      order: { ...order, paymentStatus: 'pending_payment' },
      line,
      userId: 'customer-1',
    })).toBe(false);
    expect(isProductFeedbackEligible({
      order: { ...order, customerExcludedLineIds: { 'line::1': true } },
      line,
      userId: 'customer-1',
    })).toBe(false);
    expect(isProductFeedbackEligible({
      order,
      line: { lineId: 'line-2' },
      userId: 'customer-1',
    })).toBe(false);
    expect(isProductFeedbackEligible({
      order,
      line: { ...line, lineId: 'shipping-line', isShipping: true },
      userId: 'customer-1',
    })).toBe(false);
  });

  test('builds one path-safe document id per order line', () => {
    expect(buildProductFeedbackId('order-1', 'line::1')).toBe('order-1~line::1');
    expect(() => buildProductFeedbackId('order-1', 'line/1')).toThrow('אינו תקין');
  });
});

describe('product feedback customer context', () => {
  const review = { orderId: 'order-1', lineId: 'order-1::line-1' };
  const order = {
    customerDetails: {
      name: 'דנה כהן',
      phone: '0501234567',
      email: 'dana@example.com',
      pickupSpot: 'אור הנר',
    },
  };

  test('attaches the orderer details and a refund on the same product line', () => {
    const enriched = attachProductFeedbackContext(review, {
      order,
      refunds: [{
        id: 'refund-1',
        orderId: 'order-1',
        status: 'pending',
        reason: 'הפריט לא היה טרי',
        refundItems: [{ lineId: 'order-1::line-1', refundAmount: 12.5 }],
      }],
    });

    expect(enriched).toMatchObject({
      customerName: 'דנה כהן',
      customerPhone: '0501234567',
      customerEmail: 'dana@example.com',
      pickupSpot: 'אור הנר',
      refundRequested: true,
      refundForThisLine: true,
      refundStatus: 'pending',
      refundReason: 'הפריט לא היה טרי',
      refundAmount: 12.5,
    });
  });

  test('marks an order refund that does not include this product', () => {
    const enriched = attachProductFeedbackContext(review, {
      order,
      refunds: [{
        id: 'refund-2',
        orderId: 'order-1',
        userName: 'שם מגיבוי',
        status: 'rejected',
        refundItems: [{ lineId: 'order-1::other' }],
      }],
    });

    expect(enriched.refundRequested).toBe(true);
    expect(enriched.refundForThisLine).toBe(false);
    expect(enriched.customerName).toBe('דנה כהן');
  });

  test('falls back to the refund record when the order has no customer name', () => {
    const enriched = attachProductFeedbackContext(review, {
      order: {},
      refunds: [{
        id: 'refund-3',
        orderId: 'order-1',
        userName: 'יוסי לוי',
        userPhone: '0520000000',
        status: 'pending',
        refundItems: [],
      }],
    });

    expect(enriched.customerName).toBe('יוסי לוי');
    expect(enriched.customerPhone).toBe('0520000000');
    expect(enriched.refundForThisLine).toBe(false);
  });

  test('does not claim there was no refund when refunds failed to load', () => {
    const enriched = attachProductFeedbackContext(review, {
      order,
      refunds: [],
      refundsLoaded: false,
    });

    expect(enriched.refundsLoaded).toBe(false);
    expect(enriched.refundRequested).toBe(false);
  });
});
