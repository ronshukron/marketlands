import {
  BATCH_CHARGE_SKIP_REASONS,
  classifyBatchChargeOrder,
  collectCommunityBatchChargePlan,
  collectMultiCommunityBatchChargePlan,
  defaultBatchChargeCommunities,
  getOrderCommunityName,
  partitionReadyByExclusion,
} from './batchCommunityChargeV7';

const weighedItem = {
  lineId: 'line-a',
  productName: 'Tomato',
  requestedQuantity: 1,
};
const weighedDraft = {
  status: 'weighed',
  weightsByLineId: { 'line-a': { actualQuantity: 1.2, source: 'manual' } },
  removedLineIds: {},
};

describe('classifyBatchChargeOrder', () => {
  test('marks a fully weighed order as ready', () => {
    expect(classifyBatchChargeOrder({
      order: { id: 'a', status: 'weighed' },
      draft: weighedDraft,
      items: [weighedItem],
      sessionId: 'me',
    })).toEqual({ status: 'ready' });
  });

  test('skips completed orders so they are never charged twice', () => {
    expect(classifyBatchChargeOrder({
      order: { id: 'a', status: 'completed' },
      draft: weighedDraft,
      items: [weighedItem],
    }).status).toBe('already_completed');
    expect(classifyBatchChargeOrder({
      order: { id: 'a', status: 'weighed' },
      draft: weighedDraft,
      items: [weighedItem],
      isSettled: true,
    }).status).toBe('already_completed');
  });

  test('skips unweighed, empty, claimed, conflicted, and pending-sync orders', () => {
    expect(classifyBatchChargeOrder({
      order: { id: 'a' },
      draft: { weightsByLineId: {}, removedLineIds: {} },
      items: [weighedItem],
    })).toMatchObject({ status: 'skipped', reason: BATCH_CHARGE_SKIP_REASONS.notWeighed });

    expect(classifyBatchChargeOrder({
      order: { id: 'a' },
      draft: { ...weighedDraft, removedLineIds: { 'line-a': true } },
      items: [weighedItem],
    })).toMatchObject({ status: 'skipped', reason: BATCH_CHARGE_SKIP_REASONS.noItems });

    expect(classifyBatchChargeOrder({
      order: { id: 'a' },
      draft: weighedDraft,
      items: [weighedItem],
      claim: { sessionId: 'other' },
      sessionId: 'me',
      isClaimStale: () => false,
    })).toMatchObject({ status: 'skipped', reason: BATCH_CHARGE_SKIP_REASONS.claimedElsewhere });

    expect(classifyBatchChargeOrder({
      order: { id: 'a' },
      draft: weighedDraft,
      items: [weighedItem],
      conflictCount: 1,
    })).toMatchObject({ status: 'skipped', reason: BATCH_CHARGE_SKIP_REASONS.conflict });

    expect(classifyBatchChargeOrder({
      order: { id: 'a' },
      draft: weighedDraft,
      items: [weighedItem],
      hasPendingOps: true,
    })).toMatchObject({ status: 'skipped', reason: BATCH_CHARGE_SKIP_REASONS.pendingSync });
  });

  test('allows retry of a weighed order claimed by this station', () => {
    expect(classifyBatchChargeOrder({
      order: { id: 'a', status: 'weighed' },
      draft: weighedDraft,
      items: [weighedItem],
      claim: { sessionId: 'me' },
      sessionId: 'me',
    })).toEqual({ status: 'ready' });
  });
});

describe('collectCommunityBatchChargePlan', () => {
  test('only includes members of the selected community', () => {
    const orders = [
      { id: 'a', pickupSpot: 'קהילה א', customerDetails: { name: 'A', pickupSpot: 'קהילה א' } },
      { id: 'b', pickupSpot: 'קהילה ב', customerDetails: { name: 'B', pickupSpot: 'קהילה ב' } },
      { id: 'c', pickupSpot: 'קהילה א', status: 'completed', customerDetails: { name: 'C', pickupSpot: 'קהילה א' } },
    ];
    const plan = collectCommunityBatchChargePlan({
      orders,
      communityName: 'קהילה א',
      sessionId: 'me',
      getContext: (order) => ({
        items: [weighedItem],
        draft: order.status === 'completed' ? { status: 'completed' } : weighedDraft,
      }),
      getClaim: () => null,
      getConflictCount: () => 0,
      hasPendingOpsForOrder: () => false,
      isSettled: (order) => order.status === 'completed',
    });

    expect(plan.communityOrders.map((order) => order.id)).toEqual(['a', 'c']);
    expect(plan.ready.map((entry) => entry.order.id)).toEqual(['a']);
    expect(plan.alreadyCompleted.map((entry) => entry.order.id)).toEqual(['c']);
    expect(getOrderCommunityName(orders[1])).toBe('קהילה ב');
  });
});

describe('collectMultiCommunityBatchChargePlan', () => {
  test('merges ready orders from every selected community', () => {
    const orders = [
      { id: 'a', pickupSpot: 'קהילה א', customerDetails: { name: 'A', pickupSpot: 'קהילה א' } },
      { id: 'b', pickupSpot: 'קהילה ב', customerDetails: { name: 'B', pickupSpot: 'קהילה ב' } },
      { id: 'c', pickupSpot: 'קהילה א', status: 'completed', customerDetails: { name: 'C', pickupSpot: 'קהילה א' } },
    ];
    const plan = collectMultiCommunityBatchChargePlan({
      orders,
      communityNames: ['קהילה א', 'קהילה ב'],
      sessionId: 'me',
      getContext: (order) => ({
        items: [weighedItem],
        draft: order.status === 'completed' ? { status: 'completed' } : weighedDraft,
      }),
      getClaim: () => null,
      getConflictCount: () => 0,
      hasPendingOpsForOrder: () => false,
      isSettled: (order) => order.status === 'completed',
    });

    expect(plan.ready.map((entry) => entry.order.id)).toEqual(['a', 'b']);
    expect(plan.alreadyCompleted.map((entry) => entry.order.id)).toEqual(['c']);
    expect(plan.plans.map((entry) => entry.communityName)).toEqual(['קהילה א', 'קהילה ב']);
  });
});

describe('defaultBatchChargeCommunities', () => {
  test('prefers loaded selected communities, otherwise all loaded', () => {
    expect(defaultBatchChargeCommunities(['A', 'missing'], ['A', 'B'])).toEqual(['A']);
    expect(defaultBatchChargeCommunities([], ['A', 'B'])).toEqual(['A', 'B']);
    expect(defaultBatchChargeCommunities(new Set(['B']), ['A', 'B'])).toEqual(['B']);
  });
});

describe('partitionReadyByExclusion', () => {
  test('holds out flagged orders without dropping them from the plan', () => {
    const ready = [{ order: { id: 'a' } }, { order: { id: 'b' } }];
    const { included, heldOut } = partitionReadyByExclusion(ready, ['b']);
    expect(included.map((entry) => entry.order.id)).toEqual(['a']);
    expect(heldOut.map((entry) => entry.order.id)).toEqual(['b']);
  });
});
