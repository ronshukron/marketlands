import {
  isCartOrderClosedOnDate,
  planCartDeliveryDates,
  splitCartForDeliveryDate,
} from './cartDeliveryDatePlan';

// Hoisted above the import by Jest.
jest.mock('../services/pickupSpotsService', () => ({
  resolveCommunityName: (name) => name,
}));

const community = 'אור הנר';
// Wednesday deliveries; the community closes 33 hours before the end of Wednesday.
const schedule = { active: true, weeklyDays: [3], defaultCutoff: { hoursBeforeDelivery: 33 }, horizonWeeks: 3 };
const form = (wednesdayHoursBefore) => ({
  orderType: 'always_on_grocery',
  pickupSpots: [community],
  fulfillmentConfig: { weeklyDeliveryDays: [2, 3, 4], weeklyCutoffByDay: { 3: wednesdayHoursBefore } },
});
// מוג'ו closes Wednesday orders on Monday at 15:00 (57 hours before the end of Wednesday).
const ordersById = { mojo: form(57), basta: form(35), eran: form(37) };

const line = (uid, orderId, businessName, price, extra = {}) => ({
  uid, id: uid, name: uid, orderId, businessId: `${orderId}-biz`, businessName, price, quantity: 1, measurementType: 'unit', ...extra,
});
const cart = (lines) => lines.reduce((groups, item) => {
  const group = groups[item.orderId] || { items: [], businessId: item.businessId, minimumOrderAmount: 0, total: 0 };
  group.items.push(item);
  return { ...groups, [item.orderId]: group };
}, {});

const mondayAfternoon = new Date(2026, 10, 23, 17, 4);
const mondayMorning = new Date(2026, 10, 23, 10, 0);
const plan = (itemsByOrder, now) => planCartDeliveryDates({
  scheduleDoc: schedule, ordersById, itemsByOrder, communityName: community, now,
});
const closedOn = (dateKey, now) => (orderId) => isCartOrderClosedOnDate(ordersById[orderId], dateKey, {
  scheduleDoc: schedule, communityName: community, now,
});

test('a farmer that already closed is left out instead of moving the order to next week', () => {
  const itemsByOrder = cart([
    line('jam', 'mojo', "מוג'ו", 20),
    line('tomato', 'eran', 'העגבניות של ערן', 15),
    line('lettuce', 'basta', 'הבסטה', 8),
  ]);

  expect(plan(itemsByOrder, mondayAfternoon)).toEqual({ dates: ['2026-11-25'], completeDates: [] });

  const split = splitCartForDeliveryDate(itemsByOrder, closedOn('2026-11-25', mondayAfternoon));
  expect(split.closedOrderIds).toEqual(['mojo']);
  expect(split.excludedItems.map((item) => item.uid)).toEqual(['jam']);
  expect(split.excludedTotal).toBe(20);
  expect(Object.keys(split.includedByOrder)).toEqual(['eran', 'basta']);
  expect(split.includedByOrder.eran.total).toBe(15);
});

test('before the cutoff nothing is left out', () => {
  const itemsByOrder = cart([line('jam', 'mojo', "מוג'ו", 20), line('lettuce', 'basta', 'הבסטה', 8)]);
  expect(plan(itemsByOrder, mondayMorning)).toEqual({ dates: ['2026-11-25'], completeDates: ['2026-11-25'] });
});

test('the order moves to next week only when nothing in it can arrive this week', () => {
  const itemsByOrder = cart([line('jam', 'mojo', "מוג'ו", 20)]);
  expect(plan(itemsByOrder, mondayAfternoon)).toEqual({ dates: ['2026-12-02'], completeDates: ['2026-12-02'] });
});

test('a basket with a product from a closed farmer is left out whole', () => {
  const basket = { basketInstanceId: 'b1', basketTitle: 'סל ירקות', isBasketComponent: true };
  const itemsByOrder = cart([
    line('basket-jam', 'mojo', "מוג'ו", 10, basket),
    line('basket-lettuce', 'basta', 'הבסטה', 8, basket),
    line('basket-adjust', 'basta', 'הבסטה', -3, { basketInstanceId: 'b1', basketTitle: 'סל ירקות', isBasketAdjustment: true }),
    line('cucumber', 'basta', 'הבסטה', 6),
  ]);

  const split = splitCartForDeliveryDate(itemsByOrder, closedOn('2026-11-25', mondayAfternoon));
  expect(split.excludedItems.map((item) => item.uid)).toEqual(['basket-jam', 'basket-lettuce', 'basket-adjust']);
  expect(split.excludedBaskets).toEqual([{ basketInstanceId: 'b1', title: 'סל ירקות', closedBusinessNames: ["מוג'ו"] }]);
  expect(split.includedByOrder.basta.items.map((item) => item.uid)).toEqual(['cucumber']);
});

test('the delivery fee is kept and moves to a farmer that still has products', () => {
  const itemsByOrder = cart([
    line('jam', 'mojo', "מוג'ו", 20),
    line('shipping', 'mojo', "מוג'ו", 25, { isShipping: true }),
    line('lettuce', 'basta', 'הבסטה', 8),
  ]);

  const split = splitCartForDeliveryDate(itemsByOrder, closedOn('2026-11-25', mondayAfternoon));
  expect(split.excludedItems.map((item) => item.uid)).toEqual(['jam']);
  expect(split.includedByOrder.mojo).toBeUndefined();
  expect(split.includedByOrder.basta.items.map((item) => item.uid)).toEqual(['lettuce', 'shipping']);
  expect(split.includedByOrder.basta.items[1]).toEqual(expect.objectContaining({ orderId: 'basta', businessName: 'הבסטה' }));
  expect(split.includedByOrder.basta.total).toBe(33);
});

test('items without a delivery schedule are never left out', () => {
  const oneTime = { orderType: 'one_time' };
  expect(isCartOrderClosedOnDate(oneTime, '2026-11-25', { scheduleDoc: schedule, communityName: community, now: mondayAfternoon })).toBe(false);
  expect(isCartOrderClosedOnDate(undefined, '2026-11-25', { scheduleDoc: schedule, communityName: community })).toBe(false);
});
