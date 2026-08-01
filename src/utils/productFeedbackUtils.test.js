import {
  buildProductFeedbackId,
  isProductFeedbackEligible,
  validateProductFeedback,
} from './productFeedbackUtils';

describe('product feedback validation', () => {
  test('accepts a valid rating with constructive feedback', () => {
    expect(validateProductFeedback({ rating: 5, feedback: 'מוצר טרי וטעים מאוד' })).toBe('');
  });

  test('rejects invalid ratings and feedback that is too short or too long', () => {
    expect(validateProductFeedback({ rating: 0, feedback: 'מוצר טרי וטעים מאוד' })).toMatch('דירוג');
    expect(validateProductFeedback({ rating: 4, feedback: 'טעים' })).toMatch('לפחות 10');
    expect(validateProductFeedback({ rating: 4, feedback: 'א'.repeat(1001) })).toMatch('עד 1000');
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
