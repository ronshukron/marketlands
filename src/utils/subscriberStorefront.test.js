import { getEstimatedLineTotal } from './pricing';
import {
  SUBSCRIBER_STATES,
  applyPendingQuantities,
  deriveSubscriberDelivery,
  describeDeliveryPlace,
  formatDeliveryDay,
  getWeighedAmount,
  orderToCartItems,
  subscriptionItemKey,
} from './subscriberStorefront';

const line = (productId, quantity, extra = {}) => ({
  productId,
  productName: productId,
  quantity,
  price: 10,
  basePrice: 10,
  measurementType: 'kg',
  selectedOption: 'None',
  lineId: `o::${productId}::f1::None::s0`,
  ...extra,
});

const order = (id, deliveryDate, extra = {}) => ({
  id,
  deliveryDate,
  paymentStatus: 'held',
  delayedOrderStatus: 'pending_weighing',
  orderBreakdown: { f1: { businessId: 'b1', businessName: 'חווה', items: [line('cucumber', 1)] } },
  ...extra,
});

const sub = (extra = {}) => ({
  id: 's1',
  status: 'active',
  community: 'אור הנר',
  deliveryOption: 'pickup',
  nextDeliveryDate: '2026-12-02',
  orderIds: ['sub_s1_2026-11-18', 'sub_s1_2026-11-25'],
  skipDates: [],
  ...extra,
});

describe('deriveSubscriberDelivery', () => {
  const today = '2026-11-22';

  test('no active subscription means no subscriber mode', () => {
    expect(deriveSubscriberDelivery({ subscriptions: [sub({ status: 'paused' })], todayKey: today }).state)
      .toBe(SUBSCRIBER_STATES.NONE);
  });

  test('the generated order for the nearest date from today is open for edits', () => {
    const result = deriveSubscriberDelivery({
      subscriptions: [sub()],
      ordersById: {
        'sub_s1_2026-11-18': order('sub_s1_2026-11-18', '2026-11-18', { paymentStatus: 'completed', delayedOrderStatus: 'completed' }),
        'sub_s1_2026-11-25': order('sub_s1_2026-11-25', '2026-11-25'),
      },
      todayKey: today,
    });
    expect(result.state).toBe(SUBSCRIBER_STATES.OPEN);
    expect(result.order.id).toBe('sub_s1_2026-11-25');
    expect(result.deliveryDate).toBe('2026-11-25');
  });

  test('no upcoming order yet: waiting for the next delivery date', () => {
    const result = deriveSubscriberDelivery({ subscriptions: [sub({ orderIds: [] })], ordersById: {}, todayKey: today });
    expect(result.state).toBe(SUBSCRIBER_STATES.AWAITING);
    expect(result.deliveryDate).toBe('2026-12-02');
  });

  test('a skipped generated order shows as skipped with the next date', () => {
    const result = deriveSubscriberDelivery({
      subscriptions: [sub()],
      ordersById: { 'sub_s1_2026-11-25': order('sub_s1_2026-11-25', '2026-11-25', { paymentStatus: 'canceled', delayedOrderStatus: 'canceled' }) },
      todayKey: today,
    });
    expect(result.state).toBe(SUBSCRIBER_STATES.SKIPPED);
    expect(result.skippedDate).toBe('2026-11-25');
    expect(result.nextDeliveryDate).toBe('2026-12-02');
    expect(result.order).toBeNull();
  });

  test('a skip before the order exists has no known next date', () => {
    const result = deriveSubscriberDelivery({
      subscriptions: [sub({ orderIds: [], skipDates: ['2026-12-02'] })],
      ordersById: {},
      todayKey: today,
    });
    expect(result.state).toBe(SUBSCRIBER_STATES.SKIPPED);
    expect(result.skippedDate).toBe('2026-12-02');
    expect(result.nextDeliveryDate).toBe('');
  });

  test('an order being weighed or charged is closed and read-only', () => {
    const result = deriveSubscriberDelivery({
      subscriptions: [sub()],
      ordersById: { 'sub_s1_2026-11-25': order('sub_s1_2026-11-25', '2026-11-25', { paymentStatus: 'settling', delayedOrderStatus: 'settling' }) },
      todayKey: today,
    });
    expect(result.state).toBe(SUBSCRIBER_STATES.CLOSED);
  });

  test('with two active subscriptions the nearest delivery wins', () => {
    const result = deriveSubscriberDelivery({
      subscriptions: [sub({ id: 'later', orderIds: [], nextDeliveryDate: '2026-12-09' }), sub({ id: 'sooner', orderIds: [], nextDeliveryDate: '2026-11-26' })],
      ordersById: {},
      todayKey: today,
    });
    expect(result.subscription.id).toBe('sooner');
  });
});

