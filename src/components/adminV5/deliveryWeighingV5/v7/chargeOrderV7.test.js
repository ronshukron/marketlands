jest.mock('../apiV7', () => ({
  chargeSubscriptionOrderV7: jest.fn(),
  handleSuspendedPaymentV7: jest.fn(),
  prepareCommunityDiscountForSettlementV7: jest.fn(),
  setPackedCartonCountV7: jest.fn(),
}));
jest.mock('../realtimeStateV7', () => ({
  buildStationAuditV7: jest.fn((session, updatedAtIso) => ({
    stationId: session?.stationId || '',
    sessionId: session?.sessionId || '',
    userId: session?.userId || null,
    userName: session?.userName || '',
    updatedAtIso,
  })),
  clearOrderDraftV7: jest.fn(),
  saveOrderDraftV7: jest.fn(),
}));

import { settleAndChargeOrderV7, buildCompletedOrderStatePatch, buildChargeCeilingConfirmText } from './chargeOrderV7';

const order = {
  id: 'order-7',
  packedCartonCount: 0,
  delayedMeta: { paymentStatus: 'held' },
  rawData: { paymentStatus: 'held', delayedOrderStatus: 'pending_weighing' },
};
const items = [{
  lineId: 'line-a',
  productId: 'a',
  productName: 'Tomato',
  requestedQuantity: 1,
  pricePerUnit: 10,
  measurementType: 'package',
  catalogNumber: '100',
  vatType: 3,
}];
const draft = {
  weightsByLineId: { 'line-a': { actualQuantity: 1, source: 'package' } },
  removedLineIds: {},
};
const session = { sessionId: 'user::station', stationId: 'station', userId: 'user', userName: 'Admin' };

