import {
  filterCustomerActiveLines,
  isCustomerBusinessLineEditable,
  isCustomerLineExcluded,
  isCustomerOrderOwner,
  isCustomerOrderStatusEditable,
  isSuccessfulDelayedCustomerOrder,
  isSuccessfulRegularCustomerOrder,
} from './customerOrderUtils';
import { getLegacyCustomerOrderIds } from '../services/customerOrderService';

describe('customer order ownership', () => {
  test('requires an exact, non-empty owner UID match', () => {
    expect(isCustomerOrderOwner({ userId: 'owner-1' }, 'owner-1')).toBe(true);
    expect(isCustomerOrderOwner({ userId: 'owner-1' }, 'owner-2')).toBe(false);
    expect(isCustomerOrderOwner({}, 'owner-1')).toBe(false);
    expect(isCustomerOrderOwner({ userId: 'owner-1' }, '')).toBe(false);
  });

  test('accepts only the legacy string-ID list shape', () => {
    expect(getLegacyCustomerOrderIds({ orders: ['one', '', null, 'two'] })).toEqual(['one', 'two']);
    expect(getLegacyCustomerOrderIds({ orders: { business: [{ orderId: 'independent' }] } })).toEqual([]);
  });
});

describe('customer business-line cutoff', () => {
  const editableCustomerOrder = {
    userId: 'owner-1',
    paymentStatus: 'held',
    delayedOrderStatus: 'pending_weighing',
  };

  test('uses the business community ending time for classic orders', () => {
    const businessOrderData = {
      orderType: 'one_time',
      endingTimeByPickupSpot: {
        CommunityA: '2026-07-20T12:00:00.000Z',
      },
    };

    expect(isCustomerBusinessLineEditable({
      customerOrder: editableCustomerOrder,
      businessOrderData,
      pickupSpot: 'CommunityA',
      now: new Date('2026-07-20T11:59:59.000Z'),
    })).toBe(true);

    expect(isCustomerBusinessLineEditable({
      customerOrder: editableCustomerOrder,
      businessOrderData,
      pickupSpot: 'CommunityA',
      now: new Date('2026-07-20T12:00:00.000Z'),
    })).toBe(false);
  });

  test('uses the existing delivery cutoff for always-on lines', () => {
    const deliverySchedule = {
      active: true,
      defaultCutoff: { hoursBeforeDelivery: 24 },
    };
    const businessOrderData = {
      orderMode: 'always_on_grocery',
      alwaysOn: true,
    };

    expect(isCustomerBusinessLineEditable({
      customerOrder: editableCustomerOrder,
      businessOrderData,
      deliveryDate: '2026-07-22',
      deliverySchedule,
      pickupSpot: 'CommunityA',
      now: new Date('2026-07-21T20:00:00.000Z'),
    })).toBe(true);

    expect(isCustomerBusinessLineEditable({
      customerOrder: editableCustomerOrder,
      businessOrderData,
      deliveryDate: '2026-07-22',
      deliverySchedule,
      pickupSpot: 'CommunityA',
      now: new Date('2026-07-22T00:00:00.000Z'),
    })).toBe(false);
  });

  test('fails closed without business metadata or an established cutoff', () => {
    expect(isCustomerBusinessLineEditable({
      customerOrder: editableCustomerOrder,
      businessOrderData: null,
    })).toBe(false);
    expect(isCustomerBusinessLineEditable({
      customerOrder: editableCustomerOrder,
      businessOrderData: { orderType: 'one_time' },
    })).toBe(false);
  });
});

describe('customer order status normalization', () => {
  test('accepts only successful regular and delayed states', () => {
    expect(isSuccessfulRegularCustomerOrder({ paymentStatus: 'paid' })).toBe(true);
    expect(isSuccessfulRegularCustomerOrder({ paymentStatus: 'completed' })).toBe(true);
    expect(isSuccessfulRegularCustomerOrder({ paymentStatus: 'pending_payment' })).toBe(false);

    expect(isSuccessfulDelayedCustomerOrder({
      paymentStatus: 'held',
      delayedOrderStatus: 'pending-weighing',
    })).toBe(true);
    expect(isSuccessfulDelayedCustomerOrder({
      paymentStatus: 'held',
      delayedOrderStatus: 'created_in_fe',
    })).toBe(false);
    expect(isSuccessfulDelayedCustomerOrder({
      paymentStatus: 'cancelled',
      delayedOrderStatus: 'settled',
    })).toBe(false);
  });

  test('allows paid regular orders and authorized delayed orders before cutoff', () => {
    expect(isCustomerOrderStatusEditable({
      isDelayedOrder: true,
      paymentStatus: 'held',
      delayedOrderStatus: 'pending_weighing',
    })).toBe(true);
    expect(isCustomerOrderStatusEditable({ paymentStatus: 'completed' })).toBe(true);
    expect(isCustomerOrderStatusEditable({ paymentStatus: 'paid' })).toBe(true);
    expect(isCustomerOrderStatusEditable({ paymentStatus: 'pending_payment' })).toBe(false);
    expect(isCustomerOrderStatusEditable({
      isDelayedOrder: true,
      paymentStatus: 'completed',
      delayedOrderStatus: 'completed',
    })).toBe(false);
    expect(isCustomerOrderStatusEditable({
      paymentStatus: 'held',
      delayedOrderStatus: 'cancelled_by_admin',
    })).toBe(false);
  });
});

describe('customer line exclusions', () => {
  const order = { customerExcludedLineIds: { removed: true } };
  const lines = [{ lineId: 'active' }, { lineId: 'removed' }];

  test('recognizes exclusions and returns only active lines', () => {
    expect(isCustomerLineExcluded(order, 'removed')).toBe(true);
    expect(isCustomerLineExcluded(order, lines[0])).toBe(false);
    expect(filterCustomerActiveLines(order, lines)).toEqual([{ lineId: 'active' }]);
  });
});
