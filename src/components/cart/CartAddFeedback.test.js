import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CartAddFeedback from './CartAddFeedback';
import { announceCartAdd, announceCartProblem, flyToCart, subscribeCartFeedback } from '../../utils/cartAddFeedback';

let mockCart;
jest.mock('../../contexts/CartContext', () => ({ useCart: () => mockCart }));

const line = (quantity) => ({ uid: 'u1', id: 'p1', orderId: 'form1', selectedOption: '', quantity });

const renderFeedback = (onOpenCart = jest.fn()) => {
  const cartButtonRef = { current: document.createElement('button') };
  document.body.appendChild(cartButtonRef.current);
  const view = render(<CartAddFeedback cartButtonRef={cartButtonRef} onOpenCart={onOpenCart} />);
  return { ...view, onOpenCart };
};

beforeEach(() => {
  jest.useFakeTimers();
  mockCart = {
    cartItems: [line(1)],
    updateQuantity: jest.fn(),
    cartTotal: 24.5,
    cartLineCount: 3,
    subscriberMode: false,
  };
});
afterEach(() => {
  jest.useRealTimers();
});

test('an add shows a small bubble, not a popup: product, quantity and the cart total', () => {
  renderFeedback();
  act(() => {
    announceCartAdd({ name: 'מלפפון', quantityLabel: '1 ק"ג', match: { orderId: 'form1', id: 'p1', selectedOption: '' } });
  });
  const bubble = screen.getByRole('status');
  expect(bubble).toHaveTextContent('נוסף לסל');
  expect(bubble).toHaveTextContent('מלפפון · 1 ק"ג');
  expect(bubble).toHaveTextContent('בסל: 3 מוצרים · כ-₪24.50');
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('"לסל" opens the cart; the bubble closes by itself after a few seconds', () => {
  const { onOpenCart } = renderFeedback();
  act(() => { announceCartAdd({ name: 'מלפפון' }); });
  fireEvent.click(screen.getByRole('button', { name: /לסל/ }));
  expect(onOpenCart).toHaveBeenCalled();
  expect(screen.queryByRole('status')).toBeNull();

  act(() => { announceCartAdd({ name: 'עגבנייה' }); });
  expect(screen.getByRole('status')).toHaveTextContent('עגבנייה');
  act(() => { jest.advanceTimersByTime(4100); });
  expect(screen.queryByRole('status')).toBeNull();
});

test('"ביטול" puts the line back to its quantity before the add', () => {
  const view = renderFeedback();
  act(() => {
    announceCartAdd({ name: 'מלפפון', match: { orderId: 'form1', id: 'p1', selectedOption: '' } });
  });
  // The add lands on the next render: the line is now 2.
  mockCart = { ...mockCart, cartItems: [line(2)] };
  view.rerender(<CartAddFeedback cartButtonRef={{ current: document.createElement('button') }} />);
  fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
  expect(mockCart.updateQuantity).toHaveBeenCalledWith('u1', 1);
});

test('undo of a new line removes it (quantity 0); no undo button without a match', () => {
  mockCart.cartItems = [];
  const view = renderFeedback();
  act(() => {
    announceCartAdd({ name: 'פלפל', match: { orderId: 'form1', id: 'p1', selectedOption: '' } });
  });
  mockCart = { ...mockCart, cartItems: [line(1)] };
  view.rerender(<CartAddFeedback cartButtonRef={{ current: document.createElement('button') }} />);
  fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
  expect(mockCart.updateQuantity).toHaveBeenCalledWith('u1', 0);

  act(() => { announceCartAdd({ name: 'סל היכרות' }); });
  expect(screen.queryByRole('button', { name: 'ביטול' })).toBeNull();
});

test('a refused add shows the reason in the same place, without cart buttons', () => {
  renderFeedback();
  act(() => { announceCartProblem({ message: 'מלאי לא מספיק: יש רק 2 ק"ג במלאי' }); });
  expect(screen.getByRole('status')).toHaveTextContent('מלאי לא מספיק');
  expect(screen.queryByRole('button', { name: /לסל/ })).toBeNull();
});

test('subscriber mode says "the upcoming delivery"', () => {
  mockCart.subscriberMode = true;
  renderFeedback();
  act(() => { announceCartAdd({ name: 'מלפפון' }); });
  expect(screen.getByRole('status')).toHaveTextContent('נוסף למשלוח הקרוב');
  expect(screen.getByRole('button', { name: /לצפייה במשלוח/ })).toBeInTheDocument();
});

test('the event bus survives a failing listener, and flying without animation support just resolves', async () => {
  const unsubscribe = subscribeCartFeedback(() => { throw new Error('boom'); });
  expect(() => announceCartAdd({ name: 'x' })).not.toThrow();
  unsubscribe();
  await expect(flyToCart(document.createElement('button'), document.createElement('button'))).resolves.toBeUndefined();
  await expect(flyToCart(null, null)).resolves.toBeUndefined();
});
