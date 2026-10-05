import {
  buildItemGroupKey,
  buildItemPickGroups,
  getEntryPickStatus,
  getExpectedPickQuantity,
  getNextPendingEntry,
  isOrderFullyPicked,
  predictCompletesAfterRemove,
  predictStatusAfterWeight,
  sortItemPickGroups,
  summarizePickGroups,
  PICK_STATUS,
} from './itemPickingV8';
import { classifyBatchChargeOrder } from '../v7/batchCommunityChargeV7';
import { getNextUnweighedIndex } from '../v7/orderDraftUtils';

describe('V8 picking status matches the V7 charge gate', () => {
  const items = [
    { lineId: 'o::a::b::::s0' },
    { lineId: 'o::b::b::::s1' },
    { lineId: 'o::c::b::::s2' },
  ];

  // Deterministic pseudo-random so failures are reproducible.
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const weightChoices = [undefined, { actualQuantity: null }, { actualQuantity: '' }, { actualQuantity: 0 }, { actualQuantity: 1.25 }];

  test('isOrderFullyPicked === V7 batch charge "ready" for 500 random drafts', () => {
    for (let run = 0; run < 500; run += 1) {
      const weightsByLineId = {};
      const removedLineIds = {};
      items.forEach((item) => {
        const weight = weightChoices[Math.floor(rand() * weightChoices.length)];
        if (weight !== undefined) weightsByLineId[item.lineId] = weight;
        if (rand() < 0.25) removedLineIds[item.lineId] = true;
      });
      const draft = { weightsByLineId, removedLineIds, status: 'in_progress' };
      const v7Ready = classifyBatchChargeOrder({ order: { id: 'o' }, draft, items }).status === 'ready';
      expect({ draft, picked: isOrderFullyPicked(items, draft) }).toEqual({ draft, picked: v7Ready });
    }
  });

  test('predictStatusAfterWeight agrees with V7 getNextUnweighedIndex', () => {
    const draft = { weightsByLineId: { [items[0].lineId]: { actualQuantity: 1 } }, removedLineIds: { [items[2].lineId]: true } };
    expect(predictStatusAfterWeight(items, draft, items[1].lineId, 0.5)).toBe('weighed');
    expect(getNextUnweighedIndex(items, { ...draft.weightsByLineId, [items[1].lineId]: { actualQuantity: 0.5 } }, draft.removedLineIds)).toBe(-1);
    expect(predictStatusAfterWeight(items, {}, items[0].lineId, 0.5)).toBe('in_progress');
  });

  test('predictCompletesAfterRemove only completes when the rest is picked and something remains', () => {
    const allButOne = { weightsByLineId: { [items[0].lineId]: { actualQuantity: 1 }, [items[1].lineId]: { actualQuantity: 1 } } };
    expect(predictCompletesAfterRemove(items, allButOne, items[2].lineId)).toBe(true);
    expect(predictCompletesAfterRemove(items, {}, items[2].lineId)).toBe(false);
    const onlyOneLeft = { removedLineIds: { [items[0].lineId]: true, [items[1].lineId]: true } };
    // Removing the last active line leaves nothing to charge — never "complete".
    expect(predictCompletesAfterRemove(items, onlyOneLeft, items[2].lineId)).toBe(false);
  });
});

const makeOrder = (id, items) => ({ id, items });

const contexts = {};
const getOrderContext = (order) => contexts[order.id];

