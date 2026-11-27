import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Swal from 'sweetalert2';
import SubscriptionCart from './SubscriptionCart';
import { addProductToRecurringBasket } from '../../services/basketSubscriptionService';

jest.mock('sweetalert2', () => ({ fire: jest.fn(() => Promise.resolve({ isConfirmed: true })) }));
jest.mock('../../services/basketSubscriptionService', () => ({
  addProductToRecurringBasket: jest.fn(() => Promise.resolve({ alreadyThere: false })),
  describeSubscriptionError: jest.fn(() => 'שגיאה'),
}));
jest.mock('./SubscriberOrderBar', () => ({
  useConfirmSubscriberOrder: () => ({ confirm: jest.fn(), confirming: false }),
}));

let mockSubscriber;
jest.mock('../../contexts/SubscriberContext', () => ({ useSubscriber: () => mockSubscriber }));

const item = (id, name, source, extra = {}) => ({
  uid: `sub::${id}`, key: `${id}|`, id, name, price: 10, quantity: 1, measurementType: 'kg', orderId: 'form1', source, ...extra,
});

const renderCart = () => render(
  <MemoryRouter>
    <SubscriptionCart isOpen onClose={jest.fn()} />
  </MemoryRouter>,
);

describe('SubscriptionCart: the open delivery', () => {
  beforeEach(() => {
    Swal.fire.mockImplementation(() => Promise.resolve({ isConfirmed: true }));
    addProductToRecurringBasket.mockImplementation(() => Promise.resolve({ alreadyThere: false }));
    mockSubscriber = {
      active: true,
      delivery: {
        state: 'open',
        deliveryDate: '2026-11-25',
        subscription: { id: 'sub1', community: 'אור הנר', deliveryOption: 'pickup', nextDeliveryDate: '2026-12-02', recurringLines: [] },
      },
      order: { id: 'order1', customerDetails: { deliveryDetails: { deliveryFee: 0 } } },
      items: [
        item('cucumber', 'מלפפון', 'basket'),
        item('broccoli', 'ברוקולי', 'customer_added', { measurementType: 'unit', quantity: 2 }),
      ],
      cutoffAt: null,
      opensAt: null,
      saveStatus: 'saved',
      setItemQuantity: jest.fn(),
      unconfirmedCount: 0,
    };
  });

  test('the header names the delivery and says it is one-time', () => {
    renderCart();
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('המשלוח של יום רביעי, 25.11');
    expect(heading).toHaveTextContent('חד-פעמי');
    expect(screen.getByText('השינויים כאן חלים על המשלוח הזה בלבד.')).toBeInTheDocument();
  });

  test('each line says where it came from', () => {
    renderCart();
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText('מהסל הקבוע')).toBeInTheDocument();
    expect(within(rows[1]).getByText('נוסף למשלוח הזה בלבד')).toBeInTheDocument();
    expect(within(rows[0]).queryByRole('button', { name: /להוסיף גם לסל הקבוע/ })).toBeNull();
  });

  test('a line added to this delivery only can be kept in the recurring basket', async () => {
    renderCart();
    fireEvent.click(screen.getByRole('button', { name: /להוסיף גם לסל הקבוע/ }));
    await waitFor(() => expect(addProductToRecurringBasket).toHaveBeenCalledTimes(1));
    expect(addProductToRecurringBasket).toHaveBeenCalledWith(
      mockSubscriber.delivery.subscription,
      expect.objectContaining({ productId: 'broccoli', quantity: 2, measurementType: 'unit', formId: 'form1' }),
    );
  });

  test('the maximum-lines refusal is explained', async () => {
    addProductToRecurringBasket.mockImplementation(() => Promise.reject({ response: { data: { error: 'TOO_MANY_LINES' } } }));
    renderCart();
    fireEvent.click(screen.getByRole('button', { name: /להוסיף גם לסל הקבוע/ }));
    await waitFor(() => expect(Swal.fire).toHaveBeenLastCalledWith(
      'לא נוסף לסל הקבוע',
      expect.stringContaining('מספר המוצרים המרבי'),
      'warning',
    ));
  });

  test('a product already in the customer recurring lines shows that instead of the action', () => {
    mockSubscriber.delivery.subscription.recurringLines = [{ productId: 'broccoli', quantity: 2, selectedOption: '' }];
    renderCart();
    expect(screen.getByText('נוסף גם לסל הקבוע')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /להוסיף גם לסל הקבוע/ })).toBeNull();
  });

  test('the footer links to the recurring basket editor', () => {
    renderCart();
    expect(screen.getByRole('link', { name: /עריכת הסל הקבוע/ })).toHaveAttribute('href', '/my-subscriptions/sub1/basket');
  });
});
