import { buildStableLineId } from '../components/adminV5/deliveryWeighingV5/v7/orderDraftUtils';
import {
  MANUAL_REASONS,
  buildV7RefundDiscountPlan,
} from './refundApprovalService';

const orderId = 'order-1';
const businessOrderKey = 'business-1';
const lineId = buildStableLineId({
  orderId,
  businessOrderKey,
  productId: 'product-1',
  lineSeed: 's0',
});

const buildOrder = (overrides = {}) => ({
  paymentStatus: 'held',
  delayedOrderStatus: 'pending_weighing',
  customerDetails: { deliveryDetails: { deliveryFee: 10 } },
  orderBreakdown: {
    [businessOrderKey]: {
      businessId: 'business-id',
      items: [{
        productId: 'product-1',
        productName: 'Tomato',
        lineSeed: 's0',
        quantity: 2,
        price: 20,
      }],
    },
  },
  ...overrides,
});

const refundItems = [{
  lineId,
  productId: 'product-1',
  lineTotal: 40,
  refundPercent: 50,
  refundAmount: 20,
}];

describe('buildV7RefundDiscountPlan', () => {
  test('discounts matching lines and recomputes V7 totals', () => {
    const plan = buildV7RefundDiscountPlan({
      orderId,
      orderData: buildOrder(),
      refundId: 'refund-1',
      refundItems,
    });

    expect(plan.canApply).toBe(true);
    expect(plan.orderBreakdown[businessOrderKey].items[0].price).toBe(10);
    expect(plan.orderBreakdown[businessOrderKey].items[0].refundOriginalUnitPrice).toBe(20);
    expect(plan.grandTotal).toBe(30);
  });

  test('does not apply the same request twice', () => {
    const first = buildV7RefundDiscountPlan({
      orderId,
      orderData: buildOrder(),
      refundId: 'refund-1',
      refundItems,
    });
    const second = buildV7RefundDiscountPlan({
      orderId,
      orderData: buildOrder({ orderBreakdown: first.orderBreakdown }),
      refundId: 'refund-1',
      refundItems,
    });

    expect(second.orderBreakdown[businessOrderKey].items[0].price).toBe(10);
  });

  test('routes charged orders to manual refund', () => {
    const plan = buildV7RefundDiscountPlan({
      orderId,
      orderData: buildOrder({ paymentStatus: 'completed' }),
      refundId: 'refund-1',
      refundItems,
    });

    expect(plan).toEqual({
      canApply: false,
      reason: MANUAL_REASONS.ORDER_NOT_EDITABLE,
    });
  });

  test('routes basket components to manual refund', () => {
    const orderData = buildOrder();
    orderData.orderBreakdown[businessOrderKey].items[0].isBasketComponent = true;
    const plan = buildV7RefundDiscountPlan({
      orderId,
      orderData,
      refundId: 'refund-1',
      refundItems,
    });

    expect(plan).toEqual({
      canApply: false,
      reason: MANUAL_REASONS.UNSUPPORTED_LINE,
    });
  });
});