describe('orderToCartItems', () => {
  test('lines become cart items; removed and empty lines are left out; one item per product', () => {
    const items = orderToCartItems({
      customerExcludedLineIds: { 'gone-line': true },
      orderBreakdown: {
        f2: { businessId: 'b2', items: [line('tomato', 0.5, { lineId: 'gone-line' }), line('broccoli', 1, { lineId: 'b-line', measurementType: 'unit' })] },
        f1: { businessId: 'b1', items: [line('cucumber', 1), line('cucumber', 0.5, { lineId: 'extra' }), line('zero', 0, { lineId: 'z' })] },
      },
    }, { lockedFormIds: new Set(['f2']) });
    expect(items.map((item) => [item.id, item.quantity, item.orderId, item.locked])).toEqual([
      ['cucumber', 1.5, 'f1', false],
      ['broccoli', 1, 'f2', true],
    ]);
    expect(items[0].key).toBe(subscriptionItemKey('cucumber', ''));
    expect(items[0].selectedOption).toBe('');
  });

  test('each item keeps where it came from: the recurring basket or this delivery only', () => {
    const items = orderToCartItems({
      orderBreakdown: {
        f1: {
          businessId: 'b1',
          items: [
            line('cucumber', 1, { subscriptionLineSource: 'basket' }),
            line('broccoli', 1, { lineId: 'added', subscriptionLineSource: 'customer_added' }),
            line('tomato', 1, { lineId: 'old' }),
            // The same product from both: it is in the recurring basket.
            line('pepper', 1, { lineId: 'p1', subscriptionLineSource: 'customer_added' }),
            line('pepper', 1, { lineId: 'p2', subscriptionLineSource: 'basket' }),
          ],
        },
      },
    });
    expect(items.map((item) => [item.id, item.source])).toEqual([
      ['cucumber', 'basket'],
      ['broccoli', 'customer_added'],
      ['tomato', 'basket'],
      ['pepper', 'basket'],
    ]);
  });
});

describe('orderToCartItems with a shared promotion', () => {
  test('the order price of a linked pair is what the cart shows', () => {
    const items = orderToCartItems({
      orderBreakdown: {
        f1: {
          businessId: 'b1',
          items: [
            line('red', 1, { lineId: 'r', measurementType: 'package', price: 20, basePrice: 22.5, groupPromotionApplied: true, groupPromotionLabel: '' }),
            line('blue', 1, { lineId: 'u', measurementType: 'package', price: 30, basePrice: 30 }),
          ],
        },
      },
    });
    expect(items[0]).toEqual(expect.objectContaining({ price: 22.5, effectivePrice: 20, groupPromotionApplied: true }));
    expect(getEstimatedLineTotal(items[0])).toBe(20);
    expect(items[1].effectivePrice).toBeUndefined();
  });
});

describe('applyPendingQuantities', () => {
  const items = orderToCartItems(order('o', '2026-11-25'));

  test('a pending change shows right away and a pending 0 hides the item', () => {
    const key = subscriptionItemKey('cucumber', '');
    expect(applyPendingQuantities(items, { [key]: { quantity: 2 } })[0]).toEqual(expect.objectContaining({ quantity: 2, saving: true }));
    expect(applyPendingQuantities(items, { [key]: { quantity: 0 } })).toEqual([]);
  });

  test('a pending new product is added', () => {
    const key = subscriptionItemKey('broccoli', '');
    const result = applyPendingQuantities(items, { [key]: { quantity: 1, item: { id: 'broccoli', name: 'ברוקולי', measurementType: 'unit' } } });
    expect(result.map((item) => item.id)).toEqual(['cucumber', 'broccoli']);
  });
});

test('labels for the banner', () => {
  expect(describeDeliveryPlace({ community: 'אור הנר', deliveryOption: 'pickup' })).toBe('איסוף באור הנר');
  expect(describeDeliveryPlace({ community: 'אור הנר', deliveryOption: 'homeDelivery' })).toBe('משלוח עד הבית');
  expect(formatDeliveryDay('2026-11-25')).toMatch(/25\.11$/);
  expect(formatDeliveryDay('2026-11-25')).toContain('רביעי');
});

test('the final amount appears only after weighing', () => {
  expect(getWeighedAmount({ paymentStatus: 'held' })).toBeNull();
  expect(getWeighedAmount({ paymentStatus: 'completed', subscriptionPayment: { chargedSum: 87.4 } })).toBe(87.4);
});
