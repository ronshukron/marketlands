import {
  buildLinkedPromotion,
  discountMatchesPromotion,
  findProductPromotion,
  unlinkProduct,
  upsertPromotion,
} from './linkedDiscount';
import { applyCartPricing, attachGroupPromotionFields, validateGroupPromotion } from './pricing';

const products = [
  { id: 'red', name: 'פטל אדום', price: 22.5, measurementType: 'package' },
  { id: 'black', name: 'פטל שחור', price: 22.5, measurementType: 'package' },
  { id: 'blue', name: 'אוכמניות', price: 30, measurementType: 'package' },
  { id: 'tomato', name: 'עגבניה', price: 9, measurementType: 'kg' },
];

test('linking red to black copies red\'s "2 for ₪40" into a shared promotion the cart applies', () => {
  const promotion = buildLinkedPromotion({
    productId: 'red', linkedIds: ['black'], measurementType: 'package', threshold: '2', price: '20', createId: () => 'promo-1',
  });
  expect(promotion).toEqual({
    id: 'promo-1', active: true, label: '', pricingBasis: 'package', productIds: ['red', 'black'],
    threshold: 2, discountedPrice: 20, bundleTotalPrice: 40,
  });
  expect(validateGroupPromotion({ ...promotion, products, existingPromotions: [] })).toBe('');
  const priced = applyCartPricing(['red', 'black'].map((id) => attachGroupPromotionFields({
    id, orderId: 'form1', price: 22.5, quantity: 1, measurementType: 'package',
  }, promotion)));
  expect(priced.map((item) => item.effectivePrice)).toEqual([20, 20]);
});

test('the same checks as the promotions page: one active promotion per product, same type, below the price', () => {
  const existing = [{ id: 'other', active: true, productIds: ['blue', 'black'], threshold: 2, pricingBasis: 'package', bundleTotalPrice: 50 }];
  const promotion = buildLinkedPromotion({
    productId: 'red', linkedIds: ['black'], measurementType: 'package', threshold: 2, price: 20, createId: () => 'new',
  });
  expect(validateGroupPromotion({ ...promotion, products, existingPromotions: existing })).toBe('פטל שחור כבר שייך למבצע פעיל אחר.');
  const kg = buildLinkedPromotion({ productId: 'red', linkedIds: ['tomato'], measurementType: 'package', threshold: 2, price: 20, createId: () => 'x' });
  expect(validateGroupPromotion({ ...kg, products, existingPromotions: [] })).toBe('כל המוצרים במבצע חייבים להיות מסוג מארז.');
});

test('editing keeps the id and label; upsert replaces it in place', () => {
  const current = { id: 'promo-1', active: true, label: 'פטל', productIds: ['red', 'black'], threshold: 2, pricingBasis: 'package', bundleTotalPrice: 40 };
  const edited = buildLinkedPromotion({
    existing: current, productId: 'red', linkedIds: ['black', 'blue'], measurementType: 'package', threshold: 2, price: 20, createId: () => 'never',
  });
  expect(edited.id).toBe('promo-1');
  expect(edited.label).toBe('פטל');
  const list = upsertPromotion([{ id: 'x' }, current], edited);
  expect(list.map((promo) => promo.id)).toEqual(['x', 'promo-1']);
  expect(list[1].productIds).toEqual(['red', 'black', 'blue']);
  expect(upsertPromotion([], edited)).toEqual([edited]);
});

test('finding the link, and whether it still matches the product discount', () => {
  const promotions = [{ id: 'promo-1', active: true, productIds: ['red', 'black'], threshold: 2, pricingBasis: 'package', bundleTotalPrice: 40 }];
  expect(findProductPromotion(promotions, 'black').id).toBe('promo-1');
  expect(findProductPromotion(promotions, 'blue')).toBeNull();
  expect(findProductPromotion([{ ...promotions[0], active: false }], 'red')).toBeNull();
  expect(discountMatchesPromotion(findProductPromotion(promotions, 'red'), '2', '20')).toBe(true);
  expect(discountMatchesPromotion(findProductPromotion(promotions, 'red'), 3, 19)).toBe(false);
});

test('unlinking: a pair is removed; a larger group keeps the rest', () => {
  const pair = [{ id: 'p', productIds: ['red', 'black'] }, { id: 'q', productIds: ['blue', 'x'] }];
  expect(unlinkProduct(pair, 'red')).toEqual([{ id: 'q', productIds: ['blue', 'x'] }]);
  const group = [{ id: 'p', productIds: ['red', 'black', 'blue'] }];
  expect(unlinkProduct(group, 'red')).toEqual([{ id: 'p', productIds: ['black', 'blue'] }]);
});
