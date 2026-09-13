import {
  handleSuspendedPaymentV7,
  prepareCommunityDiscountForSettlementV7,
  setPackedCartonCountV7,
} from '../apiV7';
import {
  buildStationAuditV7,
  clearOrderDraftV7,
  saveOrderDraftV7,
} from '../realtimeStateV7';
import { buildSettlementPayload } from './orderDraftUtils';

function nowIso() {
  return new Date().toISOString();
}

function packedCartonCountFromOrder(order) {
  return Math.max(
    0,
    Math.floor(Number(order?.packedCartonCount) || 0),
    Math.floor(Number(order?.rawData?.packedCartonCount) || 0),
  );
}

export function buildCompletedOrderStatePatch(order, {
  packedCartonCount = 0,
  completedWeighing = {},
} = {}) {
  return {
    ...order,
    status: 'completed',
    ...(packedCartonCount > 0 ? { packedCartonCount } : {}),
    delayedMeta: {
      ...(order.delayedMeta || {}),
      paymentStatus: 'completed',
      delayedOrderStatus: 'completed',
    },
    rawData: {
      ...(order.rawData || {}),
      paymentStatus: 'completed',
      delayedOrderStatus: 'completed',
      ...(packedCartonCount > 0 ? { packedCartonCount } : {}),
      weighing: {
        ...((order.rawData || {}).weighing || {}),
        ...completedWeighing,
      },
    },
  };
}

export async function settleAndChargeOrderV7({
  order,
  items,
  draft,
  session,
  weekKey,
  communityDiscount = null,
  saveOrderDraft = saveOrderDraftV7,
  prepareCommunityDiscount = prepareCommunityDiscountForSettlementV7,
  handleSuspendedPayment = handleSuspendedPaymentV7,
  setPackedCartonCount = setPackedCartonCountV7,
  clearOrderDraft = clearOrderDraftV7,
} = {}) {
  if (!order?.id) throw new Error('Order ID is required.');
  if (!weekKey) throw new Error('Week key is required.');

  await saveOrderDraft({
    weekKey,
    orderId: order.id,
    draftPatch: { status: 'settling' },
    session,
  });
  const settlingDraft = {
    ...(draft || {}),
    status: 'settling',
  };
  const completedAtIso = nowIso();
  const weighingAudit = {
    ...buildStationAuditV7(session, completedAtIso),
    finalizedAtIso: completedAtIso,
    source: 'delivery-v7',
  };

  let payload = buildSettlementPayload({
    selectedOrder: order,
    items,
    draft: settlingDraft,
    weighingAudit,
    communityDiscount,
  });
  const appliedDiscount = payload.communityDiscount ? communityDiscount : null;
  if (appliedDiscount) {
    const preparationResult = await prepareCommunityDiscount({
      orderId: order.id,
      communityDiscount: payload.communityDiscount,
      removedLineIds: payload.removedLineIds,
      session,
    });
    payload = buildSettlementPayload({
      selectedOrder: order,
      items: preparationResult.preparedItems || items,
      draft: settlingDraft,
      weighingAudit,
      communityDiscount: appliedDiscount,
    });
  }

  await handleSuspendedPayment(payload);

  const packedCartonCount = packedCartonCountFromOrder(order);
  if (packedCartonCount > 0) {
    try {
      await setPackedCartonCount({
        orderId: order.id,
        printedIndex: packedCartonCount,
      });
    } catch (error) {
      console.error(error);
    }
  }

  const completedWeighing = {
    weightsByLineId: payload.weightsByLineId || {},
    removedLineIds: payload.removedLineIds || {},
    finalInvoiceLines: payload.finalInvoiceLines || [],
    finalSum: payload.finalSum,
    completedAtIso,
    ...(payload.communityDiscount ? { communityDiscount: payload.communityDiscount } : {}),
    weighingAudit: payload.weighingAudit || weighingAudit,
  };

  try {
    await clearOrderDraft({ weekKey, orderId: order.id });
  } catch (error) {
    console.error(error);
  }

  return {
    orderId: order.id,
    packedCartonCount,
    completedWeighing,
    settlingDraft,
    payload,
  };
}
