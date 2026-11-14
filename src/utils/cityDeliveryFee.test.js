import {
  computeCityDeliveryFee,
  describeCityShipping,
  formatShekels,
  getCityShippingInfo,
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

  test('counts an introduction basket at the price the customer pays', () => {
    const items = [
      { id: 'a', price: 80, quantity: 1, measurementType: 'package', isBasketComponent: true, basketInstanceId: 'i1' },
      { id: 'b', price: 60, quantity: 1, measurementType: 'package', isBasketComponent: true, basketInstanceId: 'i1' },
      {
        id: 'intro-basket-adjustment:b1:i1',
        price: -40,
        quantity: 1,
        measurementType: 'package',
        isShipping: true,
        isBasketAdjustment: true,
        basketInstanceId: 'i1',
      },
      { id: SHIPPING_PRODUCT_ID, price: 30, quantity: 1, isShipping: true },
    ];
    expect(getProductSubtotal(items)).toBe(100);
  });
});

describe('getCityShippingInfo / describeCityShipping', () => {
  test('says nothing for settlements and for cities with free delivery', () => {
    expect(getCityShippingInfo({ placeType: 'community', deliveryFee: 25 }, 0)).toBeNull();
    expect(getCityShippingInfo({ placeType: 'city', deliveryFee: 0, freeShippingMinCart: 200 }, 0)).toBeNull();
    expect(getCityShippingInfo(null, 0)).toBeNull();
    expect(describeCityShipping(null)).toBe('');
  });

  test('announces the fee and the threshold before anything is in the cart', () => {
    const info = getCityShippingInfo(city, 0);
    expect(info).toEqual({ fee: 30, threshold: 200, isFree: false, missing: 200 });
    expect(describeCityShipping(info)).toBe('משלוח עד הבית ₪30. משלוח חינם בהזמנה מעל ₪200');
  });

  test('shows how much is missing once the cart has items', () => {
    const info = getCityShippingInfo(city, 152.5);
    expect(info.missing).toBe(47.5);
    expect(describeCityShipping(info, { hasItems: true }))
      .toBe('חסרים עוד ₪47.50 למשלוח חינם (משלוח עד הבית ₪30)');
  });

  test('confirms free shipping at the threshold', () => {
    const info = getCityShippingInfo(city, 200);
    expect(info).toEqual({ fee: 30, threshold: 200, isFree: true, missing: 0 });
    expect(describeCityShipping(info, { hasItems: true })).toBe('הגעתם ל-₪200, המשלוח עד הבית חינם');
  });

  test('shows only the fee when the city has no free-shipping threshold', () => {
    const info = getCityShippingInfo({ ...city, freeShippingMinCart: 0 }, 500);
    expect(info).toEqual({ fee: 30, threshold: 0, isFree: false, missing: 0 });
    expect(describeCityShipping(info, { hasItems: true })).toBe('משלוח עד הבית ₪30');
  });

  test('formats whole and fractional amounts', () => {
    expect(formatShekels(200)).toBe('₪200');
    expect(formatShekels(12.5)).toBe('₪12.50');
  });
});
