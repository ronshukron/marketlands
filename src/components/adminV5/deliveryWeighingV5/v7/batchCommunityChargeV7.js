import { getNextUnweighedIndex } from './orderDraftUtils';

export const BATCH_CHARGE_SKIP_REASONS = Object.freeze({
  alreadyCompleted: 'already_completed',
  notWeighed: 'not_weighed',
  noItems: 'no_items',
  claimedElsewhere: 'claimed_elsewhere',
  conflict: 'conflict',
  pendingSync: 'pending_sync',
  offline: 'offline',
  stopped: 'stopped',
});

export function getOrderCommunityName(order) {
  return String(order?.pickupSpot || order?.customerDetails?.pickupSpot || '').trim();
}

export function getOrderDisplayName(order) {
  return String(order?.customerDetails?.name || order?.id || '').trim();
}

export function classifyBatchChargeOrder({
  order,
  draft = {},
  items = [],
  claim = null,
  sessionId = '',
  conflictCount = 0,
  hasPendingOps = false,
  isClaimStale = () => false,
  isSettled = false,
} = {}) {
  const effectiveStatus = String(draft?.status || order?.status || '').toLowerCase();
  if (isSettled || order?.status === 'completed' || effectiveStatus === 'completed') {
    return { status: 'already_completed' };
  }
  if (hasPendingOps) {
    return { status: 'skipped', reason: BATCH_CHARGE_SKIP_REASONS.pendingSync };
  }
  if (conflictCount > 0) {
    return { status: 'skipped', reason: BATCH_CHARGE_SKIP_REASONS.conflict };
  }
  if (claim?.sessionId && claim.sessionId !== sessionId && !isClaimStale(claim)) {
    return { status: 'skipped', reason: BATCH_CHARGE_SKIP_REASONS.claimedElsewhere };
  }

  const removedLineIds = draft.removedLineIds || {};
  const weightsByLineId = draft.weightsByLineId || {};
  const activeItems = (items || []).filter((item) => item?.lineId && !removedLineIds[item.lineId]);
  if (activeItems.length === 0) {
    return { status: 'skipped', reason: BATCH_CHARGE_SKIP_REASONS.noItems };
  }
  if (getNextUnweighedIndex(items, weightsByLineId, removedLineIds) !== -1) {
    return { status: 'skipped', reason: BATCH_CHARGE_SKIP_REASONS.notWeighed };
  }
  return { status: 'ready' };
}

export function collectCommunityBatchChargePlan({
  orders = [],
  communityName = '',
  sessionId = '',
  getContext,
  getClaim,
  getConflictCount,
  hasPendingOpsForOrder,
  isClaimStale = () => false,
  isSettled = () => false,
} = {}) {
  const community = String(communityName || '').trim();
  const empty = {
    communityName: community,
    communityOrders: [],
    ready: [],
    skipped: [],
    alreadyCompleted: [],
  };
  if (!community || typeof getContext !== 'function') return empty;

  const communityOrders = (orders || []).filter((order) => getOrderCommunityName(order) === community);
  const ready = [];
  const skipped = [];
  const alreadyCompleted = [];

  communityOrders.forEach((order) => {
    const { items = [], draft = {} } = getContext(order) || {};
    const classification = classifyBatchChargeOrder({
      order,
      draft,
      items,
      claim: getClaim?.(order.id) || null,
      sessionId,
      conflictCount: getConflictCount?.(order.id) || 0,
      hasPendingOps: hasPendingOpsForOrder?.(order.id) === true,
      isClaimStale,
      isSettled: isSettled?.(order, draft) === true,
    });
    const entry = {
      order,
      items,
      draft,
      reason: classification.reason || null,
    };
    if (classification.status === 'ready') ready.push(entry);
    else if (classification.status === 'already_completed') alreadyCompleted.push(entry);
    else skipped.push(entry);
  });

  return {
    communityName: community,
    communityOrders,
    ready,
    skipped,
    alreadyCompleted,
  };
}

export function defaultBatchChargeCommunities(selectedCommunities, orderCommunities) {
  const loaded = (orderCommunities || [])
    .map((name) => String(name || '').trim())
    .filter(Boolean);
  const pickedSet = new Set(
    [...(selectedCommunities || [])]
      .map((name) => String(name || '').trim())
      .filter(Boolean),
  );
  const picked = loaded.filter((name) => pickedSet.has(name));
  return picked.length > 0 ? picked : loaded;
}

export function partitionReadyByExclusion(ready = [], excludedOrderIds = []) {
  const excluded = new Set([...(excludedOrderIds || [])].map(String).filter(Boolean));
  const included = [];
  const heldOut = [];
  (ready || []).forEach((entry) => {
    if (excluded.has(String(entry?.order?.id || ''))) heldOut.push(entry);
    else included.push(entry);
  });
  return { included, heldOut };
}

export function collectMultiCommunityBatchChargePlan({
  orders = [],
  communityNames = [],
  sessionId = '',
  getContext,
  getClaim,
  getConflictCount,
  hasPendingOpsForOrder,
  isClaimStale = () => false,
  isSettled = () => false,
} = {}) {
  const names = [...new Set(
    (communityNames || [])
      .map((name) => String(name || '').trim())
      .filter(Boolean),
  )];
  const plans = names.map((communityName) => collectCommunityBatchChargePlan({
    orders,
    communityName,
    sessionId,
    getContext,
    getClaim,
    getConflictCount,
    hasPendingOpsForOrder,
    isClaimStale,
    isSettled,
  }));
  return {
    communityNames: names,
    plans,
    ready: plans.flatMap((plan) => plan.ready),
    skipped: plans.flatMap((plan) => plan.skipped),
    alreadyCompleted: plans.flatMap((plan) => plan.alreadyCompleted),
  };
}

export function buildBatchDiscountSnapshot(info, order, weekKey) {
  if (!info || info.enabled !== true || (info.discountPercent || 0) <= 0 || !order) return null;
  return {
    percent: info.discountPercent,
    tierIndex: info.tierIndex,
    displayThreshold: info.currentTier?.displayThreshold ?? null,
    realThreshold: info.currentTier?.realThreshold ?? null,
    cohortTotal: info.weeklyTotal,
    cohortOrderCount: info.orderCount,
    deliveryWeekKey: weekKey,
    community: getOrderCommunityName(order),
    mode: 'batch',
    appliedAtIso: new Date().toISOString(),
  };
}

export function formatBatchChargeIls(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0.00';
  return amount.toFixed(2);
}
