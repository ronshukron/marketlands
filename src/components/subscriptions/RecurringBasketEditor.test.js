import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Swal from 'sweetalert2';
import RecurringBasketEditor from './RecurringBasketEditor';
import {
  describeSubscriptionError,
  getMySubscription,
  listRecurringBasketProducts,
  loadProductsInfo,
  setSubscriptionOrderItem,
  updateRecurringBasket,
} from '../../services/basketSubscriptionService';

jest.mock('sweetalert2', () => ({ fire: jest.fn(() => Promise.resolve({ isConfirmed: true })) }));
jest.mock('../../firebase/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn() }));
jest.mock('../LoadingSpinner', () => () => <div>loading</div>);
jest.mock('./SubscriptionBusyOverlay', () => () => null);
// Stable like the real provider: a new object every render would re-run the page's load.
const mockAuthValue = { currentUser: { uid: 'u1' }, userRole: 'customer', loading: false };
jest.mock('../../contexts/authContext', () => ({ useAuth: () => mockAuthValue }));
// CRA resets mock implementations before each test; they are set in beforeEach.
jest.mock('../../services/basketSubscriptionService', () => ({
  describeSubscriptionError: jest.fn(),
  getMySubscription: jest.fn(),
  listRecurringBasketProducts: jest.fn(),
  loadProductsInfo: jest.fn(),
  setSubscriptionOrderItem: jest.fn(),
  updateRecurringBasket: jest.fn(),
}));
// The lines editor is tested on its own; here one button stands for "the customer changed the basket".
jest.mock('./RecurringLinesEditor', () => ({ lines, setLines }) => (
  <button
    type="button"
    onClick={() => setLines([
      ...lines.filter((line) => line.productId !== 'tomato').map((line) => ({ ...line, quantity: 2 })),
      { productId: 'onion', quantity: 1, selectedOption: '', productName: 'בצל', measurementType: 'kg', formId: 'f2' },
    ])}
  >
    change basket
  </button>
));

let mockSubscriber;
jest.mock('../../contexts/SubscriberContext', () => ({ useSubscriber: () => mockSubscriber }));

const subscription = {
  id: 'sub1',
  userId: 'u1',
  status: 'active',
  community: 'אור הנר',
  basketTitle: 'סל ירקות',
  nextDeliveryDate: '2026-12-02',
  recurringLines: [
    { productId: 'cucumber', quantity: 1, selectedOption: '', productName: 'מלפפון', orderId: 'f1' },
    { productId: 'tomato', quantity: 1, selectedOption: '', productName: 'עגבנייה', orderId: 'f1' },
  ],
};

const renderEditor = () => render(
  <MemoryRouter initialEntries={['/my-subscriptions/sub1/basket']}>
    <Routes>
      <Route path="/my-subscriptions/:subscriptionId/basket" element={<RecurringBasketEditor />} />
    </Routes>
  </MemoryRouter>,
);

const openDelivery = () => ({
  active: true,
  delivery: { state: 'open', deliveryDate: '2026-11-25', subscription: { id: 'sub1' } },
  order: { id: 'order1' },
});

describe('RecurringBasketEditor', () => {
  beforeEach(() => {
    describeSubscriptionError.mockImplementation(() => 'שגיאה');
    listRecurringBasketProducts.mockImplementation(() => Promise.resolve({ products: [] }));
    loadProductsInfo.mockImplementation(() => Promise.resolve({
      cucumber: { name: 'מלפפון', price: 8 },
      tomato: { name: 'עגבנייה', price: 10 },
    }));
    getMySubscription.mockImplementation(() => Promise.resolve(subscription));
    updateRecurringBasket.mockImplementation(() => Promise.resolve({ ok: true }));
    setSubscriptionOrderItem.mockImplementation(() => Promise.resolve({ ok: true }));
    Swal.fire.mockImplementation(() => Promise.resolve({ isConfirmed: true }));
    mockSubscriber = openDelivery();
  });

  test('the top strip says the recurring basket is edited and from which delivery', async () => {
    renderEditor();
    expect(await screen.findByText(/עורכים את הסל הקבוע · השינוי יחול על כל המשלוחים מיום רביעי, 2\.12 והלאה/)).toBeInTheDocument();
    expect(screen.getByText(/המשלוח של יום רביעי, 25\.11 כבר נפתח ולא ישתנה/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'לעריכת המשלוח הזה' })).toBeInTheDocument();
  });

  test('saving offers the open delivery; yes applies each changed product once', async () => {
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'change basket' }));
    fireEvent.click(screen.getByRole('button', { name: 'שמירת הסל הקבוע' }));

    await waitFor(() => expect(setSubscriptionOrderItem).toHaveBeenCalledTimes(3));
    expect(updateRecurringBasket).toHaveBeenCalledWith('sub1', [
      { productId: 'cucumber', quantity: 2, selectedOption: '' },
      { productId: 'onion', quantity: 1, selectedOption: '' },
    ]);
    const question = Swal.fire.mock.calls[0][0];
    expect(question.html).toContain('להחיל את השינויים גם על המשלוח של יום רביעי, 25.11?');
    expect(question.confirmButtonText).toBe('כן, גם על המשלוח הקרוב');
    expect(question.cancelButtonText).toBe('לא, רק מהמשלוח הבא');

    const calls = setSubscriptionOrderItem.mock.calls.map(([args]) => [args.productId, args.quantity, args.formId]);
    expect(calls).toEqual(expect.arrayContaining([
      ['cucumber', 2, 'f1'],
      ['onion', 1, 'f2'],
      ['tomato', 0, 'f1'],
    ]));
    expect(setSubscriptionOrderItem.mock.calls.every(([args]) => args.orderId === 'order1')).toBe(true);
  });

  test('no leaves the open delivery alone', async () => {
    Swal.fire.mockImplementation(() => Promise.resolve({ isConfirmed: false }));
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'change basket' }));
    fireEvent.click(screen.getByRole('button', { name: 'שמירת הסל הקבוע' }));
    await waitFor(() => expect(Swal.fire).toHaveBeenCalledTimes(1));
    expect(updateRecurringBasket).toHaveBeenCalledTimes(1);
    expect(setSubscriptionOrderItem).not.toHaveBeenCalled();
  });

  test('refusals are listed by product name in one summary', async () => {
    setSubscriptionOrderItem.mockImplementation(({ productId }) => (
      productId === 'onion'
        ? Promise.reject({ response: { data: { error: 'FORM_CLOSED' } } })
        : Promise.resolve({ ok: true })
    ));
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'change basket' }));
    fireEvent.click(screen.getByRole('button', { name: 'שמירת הסל הקבוע' }));
    await waitFor(() => expect(Swal.fire).toHaveBeenCalledTimes(2));
    const summary = Swal.fire.mock.calls[1][0];
    expect(summary.title).toBe('המשלוח של יום רביעי, 25.11 עודכן חלקית');
    expect(summary.html).toContain('בצל: ההזמנה מהחקלאי כבר נסגרה');
  });

  test('without an open delivery, saving just confirms from which delivery it applies', async () => {
    mockSubscriber = { active: false, delivery: { state: 'none' } };
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'change basket' }));
    fireEvent.click(screen.getByRole('button', { name: 'שמירת הסל הקבוע' }));
    await waitFor(() => expect(Swal.fire).toHaveBeenCalledTimes(1));
    expect(Swal.fire.mock.calls[0][0].text).toBe('השינוי יחול על כל המשלוחים מיום רביעי, 2.12 והלאה.');
    expect(setSubscriptionOrderItem).not.toHaveBeenCalled();
  });
});
