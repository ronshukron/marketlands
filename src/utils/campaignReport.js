import { getCustomerOrderDisplayTotal } from './customerOrderDisplay';
import { isSuccessfulDelayedCustomerOrder, isSuccessfulRegularCustomerOrder } from './customerOrderUtils';
import { toDate } from './funnelReport';

// The flyer / QR campaigns report (admin/CampaignsAdmin.js), from:
// - funnelEvents with a campaign code: scans, page views, the cart steps and
//   the weekly-basket signup steps (services/funnelService.js);
// - orders created with a campaign (checkout saves it on the order): what was
//   actually bought, and for how much;
// - weekly baskets signed up with a campaign.
// Visitors are browsers (the funnel's visitor id), not people.

export const CAMPAIGN_CART_STEPS = ['cart_started', 'checkout_opened', 'payment_started', 'order_completed'];
const MAX_PATH_STEPS = 4;
const TOP_PATHS = 5;

const inRange = (date, start, end) => Boolean(date) && date >= start && date <= end;
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const emptyRow = (code, link) => ({
  code,
  name: link?.name || code,
  active: link ? link.active !== false : null,
  visitors: 0,
  scans: 0,
  steps: CAMPAIGN_CART_STEPS.map((step) => ({ step, count: 0, conversion: null })),
  signupsStarted: 0,
  paidOrders: 0,
  revenue: 0,
  revenueHasEstimates: false,
  subscriptions: 0,
  topPaths: [],
});

/**
 * @param {Object} params
 * @param {Array<Object>} params.links campaignLinks (id = code)
 * @param {Array<Object>} params.events funnelEvents in the range
 * @param {Array<Object>} params.orders customerOrdersDelayed + customerOrders created in the range (with `collection`)
 * @param {Array<Object>} params.subscriptions basketSubscriptions
 * @param {Date} params.start
 * @param {Date} params.end
 * @return {Array<Object>} one row per campaign, links first (newest first), then codes seen only in data
 */
export const summarizeCampaigns = ({ links = [], events = [], orders = [], subscriptions = [], start, end }) => {
  const rows = new Map();
  const rowFor = (code) => {
    if (!rows.has(code)) rows.set(code, emptyRow(code, links.find((link) => link.id === code)));
    return rows.get(code);
  };
  links.forEach((link) => rowFor(link.id));

  // Browsers per campaign: which steps they reached, and the pages in order.
  const sessions = new Map();
  events.forEach((event) => {
    const code = event?.campaign;
    if (!code || !event.sessionId) return;
    rowFor(code);
    const key = `${code}|${event.sessionId}`;
    if (!sessions.has(key)) sessions.set(key, { code, steps: new Set(), pages: [] });
    const session = sessions.get(key);
    session.steps.add(event.step);
    if (event.step === 'page_view' && event.path) {
      session.pages.push({ path: event.path, at: toDate(event.createdAt)?.getTime() || 0 });
    }
  });

  const pathCounts = new Map();
  sessions.forEach((session) => {
    const row = rowFor(session.code);
    row.visitors += 1;
    if (session.steps.has('scan')) row.scans += 1;
    if (session.steps.has('signup_opened')) row.signupsStarted += 1;
    // A later cart step means the earlier ones happened (maybe outside the range).
    CAMPAIGN_CART_STEPS.forEach((step, index) => {
      if (CAMPAIGN_CART_STEPS.slice(index).some((later) => session.steps.has(later))) row.steps[index].count += 1;
    });
    const pages = session.pages.sort((a, b) => a.at - b.at).map((page) => page.path)
      .filter((path, index, list) => index === 0 || list[index - 1] !== path)
      .slice(0, MAX_PATH_STEPS);
    if (pages.length > 0) {
      const counts = pathCounts.get(session.code) || new Map();
      const label = pages.join(' → ');
      counts.set(label, (counts.get(label) || 0) + 1);
      pathCounts.set(session.code, counts);
    }
  });

  orders.forEach((order) => {
    const code = order?.campaign?.code;
    if (!code) return;
    const paid = order.collection === 'customerOrders'
      ? isSuccessfulRegularCustomerOrder(order)
      : isSuccessfulDelayedCustomerOrder(order);
    if (!paid) return;
    const row = rowFor(code);
    const total = getCustomerOrderDisplayTotal(order);
    row.paidOrders += 1;
    row.revenue = roundMoney(row.revenue + total.amount);
    if (!total.isFinal && total.isEstimate) row.revenueHasEstimates = true;
  });

  subscriptions.forEach((sub) => {
    const code = sub?.campaign?.code;
    if (!code || !inRange(toDate(sub.createdAt), start, end)) return;
    rowFor(code).subscriptions += 1;
  });

  rows.forEach((row) => {
    let previous = row.visitors;
    row.steps.forEach((entry) => {
      entry.conversion = previous > 0 ? entry.count / previous : null;
      previous = entry.count;
    });
    row.topPaths = [...(pathCounts.get(row.code) || new Map()).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_PATHS)
      .map(([path, count]) => ({ path, count }));
  });

  return [...rows.values()];
};
