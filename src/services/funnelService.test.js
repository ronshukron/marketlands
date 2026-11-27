import {
  buildFunnelEvent,
  getFunnelVisitorId,
  resetFunnelTrackingForTests,
  trackFunnelStep,
  trackFunnelStepBeforeLeaving,
} from './funnelService';

jest.mock('../firebase/firebase', () => ({ auth: { currentUser: { uid: 'auth-user' } }, db: {} }));

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
};

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

let local;
let session;
let written;
const deps = (overrides = {}) => ({
  enabled: true,
  localStorage: local,
  sessionStorage: session,
  write: (event) => { written.push(event); return Promise.resolve(); },
  ...overrides,
});

beforeEach(() => {
  resetFunnelTrackingForTests();
  local = memoryStorage();
  session = memoryStorage();
  written = [];
});

test('writes one event of the rules shape, with the stored community and the signed-in user', async () => {
  local.setItem('selectedPickupSpot', 'אבן יהודה');
  expect(trackFunnelStep('cart', 'cart_started', {}, deps())).toBe(true);
  await flush();
  expect(written).toHaveLength(1);
  const [event] = written;
  expect(Object.keys(event).sort()).toEqual(
    ['basketId', 'buildYourOwn', 'campaign', 'community', 'funnel', 'path', 'sessionId', 'step', 'userId'].sort(),
  );
  expect(event).toMatchObject({
    funnel: 'cart', step: 'cart_started', userId: 'auth-user', community: 'אבן יהודה', basketId: null, buildYourOwn: null,
    campaign: null, path: null,
  });
  expect(event.sessionId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
});

test('each step is written once per session; the visitor id stays the same', async () => {
  trackFunnelStep('weekly_basket', 'signup_opened', { basketId: 'b1', buildYourOwn: true }, deps());
  expect(trackFunnelStep('weekly_basket', 'signup_opened', { basketId: 'b1' }, deps())).toBe(false);
  trackFunnelStep('weekly_basket', 'basket_edited', {}, deps());
  await flush();
  expect(written.map((event) => event.step)).toEqual(['signup_opened', 'basket_edited']);
  expect(written[0].sessionId).toBe(written[1].sessionId);
  expect(written[0]).toMatchObject({ basketId: 'b1', buildYourOwn: true });

  // A new browser session (sessionStorage and memory cleared) counts again, same visitor.
  resetFunnelTrackingForTests();
  session = memoryStorage();
  trackFunnelStep('weekly_basket', 'signup_opened', {}, deps());
  await flush();
  expect(written).toHaveLength(3);
  expect(written[2].sessionId).toBe(written[0].sessionId);
});

test('unknown funnels and steps are ignored', () => {
  expect(trackFunnelStep('cart', 'signup_opened', {}, deps())).toBe(false);
  expect(trackFunnelStep('other', 'cart_started', {}, deps())).toBe(false);
  expect(written).toHaveLength(0);
});

test('never throws: a failing write, a throwing write or broken storage', async () => {
  const rejecting = deps({ write: () => Promise.reject(new Error('permission-denied')) });
  expect(() => trackFunnelStep('cart', 'checkout_opened', {}, rejecting)).not.toThrow();
  await flush();
  // A lost write may be tried again on the next visit to the step.
  expect(trackFunnelStep('cart', 'checkout_opened', {}, deps())).toBe(true);

  const throwing = deps({ write: () => { throw new Error('boom'); } });
  expect(() => trackFunnelStep('cart', 'payment_started', {}, throwing)).not.toThrow();

  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
  expect(trackFunnelStep('cart', 'order_completed', {}, deps({ localStorage: broken, sessionStorage: broken }))).toBe(true);
  await flush();
  expect(written.find((event) => event.step === 'order_completed').sessionId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
});

test('tracking off writes nothing', async () => {
  expect(trackFunnelStep('cart', 'cart_started', {}, deps({ enabled: false }))).toBe(false);
  await flush();
  expect(written).toHaveLength(0);
});

test('before leaving: waits for the write, but no longer than the timeout', async () => {
  let resolveWrite;
  const slow = deps({ write: () => new Promise((resolve) => { resolveWrite = resolve; }), timeoutMs: 20 });
  const started = Date.now();
  await trackFunnelStepBeforeLeaving('cart', 'payment_started', {}, slow);
  expect(Date.now() - started).toBeGreaterThanOrEqual(15);
  resolveWrite();

  const fast = deps({ timeoutMs: 5000 });
  const fastStart = Date.now();
  await trackFunnelStepBeforeLeaving('weekly_basket', 'submitted', {}, fast);
  expect(Date.now() - fastStart).toBeLessThan(1000);
  expect(written.map((event) => event.step)).toEqual(['submitted']);

  // Already sent: resolves right away.
  await expect(trackFunnelStepBeforeLeaving('weekly_basket', 'submitted', {}, fast)).resolves.toBeUndefined();
});

test('event fields are capped and typed', () => {
  const event = buildFunnelEvent({
    funnel: 'weekly_basket',
    step: 'submitted',
    sessionId: 'abcdefgh',
    userId: '',
    community: 'x'.repeat(150),
    basketId: 'b'.repeat(200),
    buildYourOwn: 'yes',
  });
  expect(event.userId).toBeNull();
  expect(event.community).toHaveLength(100);
  expect(event.basketId).toHaveLength(128);
  expect(event.buildYourOwn).toBeNull();
});

test('the visitor id is reused from storage and replaced when malformed', () => {
  local.setItem('bastaFunnelVisitorId', 'stored-visitor-1');
  expect(getFunnelVisitorId(local)).toBe('stored-visitor-1');
  local.setItem('bastaFunnelVisitorId', 'bad id!');
  expect(getFunnelVisitorId(local)).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
});

test('a visitor from a flyer carries the campaign on every event; page views once per page', async () => {
  local.setItem('bastaCampaign', JSON.stringify({ code: 'green', at: new Date().toISOString() }));
  trackFunnelStep('cart', 'cart_started', {}, deps());
  trackFunnelStep('campaign', 'page_view', { path: '/', dedupeKey: '/' }, deps());
  trackFunnelStep('campaign', 'page_view', { path: '/', dedupeKey: '/' }, deps());
  trackFunnelStep('campaign', 'page_view', { path: '/my-orders', dedupeKey: '/my-orders' }, deps());
  await flush();
  expect(written.map((event) => [event.step, event.campaign, event.path])).toEqual([
    ['cart_started', 'green', null],
    ['page_view', 'green', '/'],
    ['page_view', 'green', '/my-orders'],
  ]);
});

test('an old campaign (over 30 days) is not credited', async () => {
  local.setItem('bastaCampaign', JSON.stringify({ code: 'green', at: new Date(Date.now() - 31 * 86400000).toISOString() }));
  trackFunnelStep('cart', 'cart_started', {}, deps());
  await flush();
  expect(written[0].campaign).toBeNull();
});