const buildDeps = (overrides = {}) => ({
  saveOrderDraft: jest.fn().mockResolvedValue(undefined),
  prepareCommunityDiscount: jest.fn().mockResolvedValue({ preparedItems: items }),
  handleSuspendedPayment: jest.fn().mockResolvedValue({ ok: true }),
  setPackedCartonCount: jest.fn().mockResolvedValue({ ok: true }),
  clearOrderDraft: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('settleAndChargeOrderV7', () => {
  test('charges after saving settling status and does not revert after payment succeeds', async () => {
    const deps = buildDeps();
    const result = await settleAndChargeOrderV7({
      order,
      items,
      draft,
      session,
      weekKey: '2026-08-09',
      communityDiscount: { percent: 10 },
      ...deps,
    });

    expect(deps.saveOrderDraft).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-7',
      draftPatch: { status: 'settling' },
    }));
    expect(deps.prepareCommunityDiscount).toHaveBeenCalledTimes(1);
    expect(deps.handleSuspendedPayment).toHaveBeenCalledTimes(1);
    expect(deps.clearOrderDraft).toHaveBeenCalledWith({ weekKey: '2026-08-09', orderId: 'order-7' });
    expect(result.orderId).toBe('order-7');
    expect(result.payload.finalSum).toBe(9);
    expect(result.completedWeighing.finalSum).toBe(9);
  });

  test('prepares the weekly promotion before charging and keeps it out of the community discount', async () => {
    const weeklyPromotion = {
      promotionId: 'promo-1',
      communityCode: 'north',
      lines: [{ lineId: 'line-a', productId: 'a', promotionPrice: 6 }],
      estimatedSavings: 4,
    };
    const promoItems = [{ ...items[0], pricePerUnit: 6, communityWeeklyPromotionApplied: true }];
    const deps = buildDeps({
      prepareWeeklyPromotion: jest.fn().mockResolvedValue({
        fingerprint: 'fp',
        preparation: { lineIds: ['line-a'], estimatedSavings: 4 },
        preparedItems: promoItems,
      }),
      prepareCommunityDiscount: jest.fn().mockResolvedValue({ preparedItems: promoItems }),
    });
    const result = await settleAndChargeOrderV7({
      order,
      items,
      draft,
      session,
      weekKey: '2026-08-09',
      communityDiscount: { percent: 10 },
      communityWeeklyPromotion: weeklyPromotion,
      ...deps,
    });

    expect(deps.prepareWeeklyPromotion).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-7',
      weeklyPromotion,
    }));
    expect(deps.prepareWeeklyPromotion.mock.invocationCallOrder[0])
      .toBeLessThan(deps.prepareCommunityDiscount.mock.invocationCallOrder[0]);
    expect(result.payload.finalSum).toBe(6);
    expect(result.completedWeighing.communityWeeklyPromotion).toEqual(expect.objectContaining({
      promotionId: 'promo-1',
      lineIds: ['line-a'],
    }));
  });

  test('does not charge or clear the draft when discount preparation fails', async () => {
    const deps = buildDeps({
      prepareCommunityDiscount: jest.fn().mockRejectedValue(new Error('prepare failed')),
    });

    await expect(settleAndChargeOrderV7({
      order,
      items,
      draft,
      session,
      weekKey: '2026-08-09',
      communityDiscount: { percent: 10 },
      ...deps,
    })).rejects.toThrow('prepare failed');

    expect(deps.handleSuspendedPayment).not.toHaveBeenCalled();
    expect(deps.clearOrderDraft).not.toHaveBeenCalled();
  });

  test('does not clear the draft when payment fails so the order stays retryable', async () => {
    const deps = buildDeps({
      handleSuspendedPayment: jest.fn().mockRejectedValue(new Error('grow timeout')),
    });

    await expect(settleAndChargeOrderV7({
      order,
      items,
      draft,
      session,
      weekKey: '2026-08-09',
      ...deps,
    })).rejects.toThrow('grow timeout');

    expect(deps.clearOrderDraft).not.toHaveBeenCalled();
  });

  test('409 missing_grow_hold does not mark the order completed', async () => {
    const missingHoldError = Object.assign(new Error('Request failed with status code 409'), {
      response: {
        status: 409,
        data: {
          status: 0,
          err: {
            message: 'חסר אישור Grow להזמנה זו',
            code: 'missing_grow_hold',
            state: 'abandoned',
          },
          error: {
            code: 'missing_grow_hold',
            message: 'חסר אישור Grow להזמנה זו',
            state: 'abandoned',
          },
        },
      },
    });
    const deps = buildDeps({
      handleSuspendedPayment: jest.fn().mockRejectedValue(missingHoldError),
    });

    await expect(settleAndChargeOrderV7({
      order,
      items,
      draft,
      session,
      weekKey: '2026-08-09',
      ...deps,
    })).rejects.toBe(missingHoldError);

    expect(deps.clearOrderDraft).not.toHaveBeenCalled();
    expect(deps.handleSuspendedPayment).toHaveBeenCalledTimes(1);
  });

  test('still returns success if clearing the draft fails after payment', async () => {
    const deps = buildDeps({
      clearOrderDraft: jest.fn().mockRejectedValue(new Error('draft clear failed')),
    });

    const result = await settleAndChargeOrderV7({
      order,
      items,
      draft,
      session,
      weekKey: '2026-08-09',
      ...deps,
    });

    expect(result.orderId).toBe('order-7');
    expect(deps.handleSuspendedPayment).toHaveBeenCalledTimes(1);
  });

  test('charges subscription orders on the saved card instead of the J5 hold', async () => {
    const subscriptionOrder = { ...order, isSubscriptionOrder: true };
    const deps = buildDeps({ chargeSubscriptionOrder: jest.fn().mockResolvedValue({ ok: true }) });

    await settleAndChargeOrderV7({
      order: subscriptionOrder,
      items,
      draft,
      session,
      weekKey: '2026-08-09',
      ...deps,
    });

    expect(deps.chargeSubscriptionOrder).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order-7' }));
    expect(deps.handleSuspendedPayment).not.toHaveBeenCalled();
  });

  describe('subscription charge ceiling', () => {
    const ceilingError = () => Object.assign(new Error('Request failed with status code 422'), {
      response: {
        status: 422,
        data: { status: 0, err: { code: 'amount_above_ceiling', message: 'above', total: 61.5, estimate: 40, ceiling: 60 } },
      },
    });
    const subscriptionOrder = { ...order, isSubscriptionOrder: true };
    const run = (deps) => settleAndChargeOrderV7({
      order: subscriptionOrder, items, draft, session, weekKey: '2026-08-09', ...deps,
    });

    test('asks the admin and resends with the confirmed amount', async () => {
      const chargeSubscriptionOrder = jest.fn()
        .mockRejectedValueOnce(ceilingError())
        .mockResolvedValueOnce({ status: 1 });
      const confirmSubscriptionAboveCeiling = jest.fn().mockResolvedValue(true);
      await run(buildDeps({ chargeSubscriptionOrder, confirmSubscriptionAboveCeiling }));

      expect(confirmSubscriptionAboveCeiling).toHaveBeenCalledWith(expect.objectContaining({ total: 61.5, estimate: 40, ceiling: 60 }));
      expect(chargeSubscriptionOrder).toHaveBeenCalledTimes(2);
      expect(chargeSubscriptionOrder.mock.calls[0][0].confirmedChargeTotal).toBeUndefined();
      expect(chargeSubscriptionOrder.mock.calls[1][0]).toEqual(expect.objectContaining({ orderId: 'order-7', confirmedChargeTotal: 61.5 }));
    });

    test('does not charge when the admin declines', async () => {
      const chargeSubscriptionOrder = jest.fn().mockRejectedValue(ceilingError());
      const deps = buildDeps({ chargeSubscriptionOrder, confirmSubscriptionAboveCeiling: jest.fn().mockResolvedValue(false) });
      await expect(run(deps)).rejects.toThrow('422');
      expect(chargeSubscriptionOrder).toHaveBeenCalledTimes(1);
      expect(deps.clearOrderDraft).not.toHaveBeenCalled();
    });

    test('batch charging (no confirm callback) fails the order instead of charging it', async () => {
      const chargeSubscriptionOrder = jest.fn().mockRejectedValue(ceilingError());
      await expect(run(buildDeps({ chargeSubscriptionOrder }))).rejects.toThrow('422');
      expect(chargeSubscriptionOrder).toHaveBeenCalledTimes(1);
    });

    test('the confirmation says how far above the estimate the charge is', () => {
      const text = buildChargeCeilingConfirmText({ total: 46.5, estimate: 40 });
      expect(text.heText).toContain('₪46.50');
      expect(text.heText).toContain('גבוה ב-16% מההערכה');
      expect(text.heText).toContain('₪40.00');
      expect(text.thText).toContain('16%');
      expect(buildChargeCeilingConfirmText({ total: 10, estimate: 0 }).heText).toContain('גבוה מההערכה');
    });

    test('other charge errors are not turned into a confirmation', async () => {
      const declined = Object.assign(new Error('402'), { response: { status: 402, data: { err: { code: 'declined' } } } });
      const confirmSubscriptionAboveCeiling = jest.fn();
      await expect(run(buildDeps({
        chargeSubscriptionOrder: jest.fn().mockRejectedValue(declined),
        confirmSubscriptionAboveCeiling,
      }))).rejects.toThrow('402');
      expect(confirmSubscriptionAboveCeiling).not.toHaveBeenCalled();
    });
  });

  test('regular delayed orders never use the subscription charge', async () => {
    const deps = buildDeps({ chargeSubscriptionOrder: jest.fn() });
    await settleAndChargeOrderV7({ order, items, draft, session, weekKey: '2026-08-09', ...deps });
    expect(deps.chargeSubscriptionOrder).not.toHaveBeenCalled();
    expect(deps.handleSuspendedPayment).toHaveBeenCalledTimes(1);
  });
});

