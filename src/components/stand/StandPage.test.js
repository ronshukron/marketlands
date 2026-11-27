import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StandPage from './StandPage';
import { createStandCheckout, getStandOrderStatus, listStandProducts } from '../../services/standService';

jest.mock('../../services/standService', () => ({
  listStandProducts: jest.fn(),
  createStandCheckout: jest.fn(),
  getStandOrderStatus: jest.fn(),
  describeStandError: (error) => error?.message || 'שגיאה',
}));

const products = [
  { productId: 'tomato', productName: 'עגבנייה', measurementType: 'kg', price: 12, standPrice: 8.4, category: 'ירקות', image: '' },
  { productId: 'berries', productName: 'פטל', measurementType: 'package', price: 22.5, standPrice: 15.75, category: 'פירות', image: '' },
];

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/stand/:standId" element={<StandPage />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  sessionStorage.clear();
  listStandProducts.mockImplementation(() => Promise.resolve({ stand: { name: 'הבסטה של רון', discountPercent: 30, note: '' }, products }));
  createStandCheckout.mockImplementation(() => Promise.resolve({ url: 'https://grow.example/pay' }));
  delete window.location;
  window.location = { assign: jest.fn(), origin: 'http://localhost' };
});

test('lists the store products at the stand price and totals what was entered', async () => {
  renderAt('/stand/s1');
  expect(await screen.findByText('הבסטה של רון')).toBeInTheDocument();
  expect(screen.getByText('30% הנחה על הכל')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('כמה ק"ג עגבנייה'), { target: { value: '1.5' } });
  fireEvent.change(screen.getByLabelText("כמה יח' פטל"), { target: { value: '2' } });
  expect(screen.getByText('2 מוצרים')).toBeInTheDocument();
  expect(screen.getByText('₪44.10')).toBeInTheDocument(); // 1.5 × 8.4 + 2 × 15.75

  fireEvent.change(screen.getByLabelText('חיפוש מוצר'), { target: { value: 'פטל' } });
  expect(screen.queryByLabelText('כמה ק"ג עגבנייה')).toBeNull();
});

test('pays with what was entered and the customer details, then goes to Grow', async () => {
  renderAt('/stand/s1');
  fireEvent.change(await screen.findByLabelText('כמה ק"ג עגבנייה'), { target: { value: '1.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'לתשלום' }));
  fireEvent.change(screen.getByLabelText('שם מלא'), { target: { value: 'דנה כהן' } });
  fireEvent.change(screen.getByLabelText('טלפון נייד'), { target: { value: '0501234567' } });
  fireEvent.click(screen.getByRole('button', { name: /לתשלום מאובטח/ }));
  await waitFor(() => expect(createStandCheckout).toHaveBeenCalledWith({
    standId: 's1',
    items: [{ productId: 'tomato', quantity: 1.5 }],
    customer: { name: 'דנה כהן', phone: '0501234567', email: '' },
  }));
  await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('https://grow.example/pay'));
});

test('a closed stand says so', async () => {
  listStandProducts.mockImplementation(() => Promise.reject(new Error('הבסטה סגורה כרגע.')));
  renderAt('/stand/s1');
  expect(await screen.findByText('הבסטה סגורה כרגע.')).toBeInTheDocument();
});

test('back from Grow: thank you once the hold is in place', async () => {
  getStandOrderStatus.mockImplementation(() => Promise.resolve({ paymentStatus: 'held', total: 12.6 }));
  renderAt('/stand/s1?order=o1');
  expect(await screen.findByText('תודה!')).toBeInTheDocument();
  expect(getStandOrderStatus).toHaveBeenCalledWith('o1');
  expect(listStandProducts).not.toHaveBeenCalled();
});
