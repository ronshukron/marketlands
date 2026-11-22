import React from 'react';
import { act, render } from '@testing-library/react';

const mockSubscriber = {
  active: true,
  items: [{
    uid: 'sub::line-1', key: 'cucumber|', id: 'cucumber', name: 'מלפפון', price: 8, quantity: 1, measurementType: 'kg', orderId: 'f1',
  }],
  addToOrder: jest.fn(() => true),
  setQuantityByUid: jest.fn(() => true),
};

jest.mock('./SubscriberContext', () => ({
  useSubscriber: () => mockSubscriber,
}));
jest.mock('./WeightBufferContext', () => ({
  useWeightBuffer: () => ({ bufferPercent: 0 }),
}));
// CartProvider needs a stable decorateProduct (the app's provider gives one).
jest.mock('./CommunityWeeklyPromotionContext', () => {
  const ReactActual = jest.requireActual('react');
  const identity = (item) => item;
  return { __esModule: true, default: ReactActual.createContext({ decorateProduct: identity }) };
});
jest.mock('../firebase/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn() }));
jest.mock('../services/orderGoLiveService', () => ({ attachGoLiveLinkedOrders: jest.fn(async (orders) => orders) }));
jest.mock('../utils/metaPixel', () => ({ trackAddToCart: jest.fn() }));

// eslint-disable-next-line import/first
import { CartProvider, useCart, useCartActions } from './CartContext';

const mountCart = () => {
  const api = {};
  const Probe = () => {
    Object.assign(api, useCart(), { actions: useCartActions() });
    return null;
  };
  render(<CartProvider><Probe /></CartProvider>);
  return api;
};

describe('CartProvider in subscriber mode', () => {
  beforeEach(() => {
    localStorage.clear();
    // CRA resets mock implementations before each test.
    mockSubscriber.addToOrder.mockImplementation(() => true);
    mockSubscriber.setQuantityByUid.mockImplementation(() => true);
  });

  test('the cart shows the upcoming delivery and its totals', () => {
    const cart = mountCart();
    expect(cart.subscriberMode).toBe(true);
    expect(cart.cartItems.map((item) => item.id)).toEqual(['cucumber']);
    expect(cart.cartTotal).toBe(8);
    expect(cart.totalItems).toBe(1);
  });

  test('add, change and remove are saved to the delivery, not the local cart', () => {
    const cart = mountCart();
    let added;
    act(() => {
      added = cart.addItem({ id: 'broccoli', quantity: 1 }, 'f2', 'b2', 0, 0);
    });
    expect(added).toBe(true);
    expect(mockSubscriber.addToOrder).toHaveBeenCalledWith({ id: 'broccoli', quantity: 1 }, 'f2');
    expect(cart.actions.addItem).toBe(cart.addItem);

    act(() => cart.updateQuantity('sub::line-1', 2));
    expect(mockSubscriber.setQuantityByUid).toHaveBeenLastCalledWith('sub::line-1', 2);
    act(() => cart.removeItem('sub::line-1'));
    expect(mockSubscriber.setQuantityByUid).toHaveBeenLastCalledWith('sub::line-1', 0);

    // The regular cart saved in the browser is left as it was.
    const savedRegularCart = localStorage.getItem('cartItems');
    expect(savedRegularCart).not.toBeNull();
    act(() => cart.clearCart());
    expect(localStorage.getItem('cartItems')).toBe(savedRegularCart);
  });
});