describe('charging at the card hold (chargeCap)', () => {
  // Two packages at 30 and 40 = 70; the hold is 60.
  const capItems = [
    { ...items[0], lineId: 'line-a', pricePerUnit: 30 },
    { ...items[0], lineId: 'line-b', productId: 'b', pricePerUnit: 40, catalogNumber: '101' },
  ];
  const capDraft = { weightsByLineId: {}, removedLineIds: {} };
  const run = (overrides, deps = buildDeps()) => settleAndChargeOrderV7({
    order,
    items: capItems,
    draft: capDraft,
    session,
    weekKey: '2026-08-09',
    ...overrides,
    ...deps,
  }).then((result) => ({ result, deps }));

  test('the cap reaches the payload sent to the server, lines and total', async () => {
    const { result, deps } = await run({ chargeCap: 60 });
    const sent = deps.handleSuspendedPayment.mock.calls[0][0];
    expect(sent.finalSum).toBe(60);
    expect(sent.holdCap).toEqual({ max: 60, originalSum: 70, reducedBy: 10 });
    expect(sent.productDataForGrow['productData[0][price]'] + sent.productDataForGrow['productData[1][price]']).toBeCloseTo(60, 2);
    expect(result.completedWeighing).toEqual(expect.objectContaining({ finalSum: 60, holdCap: sent.holdCap }));
  });

  test('without a cap the weighed total is sent as before', async () => {
    const { deps } = await run({});
    const sent = deps.handleSuspendedPayment.mock.calls[0][0];
    expect(sent.finalSum).toBe(70);
    expect(sent.holdCap).toBeUndefined();
  });

  test('the cap is kept when the community discount is prepared and the payload is rebuilt', async () => {
    const deps = buildDeps({ prepareCommunityDiscount: jest.fn().mockResolvedValue({ preparedItems: capItems }) });
    await run({ chargeCap: 60, communityDiscount: { percent: 10 } }, deps);
    const sent = deps.handleSuspendedPayment.mock.calls[0][0];
    // 70 - 10% = 63, still above 60. The discount's own numbers are not touched by the cap.
    expect(sent.communityDiscount).toEqual(expect.objectContaining({ preDiscountTotal: 70, amount: 7, finalTotal: 63 }));
    expect(sent.finalSum).toBe(60);
    expect(sent.holdCap).toEqual({ max: 60, originalSum: 63, reducedBy: 3 });
  });

  test('a weekly-basket order ignores the cap and keeps the ceiling path', async () => {
    const deps = buildDeps({ chargeSubscriptionOrder: jest.fn().mockResolvedValue({ ok: true }) });
    await run({ order: { ...order, isSubscriptionOrder: true }, chargeCap: 60 }, deps);
    const sent = deps.chargeSubscriptionOrder.mock.calls[0][0];
    expect(sent.finalSum).toBe(70);
    expect(sent.holdCap).toBeUndefined();
    expect(deps.handleSuspendedPayment).not.toHaveBeenCalled();
  });
});

