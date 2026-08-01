import { DEFAULT_NEW_PRODUCT_DAYS, isNewProduct, toProductDate } from './productFreshness';

describe('product freshness', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');

  test('marks products newer than the default fourteen-day window', () => {
    expect(DEFAULT_NEW_PRODUCT_DAYS).toBe(14);
    expect(isNewProduct('2026-07-10T12:00:00.001Z', now)).toBe(true);
    expect(isNewProduct('2026-07-10T12:00:00.000Z', now)).toBe(false);
  });

  test('supports Firestore timestamp-like values', () => {
    const timestamp = { toDate: () => new Date('2026-07-20T12:00:00.000Z') };
    expect(toProductDate(timestamp)).toEqual(new Date('2026-07-20T12:00:00.000Z'));
    expect(isNewProduct(timestamp, now)).toBe(true);
  });

  test('fails closed for invalid, future, or disabled dates', () => {
    expect(isNewProduct(null, now)).toBe(false);
    expect(isNewProduct('invalid', now)).toBe(false);
    expect(isNewProduct('2026-07-25T12:00:00.000Z', now)).toBe(false);
    expect(isNewProduct('2026-07-24T12:00:00.000Z', now, 0)).toBe(false);
  });
});
