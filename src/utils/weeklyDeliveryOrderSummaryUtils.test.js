import {
  aggregateDeliveryBusinessSummary,
  getDuplicateOrderKey,
  shouldIncludeOrderInDeliverySummary,
} from './weeklyDeliveryOrderSummaryUtils';

const item = (overrides = {}) => ({
  lineId: 'line-1',
  productId: 'product-1',
  productName: 'Tomato',
  quantity: 2,
  selectedOption: 'Large',
  estimatedLineTotal: 20,
  ...overrides,
});

const order = (overrides = {}) => ({
  id: 'order-1',
  userId: ' Customer-1 ',
  deliveryDate: new Date(2026, 6, 19),
  deliveryDateLabel: '19/07/2026',
  community: ' Community A ',
  orderBreakdown: {
    business: {
      businessId: ' Business-1 ',
      businessName: 'Supplier',
      items: [item()],
    },
  },
  ...overrides,
});

describe('weekly delivery order summary utilities', () => {
  test('strictly includes supported regular and delayed payment states', () => {
    expect(shouldIncludeOrderInDeliverySummary({ paymentStatus: 'completed' }, 'customerOrders')).toBe(true);
    expect(shouldIncludeOrderInDeliverySummary({ paymentStatus: 'charged' }, 'customerOrders')).toBe(false);

    expect(shouldIncludeOrderInDeliverySummary({
      paymentStatus: 'held',
      delayedOrderStatus: 'pending_weighing',
    }, 'customerOrdersDelayed')).toBe(true);
    expect(shouldIncludeOrderInDeliverySummary({
      paymentStatus: 'completed',
      delayedOrderStatus: 'pending_weighing',
    }, 'customerOrdersDelayed')).toBe(false);
    expect(shouldIncludeOrderInDeliverySummary({
      paymentStatus: 'held',
      delayedOrderStatus: 'settled',
    }, 'customerOrdersDelayed')).toBe(true);
    expect(shouldIncludeOrderInDeliverySummary({
      paymentStatus: 'completed',
      delayedOrderStatus: 'pending authorization',
    }, 'customerOrdersDelayed')).toBe(false);
  });

  test('duplicates require the same normalized customer, date, community, and active item signature', () => {
    const first = order();
    const normalizedEquivalent = order({
      id: 'order-2',
      userId: 'customer-1',
      deliveryDate: undefined,
      community: 'community   a',
      customerExcludedLineIds: { excluded: true },
      orderBreakdown: {
        business: {
          businessId: 'business-1',
          items: [
            item({ quantity: '2', selectedOption: ' Large ' }),
            item({ lineId: 'shipping', productId: 'shipping', isShipping: true, quantity: 1 }),
            item({ lineId: 'excluded', productId: 'other', quantity: 99 }),
          ],
        },
      },
    });

    expect(getDuplicateOrderKey(normalizedEquivalent)).toBe(getDuplicateOrderKey(first));
    expect(getDuplicateOrderKey(order({
      id: 'order-3',
      orderBreakdown: {
        business: {
          businessId: 'business-1',
          items: [item({ quantity: 3 })],
        },
      },
    }))).not.toBe(getDuplicateOrderKey(first));
  });

  test('aggregates only active non-shipping lines from the supplied visible orders', () => {
    const summary = aggregateDeliveryBusinessSummary([
      order({
        customerExcludedLineIds: { removed: true },
        orderBreakdown: {
          business: {
            businessId: 'business-1',
            businessName: 'Supplier',
            items: [
              item(),
              item({ lineId: 'removed', productId: 'removed', quantity: 10, estimatedLineTotal: 100 }),
              item({ lineId: 'shipping', productId: 'shipping', isShipping: true, estimatedLineTotal: 15 }),
            ],
          },
        },
      }),
    ]);

    expect(summary['business-1'].totalRevenue).toBe(20);
    expect(summary['business-1'].products['product-1_large']).toMatchObject({
      quantity: 2,
      totalRevenue: 20,
    });
    expect(Object.keys(summary['business-1'].products)).toHaveLength(1);
  });
});
