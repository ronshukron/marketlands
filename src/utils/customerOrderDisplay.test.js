import {
  formatCustomerLineQuantity,
  getCustomerLineEstimatedTotal,
  getCustomerOrderDisplayTotal,
  getCustomerOrderStatusInfo,
} from './customerOrderDisplay';

jest.mock('../services/pickupSpotsService', () => ({
  resolveCommunityName: (value) => value,
}));

describe('customer order line display', () => {
  test('shows buffered kg, unit weight estimate and packages', () => {
    expect(formatCustomerLineQuantity({ measurementType: 'kg', quantity: 1, displayQuantity: 1.05 })).toBe('1.05 ק"ג');
    expect(formatCustomerLineQuantity({ measurementType: 'kg', quantity: 1, weightBufferPercent: 7 })).toBe('1.1 ק"ג');
    expect(formatCustomerLineQuantity({ measurementType: 'unit', quantity: 2, averageWeightKg: 0.3 })).toBe('2 יח\' (~0.6 ק"ג)');
    expect(formatCustomerLineQuantity({ measurementType: 'package', quantity: 3 })).toBe('3 מארז');
    expect(formatCustomerLineQuantity({ isBasketAdjustment: true, quantity: 1 })).toBe('');
  });

  test('line totals prefer the hold estimate and price unit lines by weight', () => {
    expect(getCustomerLineEstimatedTotal({ estimatedHoldLineTotal: 10.5, estimatedLineTotal: 10 })).toBe(10.5);
    expect(getCustomerLineEstimatedTotal({ measurementType: 'unit', quantity: 2, averageWeightKg: 0.3, price: 40 })).toBe(24);
  });
});

describe('customer order totals and status', () => {
  const delayedOrder = {
    customerOrderSource: 'customerOrdersDelayed',
    paymentStatus: 'held',
    delayedOrderStatus: 'pending_weighing',
    customerDetails: { deliveryDetails: { deliveryFee: 5 } },
    customerExcludedLineIds: { removed: true },
    orderBreakdown: {
      o1: {
        items: [
          { lineId: 'a', estimatedHoldLineTotal: 10.5, estimatedLineTotal: 10 },
          { lineId: 'removed', estimatedLineTotal: 50 },
        ],
      },
    },
  };

  test('estimates held orders from active lines plus delivery', () => {
    expect(getCustomerOrderDisplayTotal(delayedOrder)).toMatchObject({ amount: 15.5, isEstimate: true, isFinal: false });
    expect(getCustomerOrderStatusInfo(delayedOrder).label).toBe('התקבלה - תחויב לאחר שקילה');
  });

  test('uses the final charge after weighing', () => {
    const weighed = { ...delayedOrder, paymentStatus: 'completed', delayedOrderStatus: 'completed', weighing: { finalSum: 9.8 } };
    expect(getCustomerOrderDisplayTotal(weighed)).toMatchObject({ amount: 9.8, isFinal: true, label: 'סה"כ שחויב' });
    expect(getCustomerOrderStatusInfo(weighed)).toMatchObject({ label: 'הושלמה וחויבה', tone: 'green' });
  });

  test('labels cancelled and regular paid orders', () => {
    expect(getCustomerOrderStatusInfo({ paymentStatus: 'cancelled' }).tone).toBe('red');
    expect(getCustomerOrderStatusInfo({ customerOrderSource: 'customerOrders', paymentStatus: 'completed' }).label).toBe('שולמה');
  });
});
