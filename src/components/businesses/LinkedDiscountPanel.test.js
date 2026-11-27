import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Swal from 'sweetalert2';
import LinkedDiscountPanel, { saveLinkedDiscount } from './LinkedDiscountPanel';
import { getBusinessProductPromotions, saveBusinessProductPromotions } from '../../services/productPromotionService';

jest.mock('sweetalert2', () => ({ fire: jest.fn(() => Promise.resolve({ isConfirmed: true })) }));
jest.mock('../../firebase/firebase', () => ({ db: {} }));
let mockProducts = [];
jest.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  getDocs: () => Promise.resolve({ docs: mockProducts.map((product) => ({ id: product.id, data: () => product })) }),
}));
jest.mock('../../services/productPromotionService', () => ({
  getBusinessProductPromotions: jest.fn(),
  saveBusinessProductPromotions: jest.fn(),
}));

const raspberries = [
  { id: 'red', name: 'פטל אדום', price: 22.5, measurementType: 'package' },
  { id: 'black', name: 'פטל שחור', price: 22.5, measurementType: 'package' },
  { id: 'tomato', name: 'עגבניה', price: 9, measurementType: 'kg' },
  { id: 'pending', name: 'ממתין לאישור', price: 30, measurementType: 'package', verified: false },
];
const pair = { id: 'promo-1', active: true, productIds: ['red', 'black'], threshold: 2, pricingBasis: 'package', bundleTotalPrice: 40 };
const panel = (props = {}) => render(
  <LinkedDiscountPanel
    mode="edit"
    businessId="farm1"
    ownerEmail="farm@example.com"
    productId="red"
    productName="פטל אדום"
    measurementType="package"
    price="22.5"
    threshold="2"
    discountPrice="20"
    {...props}
  />,
);

beforeEach(() => {
  mockProducts = raspberries;
  Swal.fire.mockImplementation(() => Promise.resolve({ isConfirmed: true }));
  saveBusinessProductPromotions.mockImplementation((id, list) => Promise.resolve(list));
});

test('connects red raspberry to black: a shared "2 for ₪40" promotion is saved for the farmer', async () => {
  getBusinessProductPromotions.mockImplementation(() => Promise.resolve([]));
  panel();
  const connect = await screen.findByRole('button', { name: 'לחבר את ההנחה למוצרים נוספים' });
  await waitFor(() => expect(connect).toBeEnabled());
  fireEvent.click(connect);
  // Only approved package products of the farmer, not this one.
  expect(screen.getByRole('checkbox', { name: /פטל שחור/ })).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: /עגבניה/ })).toBeNull();
  expect(screen.queryByRole('checkbox', { name: /ממתין לאישור/ })).toBeNull();
  expect(screen.getByText(/2 ב-₪40.00 מכל המוצרים יחד/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('checkbox', { name: /פטל שחור/ }));
  fireEvent.click(screen.getByRole('button', { name: 'שמירה' }));
  await waitFor(() => expect(saveBusinessProductPromotions).toHaveBeenCalledTimes(1));
  const [businessId, saved] = saveBusinessProductPromotions.mock.calls[0];
  expect(businessId).toBe('farm1');
  expect(saved).toEqual([expect.objectContaining({
    active: true, pricingBasis: 'package', productIds: ['red', 'black'], threshold: 2, discountedPrice: 20, bundleTotalPrice: 40,
  })]);
});

test('linked: shows the other product, and unlinking removes the pair', async () => {
  getBusinessProductPromotions.mockImplementation(() => Promise.resolve([pair]));
  panel();
  expect(await screen.findByText(/מחובר ל: פטל שחור/)).toBeInTheDocument();
  expect(screen.queryByText(/ההנחה כאן שונה/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'ניתוק' }));
  await waitFor(() => expect(saveBusinessProductPromotions).toHaveBeenCalledWith('farm1', []));
});

test('the product discount changed on the form: offers to update the shared one', async () => {
  getBusinessProductPromotions.mockImplementation(() => Promise.resolve([pair]));
  panel({ discountPrice: '19' });
  expect(await screen.findByText(/ההנחה כאן שונה מההנחה המשותפת/)).toBeInTheDocument();
});

test('a validation problem is shown and nothing is saved', async () => {
  getBusinessProductPromotions.mockImplementation(() => Promise.resolve([
    { id: 'other', active: true, productIds: ['black', 'x'], threshold: 2, pricingBasis: 'package', bundleTotalPrice: 30 },
  ]));
  panel();
  const connect = await screen.findByRole('button', { name: 'לחבר את ההנחה למוצרים נוספים' });
  await waitFor(() => expect(connect).toBeEnabled());
  fireEvent.click(connect);
  fireEvent.click(screen.getByRole('checkbox', { name: /פטל שחור/ }));
  fireEvent.click(screen.getByRole('button', { name: 'שמירה' }));
  await waitFor(() => expect(Swal.fire).toHaveBeenCalledWith('לא נשמר', 'פטל שחור כבר שייך למבצע פעיל אחר.', 'error'));
  expect(saveBusinessProductPromotions).not.toHaveBeenCalled();
});

test('kg products and products without a quantity discount cannot be linked', async () => {
  getBusinessProductPromotions.mockImplementation(() => Promise.resolve([]));
  const { unmount } = panel({ measurementType: 'kg' });
  expect(screen.getByText(/רק במוצרים שנמכרים במארז או ביחידה/)).toBeInTheDocument();
  unmount();
  panel({ threshold: '', discountPrice: '' });
  expect(await screen.findByText('קודם מלאו הנחת כמות למוצר הזה.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'לחבר את ההנחה למוצרים נוספים' })).toBeDisabled();
});

test('on a new product the choice is saved right after the product is created', async () => {
  getBusinessProductPromotions.mockImplementation(() => Promise.resolve([]));
  const error = await saveLinkedDiscount({
    businessId: 'farm1', ownerEmail: 'farm@example.com', productId: 'new-red', productName: 'פטל אדום',
    measurementType: 'package', price: '22.5', threshold: 2, discountPrice: 20, linkedIds: ['black'],
  });
  expect(error).toBe('');
  expect(saveBusinessProductPromotions.mock.calls[0][1][0].productIds).toEqual(['new-red', 'black']);
});
