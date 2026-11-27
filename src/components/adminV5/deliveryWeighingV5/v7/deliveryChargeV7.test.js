import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DeliveryChargeToggle, buildDeliveryInvoiceLine, getOrderDeliveryFee } from './deliveryChargeV7';
import { buildSettlementPayload } from './orderDraftUtils';

jest.mock('../apiV7', () => ({
  chargeSubscriptionOrderV7: jest.fn(),
  handleSuspendedPaymentV7: jest.fn(),
  prepareCommunityDiscountForSettlementV7: jest.fn(),
  setPackedCartonCountV7: jest.fn(),
}));
jest.mock('../realtimeStateV7', () => ({
  buildStationAuditV7: jest.fn(() => ({})),
  clearOrderDraftV7: jest.fn(),
  saveOrderDraftV7: jest.fn(),
}));

// eslint-disable-next-line import/first
import { settleAndChargeOrderV7 } from './chargeOrderV7';

const homeOrder = (extra = {}) => ({
  id: 'order-1',
  customerDetails: { deliveryOption: 'homeDelivery', deliveryDetails: { type: 'homeDelivery', deliveryFee: 30 } },
  ...extra,
});
const items = [{
  lineId: 'line-a', productId: 'a', productName: 'עגבנייה', requestedQuantity: 1, pricePerUnit: 50,
  measurementType: 'package', catalogNumber: '100', vatType: 3,
}];
const draft = { weightsByLineId: { 'line-a': { actualQuantity: 1, source: 'package' } }, removedLineIds: {} };

describe('getOrderDeliveryFee', () => {
  test('only home delivery has a fee, read from the order or its raw data', () => {
    expect(getOrderDeliveryFee(homeOrder())).toBe(30);
    expect(getOrderDeliveryFee({ rawData: homeOrder().customerDetails ? { customerDetails: homeOrder().customerDetails } : {} })).toBe(30);
    expect(getOrderDeliveryFee({ customerDetails: { deliveryOption: 'pickup', deliveryDetails: { deliveryFee: 30 } } })).toBe(0);
    expect(getOrderDeliveryFee(homeOrder({ customerDetails: { deliveryOption: 'homeDelivery', deliveryDetails: { deliveryFee: 0 } } }))).toBe(0);
    expect(getOrderDeliveryFee(null)).toBe(0);
  });
});

describe('the settlement with delivery', () => {
  test('not charged by default', () => {
    const payload = buildSettlementPayload({ selectedOrder: homeOrder(), items, draft });
    expect(payload.finalSum).toBe(50);
    expect(payload.finalInvoiceLines.some((line) => line.isDeliveryFee)).toBe(false);
  });

  test('when ticked: its own line, not discounted, inside the hold cap', () => {
    const payload = buildSettlementPayload({
      selectedOrder: homeOrder(), items, draft, communityDiscount: { percent: 10 }, deliveryFee: 30,
    });
    const delivery = payload.finalInvoiceLines.find((line) => line.isDeliveryFee);
    expect(delivery).toMatchObject({ linePrice: 30, catalogNumber: '118', productId: 'Mdean61FIezxRcMUZjVn' });
    expect(payload.finalSum).toBe(75); // 50 - 10% + 30
    expect(payload.productDataForGrow['productData[1][price]']).toBe(30);

    const capped = buildSettlementPayload({ selectedOrder: homeOrder(), items, draft, deliveryFee: 30, chargeCap: 60 });
    expect(capped.finalSum).toBe(60);
  });

  test('the delivery line itself', () => {
    expect(buildDeliveryInvoiceLine(25.5)).toMatchObject({ lineId: 'delivery-fee', linePrice: 25.5, actualQuantity: 1, isDeliveryFee: true });
  });
});

describe('settleAndChargeOrderV7 with delivery', () => {
  const deps = () => ({
    saveOrderDraft: jest.fn().mockResolvedValue(undefined),
    handleSuspendedPayment: jest.fn().mockResolvedValue({ ok: true }),
    chargeSubscriptionOrder: jest.fn().mockResolvedValue({ ok: true }),
    setPackedCartonCount: jest.fn().mockResolvedValue({ ok: true }),
    clearOrderDraft: jest.fn().mockResolvedValue(undefined),
  });
  const run = (order, extra, overrides) => settleAndChargeOrderV7({
    order, items, draft, session: { sessionId: 's' }, weekKey: '2026-11-29', ...overrides, ...extra,
  });

  test('a regular order gets the delivery line only when ticked', async () => {
    const plain = deps();
    await run(homeOrder(), {}, plain);
    expect(plain.handleSuspendedPayment.mock.calls[0][0].finalSum).toBe(50);

    const withDelivery = deps();
    await run(homeOrder(), { chargeDeliveryFee: true }, withDelivery);
    expect(withDelivery.handleSuspendedPayment.mock.calls[0][0].finalSum).toBe(80);
  });

  test('a weekly-basket order asks the server to add it, without a line of its own', async () => {
    const sub = homeOrder({ isSubscriptionOrder: true });
    const ticked = deps();
    await run(sub, { chargeDeliveryFee: true }, ticked);
    const payload = ticked.chargeSubscriptionOrder.mock.calls[0][0];
    expect(payload.chargeDeliveryFee).toBe(true);
    expect(payload.finalInvoiceLines.some((line) => line.isDeliveryFee)).toBe(false);

    const plain = deps();
    await run(sub, {}, plain);
    expect(plain.chargeSubscriptionOrder.mock.calls[0][0].chargeDeliveryFee).toBeUndefined();
  });
});

describe('DeliveryChargeToggle', () => {
  test('hidden without a fee; off by default; reports the change', () => {
    const { container, rerender } = render(<DeliveryChargeToggle fee={0} checked={false} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    const onChange = jest.fn();
    rerender(<DeliveryChargeToggle fee={30} checked={false} onChange={onChange} />);
    expect(screen.getByText('משלוח עד הבית ₪30.00')).toBeInTheDocument();
    const box = screen.getByRole('checkbox');
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
