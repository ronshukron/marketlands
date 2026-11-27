import { summarizeCampaigns } from './campaignReport';

const start = new Date(2026, 11, 1);
const end = new Date(2026, 11, 31, 23, 59);
const at = (day, hour = 10) => new Date(2026, 11, day, hour);
const ev = (sessionId, campaign, step, extra = {}) => ({
  sessionId, campaign, step, funnel: extra.funnel || 'cart', createdAt: extra.createdAt || at(2), ...extra,
});

test('per flyer: visitors, the cart steps (later implies earlier), orders, revenue, signups and paths', () => {
  const links = [{ id: 'green', name: 'פלייר ירוק', active: true }, { id: 'blue', name: 'פלייר כחול', active: true }];
  const events = [
    ev('a', 'green', 'scan', { funnel: 'campaign' }),
    ev('a', 'green', 'page_view', { funnel: 'campaign', path: '/', createdAt: at(2, 10) }),
    ev('a', 'green', 'page_view', { funnel: 'campaign', path: '/?category=פירות', createdAt: at(2, 11) }),
    ev('a', 'green', 'cart_started'),
    ev('a', 'green', 'order_completed'),
    ev('b', 'green', 'scan', { funnel: 'campaign' }),
    ev('b', 'green', 'page_view', { funnel: 'campaign', path: '/', createdAt: at(3) }),
    ev('b', 'green', 'signup_opened', { funnel: 'weekly_basket' }),
    ev('c', 'blue', 'scan', { funnel: 'campaign' }),
    ev('d', null, 'cart_started'),
  ];
  const orders = [
    { collection: 'customerOrdersDelayed', campaign: { code: 'green' }, paymentStatus: 'held', delayedOrderStatus: 'pending_weighing', grandTotal: 120 },
    { collection: 'customerOrdersDelayed', campaign: { code: 'green' }, paymentStatus: 'completed', delayedOrderStatus: 'completed', weighing: { finalSum: 88.5 } },
    { collection: 'customerOrdersDelayed', campaign: { code: 'green' }, paymentStatus: 'abandoned', grandTotal: 500 },
    { collection: 'customerOrders', campaign: { code: 'blue' }, paymentStatus: 'pending_payment', grandTotal: 40 },
    { collection: 'customerOrdersDelayed', grandTotal: 999, paymentStatus: 'held', delayedOrderStatus: 'pending_weighing' },
  ];
  const subscriptions = [
    { campaign: { code: 'green' }, createdAt: at(5) },
    { campaign: { code: 'green' }, createdAt: new Date(2026, 9, 1) },
  ];
  const rows = summarizeCampaigns({ links, events, orders, subscriptions, start, end });
  const green = rows.find((row) => row.code === 'green');
  const blue = rows.find((row) => row.code === 'blue');

  expect(green.visitors).toBe(2);
  expect(green.scans).toBe(2);
  expect(green.steps.map((entry) => entry.count)).toEqual([1, 1, 1, 1]);
  expect(green.steps[0].conversion).toBe(0.5);
  expect(green.signupsStarted).toBe(1);
  expect(green.paidOrders).toBe(2);
  expect(green.revenue).toBe(208.5);
  expect(green.revenueHasEstimates).toBe(true);
  expect(green.subscriptions).toBe(1);
  expect(green.topPaths).toEqual([
    { path: '/ → /?category=פירות', count: 1 },
    { path: '/', count: 1 },
  ]);

  expect(blue).toMatchObject({ visitors: 1, scans: 1, paidOrders: 0, revenue: 0 });
  expect(rows.map((row) => row.code)).toEqual(['green', 'blue']);
});

test('a code without a link still shows, and links with no data show zeros', () => {
  const rows = summarizeCampaigns({
    links: [{ id: 'quiet', name: 'שקט' }],
    events: [ev('x', 'old-code', 'scan', { funnel: 'campaign' })],
    start,
    end,
  });
  expect(rows.map((row) => [row.code, row.name, row.visitors])).toEqual([['quiet', 'שקט', 0], ['old-code', 'old-code', 1]]);
  expect(rows[0].steps.every((entry) => entry.conversion === null)).toBe(true);
});
