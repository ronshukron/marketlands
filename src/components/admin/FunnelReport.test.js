import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FunnelReport from './FunnelReport';

jest.mock('../../utils/customerOrderDateQueries', () => ({ fetchDocsByCreatedAtRange: () => Promise.resolve([]) }));
jest.mock('../../services/funnelService', () => ({ FUNNEL_COLLECTION: 'funnelEvents' }));

const now = new Date(2026, 10, 26, 12, 0);
const event = (sessionId, funnel, step, extra = {}) => ({ sessionId, funnel, step, ...extra });
const events = [
  event('a', 'weekly_basket', 'signup_opened', { buildYourOwn: false }),
  event('a', 'weekly_basket', 'submitted', { buildYourOwn: false }),
  event('a', 'weekly_basket', 'card_saved'),
  event('b', 'weekly_basket', 'signup_opened', { buildYourOwn: true }),
  event('c', 'cart', 'cart_started'),
  event('c', 'cart', 'checkout_opened'),
  event('d', 'cart', 'cart_started'),
];
const subscriptions = [
  {
    id: 's1', status: 'canceled', canceledAt: new Date(2026, 10, 24), canceledBy: 'customer', cycleCount: 4,
    cancelFeedback: { reason: 'quantities', note: 'יותר מדי' },
    customerDetails: { name: 'רון', phone: '0501234567' }, community: 'X', basketTitle: 'סל',
  },
  {
    id: 's2', status: 'pending_card', createdAt: new Date(2026, 10, 25, 9),
    customerDetails: { name: 'מאיה', phone: '0521112222' }, community: 'X', basketTitle: 'סל',
  },
  { id: 's3', status: 'active', activatedAt: new Date(2026, 10, 23) },
];

const cells = (testId) => within(screen.getByTestId(testId)).getAllByRole('cell').map((cell) => cell.textContent);

test('shows both funnels, the signup outcome and who left and why for the week', async () => {
  const loadEvents = jest.fn(() => Promise.resolve(events));
  render(<FunnelReport subscriptions={subscriptions} loadEvents={loadEvents} now={now} />);

  await waitFor(() => expect(cells('funnel-weekly_basket-signup_opened')).toEqual(['2', '', '1', '1']));
  const [start, end] = loadEvents.mock.calls[0];
  expect(start).toEqual(new Date(2026, 10, 22));
  expect(end.getDate()).toBe(28);

  // visitors, conversion, ready-made, build-your-own
  expect(cells('funnel-weekly_basket-basket_edited')).toEqual(['0', '0%', '0(0%)', '0(0%)']);
  expect(cells('funnel-weekly_basket-submitted')).toEqual(['1', '50%', '1(100%)', '0(0%)']);
  expect(cells('funnel-weekly_basket-card_saved')).toEqual(['1', '100%', '1(100%)', '0']);
  expect(cells('funnel-cart-cart_started')).toEqual(['2', '']);
  expect(cells('funnel-cart-checkout_opened')).toEqual(['1', '50%']);
  expect(cells('funnel-cart-order_completed')).toEqual(['0', '']);

  expect(within(screen.getByTestId('funnel-activated')).getByText('1')).toBeInTheDocument();
  expect(within(screen.getByTestId('funnel-pending')).getByText('1')).toBeInTheDocument();
  expect(within(screen.getByTestId('funnel-canceled')).getByText('1')).toBeInTheDocument();
  expect(screen.getByText('"יותר מדי"')).toBeInTheDocument();
  expect(screen.getByText(/סיבה: כמויות/)).toBeInTheDocument();
  const whatsapp = screen.getAllByRole('link', { name: 'וואטסאפ' });
  expect(whatsapp.map((link) => link.getAttribute('href').split('?')[0]))
    .toEqual(['https://wa.me/972521112222', 'https://wa.me/972501234567']);
});

test('"last week" reloads the earlier range', async () => {
  const loadEvents = jest.fn(() => Promise.resolve([]));
  render(<FunnelReport subscriptions={[]} loadEvents={loadEvents} now={now} />);
  expect(await screen.findByText(/אין נתוני משפך בטווח הזה/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'שבוע שעבר' }));
  await waitFor(() => expect(loadEvents).toHaveBeenCalledTimes(2));
  expect(loadEvents.mock.calls[1][0]).toEqual(new Date(2026, 10, 15));
});

test('a missing rule shows what to deploy', async () => {
  const loadEvents = () => Promise.reject(Object.assign(new Error('denied'), { code: 'permission-denied' }));
  render(<FunnelReport subscriptions={[]} loadEvents={loadEvents} now={now} />);
  expect(await screen.findByText(/צריך לפרוס את חוקי Firestore/)).toBeInTheDocument();
});