describe('carton count at charge', () => {
  const charge = (orderOverrides, printedCartonCount, deps = buildDeps()) => settleAndChargeOrderV7({
    order: { ...order, ...orderOverrides },
    printedCartonCount,
    items,
    draft,
    session,
    weekKey: '2026-08-09',
    ...deps,
  }).then((result) => ({ result, deps }));

  test('a count the station printed but could not save yet is saved with the charge', async () => {
    const { result, deps } = await charge({ packedCartonCount: 1 }, 3);
    expect(deps.setPackedCartonCount).toHaveBeenCalledWith({ orderId: 'order-7', printedIndex: 3 });
    expect(result.packedCartonCount).toBe(3);
  });

  test('the order count wins when it is higher (another station printed more)', async () => {
    const { result, deps } = await charge({ packedCartonCount: 4, rawData: { ...order.rawData, packedCartonCount: 4 } }, 2);
    expect(deps.setPackedCartonCount).toHaveBeenCalledWith({ orderId: 'order-7', printedIndex: 4 });
    expect(result.packedCartonCount).toBe(4);
  });

  test('no labels printed: no count is written', async () => {
    const { result, deps } = await charge({ packedCartonCount: 0 }, 0);
    expect(deps.setPackedCartonCount).not.toHaveBeenCalled();
    expect(result.packedCartonCount).toBe(0);
  });
});

describe('buildCompletedOrderStatePatch', () => {
  test('marks payment complete only after a successful charge payload exists', () => {
    const patched = buildCompletedOrderStatePatch(order, {
      packedCartonCount: 2,
      completedWeighing: { finalSum: 9, completedAtIso: '2026-08-09T00:00:00.000Z' },
    });
    expect(patched.status).toBe('completed');
    expect(patched.delayedMeta.paymentStatus).toBe('completed');
    expect(patched.rawData.weighing.finalSum).toBe(9);
    expect(patched.packedCartonCount).toBe(2);
  });
});
