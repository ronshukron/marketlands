import {
  SUBSCRIPTION_CEILING_FACTOR,
  batchChargeCapFor,
  summarizeBatchHoldCaps,
  getChargeLimit,
  getChargeRoom,
  isOverHold,
  maxQuantityForLine,
  readHoldSum,
} from './chargeLimitV7';

const holdOrder = (holdSum) => ({
  id: 'o1',
  grandTotal: 90,
  suspendedPaymentRef: { holdSum },
  rawData: { delayedPayment: { holdSum } },
});

describe('getChargeLimit', () => {
  test('a regular delayed order with a hold: the hold is the maximum', () => {
    expect(getChargeLimit(holdOrder(104.5))).toEqual({ type: 'hold', max: 104.5 });
    expect(readHoldSum({ rawData: { delayedPayment: { holdSum: '80.123' } } })).toBe(80.12);
  });

  test('no hold recorded: no limit', () => {
    expect(getChargeLimit({ id: 'o', rawData: {} })).toEqual({ type: 'none' });
    expect(getChargeLimit(holdOrder(0))).toEqual({ type: 'none' });
    expect(getChargeLimit(null)).toEqual({ type: 'none' });
  });

  test('a weekly-basket order: the server ceiling on the products, for display', () => {
    const order = {
      isSubscriptionOrder: true,
      grandTotal: 100,
      customerDetails: { deliveryDetails: { deliveryFee: 15 } },
      // A stray holdSum must not turn it into a hold order.
      suspendedPaymentRef: { holdSum: 50 },
    };
    expect(SUBSCRIPTION_CEILING_FACTOR).toBe(1.15);
    expect(getChargeLimit(order)).toEqual({ type: 'ceiling', max: 100, estimate: 100 });
    expect(getChargeLimit({ isSubscriptionOrder: true, grandTotal: 0 })).toEqual({ type: 'none' });
  });
});

describe('getChargeRoom', () => {
  const limit = { type: 'hold', max: 100 };

  test('room left, exactly at the limit, and over it', () => {
    expect(getChargeRoom({ limit, finalSum: 82.4 })).toEqual({ remaining: 17.6, over: false, overBy: 0 });
    expect(getChargeRoom({ limit, finalSum: 100 })).toEqual({ remaining: 0, over: false, overBy: 0 });
    expect(getChargeRoom({ limit, finalSum: 100.004 })).toEqual({ remaining: 0, over: false, overBy: 0 });
    expect(getChargeRoom({ limit, finalSum: 103.25 })).toEqual({ remaining: 0, over: true, overBy: 3.25 });
  });

  test('no limit: nothing to show', () => {
    expect(getChargeRoom({ limit: { type: 'none' }, finalSum: 500 })).toEqual({ remaining: null, over: false, overBy: 0 });
  });

  test('isOverHold only for hold orders', () => {
    expect(isOverHold(limit, 101)).toBe(true);
    expect(isOverHold(limit, 99)).toBe(false);
    expect(isOverHold({ type: 'ceiling', max: 100 }, 150)).toBe(false);
  });
});

describe('maxQuantityForLine', () => {
  const limit = { type: 'hold', max: 100 };

  test('kg: what fits after the other lines, floored to grams', () => {
    // Others total 70; this line not weighed yet; ₪12/kg -> 2.5 kg.
    expect(maxQuantityForLine({ limit, finalSum: 70, lineCurrentPrice: 0, effectiveUnitPrice: 12, measurementType: 'kg' })).toBe(2.5);
    // ₪7/kg: 30/7 = 4.2857 -> 4.285, never rounded up.
    expect(maxQuantityForLine({ limit, finalSum: 70, effectiveUnitPrice: 7, measurementType: 'kg' })).toBe(4.285);
  });

  test('the line already weighed is not counted twice', () => {
    // Total 95 includes this line at 25 (2 kg x 12.5): others are 70, room 30 -> 2.4 kg.
    expect(maxQuantityForLine({ limit, finalSum: 95, lineCurrentPrice: 25, effectiveUnitPrice: 12.5, measurementType: 'kg' })).toBe(2.4);
  });

  test('packages: whole packs', () => {
    expect(maxQuantityForLine({ limit, finalSum: 70, effectiveUnitPrice: 22.5, measurementType: 'package' })).toBe(1);
    expect(maxQuantityForLine({ limit, finalSum: 55, effectiveUnitPrice: 22.5, measurementType: 'package' })).toBe(2);
  });

  test('a discounted price (community discount or weekly promotion) gives more room', () => {
    expect(maxQuantityForLine({ limit, finalSum: 70, effectiveUnitPrice: 10.8, measurementType: 'kg' })).toBe(2.777);
  });

  test('others already over the limit: zero; no limit or no price: nothing shown', () => {
    expect(maxQuantityForLine({ limit, finalSum: 110, effectiveUnitPrice: 10 })).toBe(0);
    expect(maxQuantityForLine({ limit: { type: 'none' }, finalSum: 10, effectiveUnitPrice: 10 })).toBeNull();
    expect(maxQuantityForLine({ limit, finalSum: 10, effectiveUnitPrice: 0 })).toBeNull();
  });
});

describe('batch charging', () => {
  const entries = [
    { order: holdOrder(100) },
    { order: { ...holdOrder(50), id: 'o2' } },
    { order: { id: 'o3', isSubscriptionOrder: true, grandTotal: 40 } },
    { order: { id: 'o4', rawData: {} } },
  ];
  const previews = { o1: { finalSum: 104.5 }, o2: { finalSum: 49 }, o3: { finalSum: 80 }, o4: { finalSum: 999 } };

  test('counts only hold orders over their hold, and the total not charged', () => {
    const summary = summarizeBatchHoldCaps(entries, previews);
    expect([...summary.overOrderIds]).toEqual(['o1']);
    expect(summary.overCount).toBe(1);
    expect(summary.waived).toBe(4.5);
  });

  test('the cap passed per order: the hold when capping is on, nothing otherwise', () => {
    expect(batchChargeCapFor(holdOrder(100), true)).toBe(100);
    expect(batchChargeCapFor(holdOrder(100), false)).toBeNull();
    expect(batchChargeCapFor({ isSubscriptionOrder: true, grandTotal: 40 }, true)).toBeNull();
  });
});
