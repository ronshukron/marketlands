import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MySubscriptions from './MySubscriptions';
import { listMySubscriptions, updateBasketSubscription } from '../../services/basketSubscriptionService';

jest.mock('sweetalert2', () => ({ fire: () => Promise.resolve({ isConfirmed: true }) }));
const mockAuth = { currentUser: { uid: 'u1' }, loading: false };
jest.mock('../../contexts/authContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../contexts/SubscriberContext', () => ({ useSubscriber: () => ({ active: false }) }));
jest.mock('./SecureCardProgress', () => {
  const Progress = () => null;
  return { __esModule: true, default: Progress, useResetOnPageRestore: () => {} };
});
jest.mock('./SubscriptionBusyOverlay', () => () => null);
jest.mock('../../services/basketSubscriptionService', () => ({
  CARD_CONSENT_TEXT: 'consent',
  FREQUENCY_LABELS: { weekly: 'כל שבוע', biweekly: 'כל שבועיים' },
  SUBSCRIPTION_STATUS_LABELS: { active: 'פעיל' },
  cardConsentPayload: () => ({}),
  confirmBasketSubscriptionCard: () => Promise.resolve({}),
  describeSubscriptionError: () => 'שגיאה',
  listMySubscriptions: jest.fn(),
  listSubscriptionOrders: () => Promise.resolve([]),
  loadCommunitySchedule: () => Promise.resolve(null),
  updateBasketSubscription: jest.fn(),
}));

const subscription = (overrides = {}) => ({
  id: 's1',
  status: 'active',
  basketTitle: 'סל ירקות',
  community: 'X',
  deliveryOption: 'pickup',
  frequency: 'weekly',
  nextDeliveryDate: '2099-12-02',
  customerDetails: { name: 'דנה', phone: '050-1234567' },
  card: { status: 'saved', last4: '4580' },
  ...overrides,
});

const renderPage = () => render(<MemoryRouter><MySubscriptions /></MemoryRouter>);

beforeEach(() => {
  updateBasketSubscription.mockImplementation(() => Promise.resolve({ ok: true }));
});

test('an existing customer who never chose is asked once; the answer is saved', async () => {
  listMySubscriptions.mockImplementation(() => Promise.resolve([subscription()]));
  renderPage();
  expect(await screen.findByText('רוצים תזכורת בוואטסאפ כמה שעות לפני סגירת ההזמנות?')).toBeInTheDocument();
  expect(screen.queryByRole('switch')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'כן, שלחו לי' }));
  await waitFor(() => expect(updateBasketSubscription).toHaveBeenCalledWith('s1', 'whatsapp_opt_in', { enabled: true }));
});

test('after a choice: a switch with the phone digits, which turns the reminder off', async () => {
  listMySubscriptions.mockImplementation(() => Promise.resolve([
    subscription({ notifications: { whatsapp: { optIn: true, phoneE164: '972501234567' } } }),
  ]));
  renderPage();
  const toggle = await screen.findByRole('switch', { name: 'תזכורת בוואטסאפ לפני סגירת ההזמנות' });
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByText('למספר שמסתיים ב-4567')).toBeInTheDocument();
  expect(screen.queryByText('רוצים תזכורת בוואטסאפ כמה שעות לפני סגירת ההזמנות?')).toBeNull();
  fireEvent.click(toggle);
  await waitFor(() => expect(updateBasketSubscription).toHaveBeenCalledWith('s1', 'whatsapp_opt_in', { enabled: false }));
});
