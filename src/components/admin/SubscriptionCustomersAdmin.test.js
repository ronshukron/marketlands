import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Swal from 'sweetalert2';
import SubscriptionCustomersAdmin from './SubscriptionCustomersAdmin';
import {
  listAllSubscriptions,
  listSubscriptionOrders,
  updateBasketSubscription,
} from '../../services/basketSubscriptionService';

jest.mock('../../firebase/firebase', () => ({ db: {}, auth: {} }));
jest.mock('sweetalert2', () => ({ fire: jest.fn(() => Promise.resolve({ isConfirmed: true })) }));
jest.mock('../../contexts/authContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'rfHOLhNoJOW8ByNypCtm3hlSNKs2' }, userRole: 'admin', loading: false }),
}));
jest.mock('../../services/basketSubscriptionService', () => ({
  FREQUENCY_LABELS: { weekly: 'כל שבוע', biweekly: 'כל שבועיים' },
  SUBSCRIPTION_STATUS_LABELS: {
    pending_card: 'ממתין לשמירת כרטיס', active: 'פעיל', paused: 'מושהה', payment_failed: 'החיוב נכשל', canceled: 'בוטל',
  },
  describeSubscriptionError: () => 'הפעולה נכשלה',
  listAllSubscriptions: jest.fn(),
  listSubscriptionOrders: jest.fn(),
  updateBasketSubscription: jest.fn(),
}));

const SUBS = [
  {
    id: 'subActive',
    status: 'active',
    userId: 'customer1',
    basketId: 'basketSmall',
    basketTitle: 'סל בסיס קטן',
    community: 'בית קמה',
    frequency: 'weekly',
    deliveryOption: 'pickup',
    nextDeliveryDate: '2099-12-02',
    skipDates: [],
    card: { status: 'saved', last4: '1234', brand: 'Visa', exp: '1228' },
    customerDetails: { name: 'דנה לוי', phone: '050-1111111', email: 'dana@example.com' },
    recurringLines: [{ productId: 'cucumber', productName: 'מלפפון', quantity: 1 }],
    adminActions: [{ action: 'frequency', uid: 'rfHOLhNoJOW8ByNypCtm3hlSNKs2', at: '2026-11-20T10:00:00Z', frequency: 'weekly' }],
  },
  {
    id: 'subPaused',
    status: 'paused',
    pauseReason: 'customer',
    userId: 'customer2',
    basketId: 'basketBig',
    basketTitle: 'סל בסיס גדול',
    community: 'כרמים',
    frequency: 'biweekly',
    card: { status: 'saved' },
    customerDetails: { name: 'יוסי כהן', phone: '052-2222222' },
  },
  {
    id: 'subCanceled',
    status: 'canceled',
    userId: 'customer3',
    basketId: 'basketSmall',
    basketTitle: 'סל בסיס קטן',
    community: 'בית קמה',
    frequency: 'weekly',
    customerDetails: { name: 'רונית' },
  },
];

// The subscription row that shows this customer (the first list item with the name).
const rowFor = async (name) => {
  await screen.findByText(name);
  return screen.getAllByRole('listitem').find((item) => within(item).queryByText(name));
};

const renderPage = () => render(<MemoryRouter><SubscriptionCustomersAdmin /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  Swal.fire.mockResolvedValue({ isConfirmed: true });
  listAllSubscriptions.mockResolvedValue(SUBS);
  listSubscriptionOrders.mockResolvedValue([
    { id: 'sub_subActive_2099-11-25', deliveryDate: '2099-11-25', paymentStatus: 'held', delayedOrderStatus: 'pending_weighing', grandTotal: 120 },
  ]);
  updateBasketSubscription.mockResolvedValue({ ok: true });
});

test('lists open subscriptions by default and filters by status, community and search', async () => {
  renderPage();
  expect(await screen.findByText('דנה לוי')).toBeInTheDocument();
  expect(screen.getByText('יוסי כהן')).toBeInTheDocument();
  expect(screen.queryByText('רונית')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^הכל/ }));
  expect(screen.getByText('רונית')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^מושהה/ }));
  expect(screen.queryByText('דנה לוי')).not.toBeInTheDocument();
  expect(screen.getByText('יוסי כהן')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^פתוחים/ }));
  fireEvent.change(screen.getByLabelText('סינון לפי יישוב'), { target: { value: 'בית קמה' } });
  expect(screen.getByText('דנה לוי')).toBeInTheDocument();
  expect(screen.queryByText('יוסי כהן')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('סינון לפי יישוב'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('חיפוש מנוי'), { target: { value: '052' } });
  expect(screen.queryByText('דנה לוי')).not.toBeInTheDocument();
  expect(screen.getByText('יוסי כהן')).toBeInTheDocument();
});

test('details show the customer, deliveries and log; actions call the server for that subscription', async () => {
  renderPage();
  const row = await rowFor('דנה לוי');
  fireEvent.click(within(row).getByRole('button', { expanded: false }));

  expect(await within(row).findByText('sub_subActive_2099-11-25')).toBeInTheDocument();
  expect(within(row).getByText('dana@example.com')).toHaveAttribute('href', 'mailto:dana@example.com');
  expect(within(row).getByText('Visa · מסתיים ב-1234 · תוקף 12/28')).toBeInTheDocument();
  expect(within(row).getByText(/סל אישי · 1 מוצרים/)).toBeInTheDocument();
  expect(within(row).getByRole('link', { name: 'עריכת הסל של הלקוח' })).toHaveAttribute('href', '/my-subscriptions/subActive/basket');
  expect(within(row).getByText(/שינוי תדירות/)).toBeInTheDocument();

  fireEvent.click(within(row).getByRole('button', { name: 'השהיה' }));
  await waitFor(() => expect(updateBasketSubscription).toHaveBeenCalledWith('subActive', 'pause', {}));
  expect(Swal.fire).toHaveBeenCalledWith(expect.objectContaining({ title: 'להשהות את המנוי?' }));
  await waitFor(() => expect(listAllSubscriptions).toHaveBeenCalledTimes(2));

  const skipButtons = within(row).getAllByRole('button', { name: 'דילוג' });
  fireEvent.click(skipButtons[skipButtons.length - 1]);
  await waitFor(() => expect(updateBasketSubscription).toHaveBeenCalledWith('subActive', 'skip', { deliveryDate: '2099-11-25' }));
});

test('a canceled confirm sends nothing, and a server error is shown', async () => {
  renderPage();
  const row = await rowFor('יוסי כהן');
  fireEvent.click(within(row).getByRole('button', { expanded: false }));

  Swal.fire.mockResolvedValueOnce({ isConfirmed: false });
  fireEvent.click(await within(row).findByRole('button', { name: 'ביטול מנוי' }));
  await waitFor(() => expect(Swal.fire).toHaveBeenCalled());
  expect(updateBasketSubscription).not.toHaveBeenCalled();

  updateBasketSubscription.mockRejectedValueOnce(new Error('NO_CARD'));
  fireEvent.click(within(row).getByRole('button', { name: 'חידוש' }));
  await waitFor(() => expect(Swal.fire).toHaveBeenCalledWith('הפעולה נכשלה', 'הפעולה נכשלה', 'error'));
});