describe('itemPickingV8', () => {
  beforeEach(() => {
    Object.keys(contexts).forEach((key) => delete contexts[key]);
  });

  test('buildItemGroupKey groups by product + option + measurement', () => {
    expect(buildItemGroupKey({ productId: 'p1', selectedOption: '', measurementType: 'kg' }))
      .toBe('p1::::kg');
    expect(buildItemGroupKey({ productId: 'p1', selectedOption: 'גדול', measurementType: 'kg' }))
      .not.toBe(buildItemGroupKey({ productId: 'p1', selectedOption: 'קטן', measurementType: 'kg' }));
    expect(buildItemGroupKey({ productName: 'Tomato' })).toBe('Tomato::::kg');
  });

  test('getExpectedPickQuantity converts units to kg and floors packages', () => {
    expect(getExpectedPickQuantity({ requestedQuantity: 2, measurementType: 'kg' })).toBe(2);
    expect(getExpectedPickQuantity({ requestedQuantity: 3, measurementType: 'unit', averageWeightKg: 0.25 })).toBeCloseTo(0.75);
    expect(getExpectedPickQuantity({ requestedQuantity: 2.9, measurementType: 'package' })).toBe(2);
  });

  test('getEntryPickStatus reflects draft weights and removals', () => {
    const item = { lineId: 'o1::p1::b::::s0' };
    expect(getEntryPickStatus(item, {})).toBe(PICK_STATUS.pending);
    expect(getEntryPickStatus(item, { weightsByLineId: { [item.lineId]: { actualQuantity: 1.2 } } })).toBe(PICK_STATUS.done);
    expect(getEntryPickStatus(item, { weightsByLineId: { [item.lineId]: { actualQuantity: null } } })).toBe(PICK_STATUS.pending);
    expect(getEntryPickStatus(item, { removedLineIds: { [item.lineId]: true } })).toBe(PICK_STATUS.removed);
  });

  test('buildItemPickGroups aggregates the same product across orders in order sequence', () => {
    const orders = [
      makeOrder('o1'),
      makeOrder('o2'),
      makeOrder('o3'),
    ];
    contexts.o1 = {
      items: [
        { lineId: 'o1::tom', productId: 'tom', productName: 'עגבניה', requestedQuantity: 1, measurementType: 'kg', businessName: 'משק א' },
        { lineId: 'o1::cuc', productId: 'cuc', productName: 'מלפפון', requestedQuantity: 2, measurementType: 'kg', businessName: 'משק ב' },
      ],
      draft: { weightsByLineId: { 'o1::tom': { actualQuantity: 1.05, source: 'scale' } } },
    };
    contexts.o2 = {
      items: [
        { lineId: 'o2::tom', productId: 'tom', productName: 'עגבניה', requestedQuantity: 3, measurementType: 'kg', businessName: 'משק א' },
      ],
      draft: { removedLineIds: { 'o2::tom': true } },
    };
    contexts.o3 = {
      items: [
        { lineId: 'o3::tom', productId: 'tom', productName: 'עגבניה', requestedQuantity: 2, measurementType: 'kg', businessName: 'משק א' },
        { lineId: 'o3::eggs', productId: 'eggs', productName: 'ביצים', requestedQuantity: 2, measurementType: 'package', businessName: 'משק ג' },
      ],
      draft: {},
    };

    const groups = buildItemPickGroups({ orders, getOrderContext });
    expect(groups).toHaveLength(3);

    const tomato = groups.find((group) => group.productId === 'tom');
    expect(tomato.entries.map((entry) => entry.orderId)).toEqual(['o1', 'o2', 'o3']);
    expect(tomato.doneCount).toBe(1);
    expect(tomato.removedCount).toBe(1);
    expect(tomato.pendingCount).toBe(1);
    expect(tomato.activeCount).toBe(2);
    // Removed line is excluded from totals.
    expect(tomato.totalRequested).toBe(3);
    expect(tomato.totalActual).toBeCloseTo(1.05);
    expect(tomato.isDone).toBe(false);

    const cucumber = groups.find((group) => group.productId === 'cuc');
    expect(cucumber.entries).toHaveLength(1);
    expect(cucumber.isDone).toBe(false);

    const eggs = groups.find((group) => group.productId === 'eggs');
    expect(eggs.measurementType).toBe('package');
    expect(eggs.totalExpected).toBe(2);
    expect(eggs.hardToPick).toBe(false);
  });

  test('buildItemPickGroups ignores orders without id or lines without lineId', () => {
    contexts.o1 = { items: [{ productId: 'x', requestedQuantity: 1 }], draft: {} };
    expect(buildItemPickGroups({ orders: [makeOrder('o1'), { items: [] }], getOrderContext })).toEqual([]);
    expect(buildItemPickGroups({ orders: [makeOrder('o1')] })).toEqual([]);
  });

  test('sortItemPickGroups sorts by name or by business then name', () => {
    const groups = [
      { productName: 'מלפפון', businessName: 'משק ב', selectedOption: '' },
      { productName: 'ביצים', businessName: 'משק ג', selectedOption: '' },
      { productName: 'עגבניה', businessName: 'משק א', selectedOption: '' },
    ];
    expect(sortItemPickGroups(groups, 'name').map((group) => group.productName)).toEqual(['ביצים', 'מלפפון', 'עגבניה']);
    expect(sortItemPickGroups(groups, 'business').map((group) => group.businessName)).toEqual(['משק א', 'משק ב', 'משק ג']);
    const byDemand = [
      { productName: 'מלפפון', totalRequested: 2, activeCount: 1, selectedOption: '' },
      { productName: 'עגבניה', totalRequested: 10, activeCount: 4, selectedOption: '' },
      { productName: 'ביצים', totalRequested: 10, activeCount: 1, selectedOption: '' },
    ];
    expect(sortItemPickGroups(byDemand, 'popular').map((group) => group.productName)).toEqual(['עגבניה', 'ביצים', 'מלפפון']);
    // Original array is not mutated.
    expect(groups[0].productName).toBe('מלפפון');
  });

  test('getNextPendingEntry walks forward, skips done/removed, and wraps', () => {
    const group = {
      entries: [
        { lineId: 'a', status: PICK_STATUS.done },
        { lineId: 'b', status: PICK_STATUS.pending },
        { lineId: 'c', status: PICK_STATUS.removed },
        { lineId: 'd', status: PICK_STATUS.pending },
      ],
    };
    expect(getNextPendingEntry(group).lineId).toBe('b');
    expect(getNextPendingEntry(group, 'b').lineId).toBe('d');
    expect(getNextPendingEntry(group, 'd').lineId).toBe('b');
    expect(getNextPendingEntry(group, 'zzz').lineId).toBe('b');
    expect(getNextPendingEntry({ entries: [{ lineId: 'a', status: PICK_STATUS.done }] }, 'a')).toBeNull();
    expect(getNextPendingEntry(null)).toBeNull();
  });

  test('summarizePickGroups totals items and lines', () => {
    const summary = summarizePickGroups([
      { isDone: true, activeCount: 2, doneCount: 2 },
      { isDone: false, activeCount: 3, doneCount: 1 },
    ]);
    expect(summary).toEqual({ items: 2, doneItems: 1, lines: 5, doneLines: 3 });
  });
});
