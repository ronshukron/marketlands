jest.mock('../apiV7', () => ({
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

import { settleAndChargeOrderV7, buildCompletedOrderStatePatch } from './chargeOrderV7';

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
