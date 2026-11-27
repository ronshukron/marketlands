import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Swal from 'sweetalert2';
import MySubscriptions from './MySubscriptions';
import { listMySubscriptions, updateBasketSubscription } from '../../services/basketSubscriptionService';

jest.mock('sweetalert2', () => ({ fire: jest.fn(), getPopup: () => null }));
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

const subscription = {
  id: 's1',
  status: 'active',
  basketTitle: 'סל ירקות',
  community: 'X',
  deliveryOption: 'pickup',
  frequency: 'weekly',
  nextDeliveryDate: '2099-12-02',
  customerDetails: { name: 'דנה', phone: '050-1234567' },
  card: { status: 'saved', last4: '4580' },
  notifications: { whatsapp: { optIn: false } },
};

const renderPage = () => render(<MemoryRouter><MySubscriptions /></MemoryRouter>);

beforeEach(() => {
  listMySubscriptions.mockImplementation(() => Promise.resolve([subscription]));
  updateBasketSubscription.mockImplementation(() => Promise.resolve({ ok: true }));
});

test('cancel asks why and sends the answer with the action', async () => {
  Swal.fire.mockImplementation(() => Promise.resolve({ isConfirmed: true, value: { reason: 'price', note: 'יקר' } }));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'ביטול ההרשמה' }));
  await waitFor(() => expect(updateBasketSubscription).toHaveBeenCalledWith('s1', 'cancel', { reason: 'price', note: 'יקר' }));
  expect(Swal.fire.mock.calls[0][0].html).toContain('מה הסיבה?');
});

test('pause explains the open delivery, and says when it already closed', async () => {
  Swal.fire.mockImplementation(() => Promise.resolve({ isConfirmed: true, value: {} }));
  updateBasketSubscription.mockImplementation(() => Promise.resolve({
    ok: true, canceledOrderIds: [], keptOrders: [{ orderId: 'o2', deliveryDate: '2026-12-02' }],
  }));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'השהיה' }));
  await waitFor(() => expect(Swal.fire).toHaveBeenCalledTimes(2));
  expect(Swal.fire.mock.calls[0][0].html).toContain('משלוח שכבר נפתח ועוד לא נסגר להזמנות יבוטל');
  expect(Swal.fire.mock.calls[1][0].text).toContain('כבר נסגר להזמנות ויגיע כרגיל');
});

test('pause without an answer still pauses', async () => {
  Swal.fire.mockImplementation(() => Promise.resolve({ isConfirmed: true, value: {} }));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'השהיה' }));
  await waitFor(() => expect(updateBasketSubscription).toHaveBeenCalledWith('s1', 'pause', {}));
});

test('saying no does nothing', async () => {
  Swal.fire.mockImplementation(() => Promise.resolve({ isConfirmed: false }));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'ביטול ההרשמה' }));
  await waitFor(() => expect(Swal.fire).toHaveBeenCalled());
  expect(updateBasketSubscription).not.toHaveBeenCalled();
});
