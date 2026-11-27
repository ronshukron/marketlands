import {
  summarizeFunnel,
  summarizeSubscriptionExits,
  weekRange,
  whatsappLink,
} from './funnelReport';

const event = (sessionId, funnel, step, extra = {}) => ({ sessionId, funnel, step, ...extra });
const byStep = (summary) => Object.fromEntries(summary.steps.map((row) => [row.step, row]));

describe('summarizeFunnel', () => {
  test('counts browsers, not events, and a later step implies the earlier required ones', () => {
    const events = [
      event('a', 'cart', 'cart_started'),
      event('a', 'cart', 'cart_started'),
      event('a', 'cart', 'checkout_opened'),
      event('b', 'cart', 'cart_started'),
      // Filled the cart last week, paid this week: still counted as started.
      event('c', 'cart', 'payment_started'),
      event('c', 'cart', 'order_completed'),
      event('d', 'weekly_basket', 'signup_opened'),
    ];
    const summary = summarizeFunnel(events, 'cart');
    const rows = byStep(summary);
    expect(summary.visitors).toBe(3);
    expect(rows.cart_started.count).toBe(3);
    expect(rows.checkout_opened.count).toBe(2);
    expect(rows.payment_started.count).toBe(1);
    expect(rows.order_completed.count).toBe(1);
    expect(rows.cart_started.conversion).toBeNull();
    expect(rows.checkout_opened.conversion).toBeCloseTo(2 / 3);
    expect(rows.order_completed.conversion).toBe(1);
    expect(summary.split).toBeNull();
  });

  test('editing the basket is optional and split by ready-made versus build-your-own', () => {
    const events = [
      event('r1', 'weekly_basket', 'signup_opened', { buildYourOwn: false }),
      event('r1', 'weekly_basket', 'submitted', { buildYourOwn: false }),
      event('r1', 'weekly_basket', 'card_saved'),
      event('r2', 'weekly_basket', 'signup_opened', { buildYourOwn: false }),
      event('r2', 'weekly_basket', 'basket_edited', { buildYourOwn: false }),
      event('b1', 'weekly_basket', 'signup_opened', { buildYourOwn: true }),
      event('b1', 'weekly_basket', 'basket_edited', { buildYourOwn: true }),
      event('b1', 'weekly_basket', 'submitted', { buildYourOwn: true }),
      event('x', 'weekly_basket', 'card_saved'),
    ];
    const summary = summarizeFunnel(events, 'weekly_basket');
    const rows = byStep(summary);
    expect(rows.signup_opened.count).toBe(4);
    expect(rows.basket_edited).toMatchObject({ optional: true, count: 2, conversion: 0.5 });
    // Submitted is measured against opened, not against edited.
    expect(rows.submitted).toMatchObject({ count: 3, conversion: 0.75 });
    expect(rows.card_saved.count).toBe(2);
    expect(summary.split.readyMade.map((row) => row.count)).toEqual([2, 1, 1, 1]);
    expect(summary.split.buildYourOwn.map((row) => row.count)).toEqual([1, 1, 1, 0]);
    expect(summary.split.unknown).toBe(1);
  });

  test('empty or junk input gives zeros', () => {
    const summary = summarizeFunnel([null, {}, event('', 'cart', 'cart_started'), event('a', 'cart', 'nope')], 'cart');
    expect(summary.visitors).toBe(0);
    expect(summary.steps.every((row) => row.count === 0 && row.conversion === null)).toBe(true);
  });
});

describe('summarizeSubscriptionExits', () => {
  const start = new Date(2026, 10, 22);
  const end = new Date(2026, 10, 28, 23, 59, 59);
  const now = new Date(2026, 10, 26, 12, 0);
  const at = (day, hour = 10, minute = 0) => new Date(2026, 10, day, hour, minute);
  const sub = (id, fields) => ({ id, customerDetails: { name: id, phone: '050-1234567' }, community: 'X', basketTitle: 'סל', ...fields });

  test('lists who started and stopped in the range, with reasons', () => {
    const result = summarizeSubscriptionExits([
      sub('pending-old', { status: 'pending_card', createdAt: { toDate: () => at(25) } }),
      sub('pending-fresh', { status: 'pending_card', createdAt: at(26, 11, 30) }),
      sub('pending-before', { status: 'pending_card', createdAt: at(10) }),
      sub('paused', {
        status: 'paused', pausedAt: at(24), pauseReason: 'customer', cycleCount: 3,
        pauseFeedback: { reason: 'price', note: 'יקר לי' },
      }),
      sub('canceled', { status: 'canceled', canceledAt: at(23), canceledBy: 'customer', cancelFeedback: { reason: 'quality' }, cycleCount: 5 }),
      sub('canceled-quiet', { status: 'canceled', canceledAt: at(27), canceledBy: 'admin' }),
      sub('canceled-old', { status: 'canceled', canceledAt: at(1), cancelFeedback: { reason: 'price' } }),
      sub('active', { status: 'active', activatedAt: at(24), recurringLines: [{ productId: 'p' }] }),
      sub('active-old', { status: 'active', activatedAt: at(2) }),
    ], { start, end, now });

    expect(result.activated).toBe(1);
    expect(result.pendingCard.map((row) => row.id)).toEqual(['pending-old']);
    expect(result.paused).toHaveLength(1);
    expect(result.paused[0]).toMatchObject({ reason: 'price', reasonLabel: 'מחיר', note: 'יקר לי', cycleCount: 3, by: 'customer' });
    expect(result.canceled.map((row) => row.id)).toEqual(['canceled-quiet', 'canceled']);
    expect(result.canceled[1]).toMatchObject({ reasonLabel: 'איכות', cycleCount: 5 });
    expect(result.reasons).toEqual([
      { reason: 'price', label: 'מחיר', paused: 1, canceled: 0 },
      { reason: 'quality', label: 'איכות', paused: 0, canceled: 1 },
      { reason: '', label: 'לא צוינה סיבה', paused: 0, canceled: 1 },
    ]);
  });

  test('an unknown stored reason shows as no reason', () => {
    const result = summarizeSubscriptionExits([
      sub('c', { status: 'canceled', canceledAt: at(24), cancelFeedback: { reason: 'weird', note: 'x' } }),
    ], { start, end, now });
    expect(result.canceled[0]).toMatchObject({ reason: '', reasonLabel: '', note: 'x' });
  });
});

test('weekRange is Sunday to Saturday', () => {
  const { start, end } = weekRange(new Date(2026, 10, 26), 0);
  expect(start).toEqual(new Date(2026, 10, 22));
  expect(end.getDay()).toBe(6);
  expect(end.getDate()).toBe(28);
  expect(weekRange(new Date(2026, 10, 26), 1).start).toEqual(new Date(2026, 10, 15));
});

test('whatsappLink makes an Israeli wa.me link', () => {
  expect(whatsappLink('050-123-4567')).toBe('https://wa.me/972501234567');
  expect(whatsappLink('+972 50 1234567', 'היי')).toBe(`https://wa.me/972501234567?text=${encodeURIComponent('היי')}`);
  expect(whatsappLink('')).toBe('');
});
