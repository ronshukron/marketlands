import { transferCustomerOrderQuantity } from './customerOrderTransferUtils';

const sourceBreakdown = {
  'order-a': {
    businessId: 'business-a',
    businessName: 'עסק א',
    subTotal: 30,
    items: [{
      productId: 'tomato',
      productName: 'עגבנייה',
      quantity: 3,
      price: 10,
      estimatedLineTotal: 30,
      selectedOption: 'None',
      lineSeed: 's0',
      lineId: 'customer-1::tomato::order-a::None::s0',
      paymentReference: 'keep-payment',
      weighing: { actualQuantity: 2.9 },
    }],
  },
};

const targetBusiness = { id: 'business-b', businessName: 'עסק ב' };
const targetProduct = {
  id: 'cucumber',
  name: 'מלפפון',
  price: 8,
  catalogNumber: '200',
  measurementType: 'kg',
};

describe('customer order product transfer', () => {
  test('partially transfers quantity, recalculates totals, and preserves source line identity', () => {
    const result = transferCustomerOrderQuantity({
      orderId: 'customer-1',
      orderBreakdown: sourceBreakdown,
      sourceLineId: sourceBreakdown['order-a'].items[0].lineId,
      quantity: 1,
      targetBusinessOrderKey: 'order-b',
      targetBusiness,
      targetProduct,
      transferId: 'transfer-1',
      deliveryFee: 5,
    });

    expect(result.orderBreakdown['order-a'].items[0]).toMatchObject({
      quantity: 2,
      lineId: 'customer-1::tomato::order-a::None::s0',
      estimatedLineTotal: 20,
      paymentReference: 'keep-payment',
      weighing: { actualQuantity: 2.9 },
    });
    expect(result.orderBreakdown['order-b'].items[0]).toMatchObject({
      productId: 'cucumber',
      productName: 'מלפפון',
      quantity: 1,
      estimatedLineTotal: 8,
    });
    expect(result.orderBreakdown['order-b'].items[0].paymentReference).toBeUndefined();
    expect(result.orderBreakdown['order-b'].items[0].weighing).toBeUndefined();
    expect(result.orderBreakdown['order-b'].items[0].lineId).toContain('::order-b::');
    expect(result.businessIds).toEqual(['business-a', 'business-b']);
    expect(result.grandTotal).toBe(33);
    expect(result.audit.targetLineId).toBe(result.orderBreakdown['order-b'].items[0].lineId);
  });

  test('removes an exhausted source business while keeping the transferred stable line', () => {
    const result = transferCustomerOrderQuantity({
      orderId: 'customer-1',
      orderBreakdown: sourceBreakdown,
      sourceLineId: sourceBreakdown['order-a'].items[0].lineId,
      quantity: 3,
      targetBusinessOrderKey: 'order-b',
      targetBusiness,
      targetProduct,
      transferId: 'transfer-2',
    });

    expect(result.orderBreakdown['order-a']).toBeUndefined();
    expect(result.businessIds).toEqual(['business-b']);
    expect(result.grandTotal).toBe(24);
    expect(result.orderBreakdown['order-b'].items[0].lineId)
      .toBe('customer-1::cucumber::order-b::None::transfer-transfer-2');
  });

  test('rejects same-business and excessive transfers', () => {
    const common = {
      orderId: 'customer-1',
      orderBreakdown: sourceBreakdown,
      sourceLineId: sourceBreakdown['order-a'].items[0].lineId,
      targetBusinessOrderKey: 'order-b',
      targetProduct,
      transferId: 'transfer-3',
    };

    expect(() => transferCustomerOrderQuantity({
      ...common,
      quantity: 1,
      targetBusiness: { id: 'business-a' },
    })).toThrow('עסק יעד שונה');
    expect(() => transferCustomerOrderQuantity({
      ...common,
      quantity: 4,
      targetBusiness,
    })).toThrow('גדולה מכמות המקור');
  });

  test('appends into an existing target business key without cloning payment fields', () => {
    const multiBusinessBreakdown = {
      ...sourceBreakdown,
      'order-b': {
        businessId: 'business-b',
        businessName: 'עסק ב',
        subTotal: 8,
        items: [{
          productId: 'carrot',
          productName: 'גזר',
          quantity: 1,
          price: 8,
          estimatedLineTotal: 8,
          selectedOption: 'None',
          lineSeed: 's0',
          lineId: 'customer-1::carrot::order-b::None::s0',
          paymentReference: 'existing-b',
        }],
      },
    };

    const result = transferCustomerOrderQuantity({
      orderId: 'customer-1',
      orderBreakdown: multiBusinessBreakdown,
      sourceLineId: multiBusinessBreakdown['order-a'].items[0].lineId,
      quantity: 1,
      targetBusinessOrderKey: 'order-b',
      targetBusiness,
      targetProduct,
      transferId: 'transfer-4',
    });

    expect(Object.keys(result.orderBreakdown)).toEqual(['order-a', 'order-b']);
    expect(result.orderBreakdown['order-b'].items).toHaveLength(2);
    expect(result.orderBreakdown['order-b'].items[0].paymentReference).toBe('existing-b');
    expect(result.orderBreakdown['order-b'].items[1]).toMatchObject({
      productId: 'cucumber',
      quantity: 1,
    });
    expect(result.orderBreakdown['order-b'].items[1].paymentReference).toBeUndefined();
    expect(result.orderBreakdown['order-b'].subTotal).toBe(16);
  });
});
