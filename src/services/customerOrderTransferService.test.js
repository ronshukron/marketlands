import {
  buildDeliveryTransferUpdate,
  resolveTransferPickupSpot,
} from './customerOrderTransferService';

const order = {
  deliveryDate: '2026-10-06',
  deliveryWeekKey: '2026-10-04',
  community: 'אור הנר',
  pickupSpot: 'אור הנר',
  pickupSpotName: 'אור הנר',
  customerDetails: {
    name: 'דנה',
    pickupSpot: 'אור הנר',
    deliveryDate: '2026-10-06',
  },
  fulfillment: {
    community: 'אור הנר',
    deliveryDate: '2026-10-06',
    deliveryWeekKey: '2026-10-04',
  },
  orderBreakdown: {
    'order-a': {
      businessName: 'עסק א',
      community: 'אור הנר',
      deliveryDate: '2026-10-06',
      items: [{ productName: 'עגבנייה', quantity: 1 }],
    },
  },
};

describe('delivery transfer pickup spot', () => {
  test('keeps the current community when no pickup spot is provided', () => {
    const payload = buildDeliveryTransferUpdate(order, '2026-10-13', 'admin-1');

    expect(payload.community).toBe('אור הנר');
    expect(payload.customerDetails.pickupSpot).toBe('אור הנר');
    expect(payload.fulfillment.community).toBe('אור הנר');
    expect(payload.orderBreakdown['order-a'].community).toBe('אור הנר');
    expect(payload.deliveryDate).toBe('2026-10-13');
    expect(payload.deliveryWeekKey).toBe('2026-10-11');
    expect(payload.adminDeliveryTransferredBy).toBe('admin-1');
  });

  test('updates community, pickup spot, fulfillment, and breakdown together', () => {
    const payload = buildDeliveryTransferUpdate(order, '2026-10-13', 'admin-1', {
      newPickupSpot: 'ניצנים',
    });

    expect(payload.community).toBe('ניצנים');
    expect(payload.pickupSpot).toBe('ניצנים');
    expect(payload.pickupSpotName).toBe('ניצנים');
    expect(payload.customerDetails).toMatchObject({
      name: 'דנה',
      pickupSpot: 'ניצנים',
      deliveryDate: '2026-10-13',
    });
    expect(payload.fulfillment).toMatchObject({
      community: 'ניצנים',
      deliveryDate: '2026-10-13',
      deliveryWeekKey: '2026-10-11',
    });
    expect(payload.orderBreakdown['order-a']).toMatchObject({
      businessName: 'עסק א',
      community: 'ניצנים',
      deliveryDate: '2026-10-13',
      deliveryWeekKey: '2026-10-11',
    });
  });

  test('resolves a requested pickup spot independently of the current community', () => {
    expect(resolveTransferPickupSpot(order, 'ניצנים')).toBe('ניצנים');
    expect(resolveTransferPickupSpot(order, '  ')).toBe('אור הנר');
  });
});
