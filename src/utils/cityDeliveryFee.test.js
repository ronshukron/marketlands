import {
  computeCityDeliveryFee,
  getProductSubtotal,
  SHIPPING_PRODUCT_ID,
} from './cityDeliveryFee';

const city = { placeType: 'city', deliveryFee: 30, freeShippingMinCart: 200 };

describe('computeCityDeliveryFee', () => {
  test('charges the fee under the threshold', () => {
    expect(computeCityDeliveryFee(city, 199.99)).toBe(30);
  });

  test('is free exactly at the threshold', () => {
    expect(computeCityDeliveryFee(city, 200)).toBe(0);
  });

  test('is free above the threshold', () => {
    expect(computeCityDeliveryFee(city, 450)).toBe(0);
  });

  test('always charges the fee when no threshold is set', () => {
    expect(computeCityDeliveryFee({ ...city, freeShippingMinCart: 0 }, 1000)).toBe(30);
    expect(computeCityDeliveryFee({ ...city, freeShippingMinCart: '' }, 1000)).toBe(30);
  });

  test('ignores the threshold for settlements', () => {
    expect(computeCityDeliveryFee({ ...city, placeType: 'community' }, 1000)).toBeNull();
    expect(computeCityDeliveryFee({ deliveryFee: 25 }, 1000)).toBeNull();
  });
});

describe('getProductSubtotal', () => {
  test('excludes the shipping line', () => {
    const items = [
      { id: 'a', price: 50, quantity: 2 },
      { id: SHIPPING_PRODUCT_ID, price: 30, quantity: 1, isShipping: true },
    ];
    expect(getProductSubtotal(items)).toBe(100);
  });
});
