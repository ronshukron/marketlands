import {
  applyQuantityPricing,
  buildDefaultQuantityDiscountLabel,
  buildPricingSnapshot,
  getEstimatedLineTotal,
  getEffectiveUnitPrice,
  getQuantityDiscountLabel,
  validateQuantityDiscount,
} from './pricing';

describe('legacy quantity pricing', () => {
  const product = {
    price: 12,
    quantityDiscountThreshold: 5,
    quantityDiscountPrice: 9.5,
  };

  test('uses the base price below the threshold and discounts at the threshold', () => {
    expect(getEffectiveUnitPrice(product, 4)).toBe(12);
    expect(getEffectiveUnitPrice(product, 5)).toBe(9.5);
  });

  test('reprices in both directions when cart quantity crosses the threshold', () => {
    const discounted = applyQuantityPricing(product, 5);
    expect(discounted).toMatchObject({
      basePrice: 12,
      effectivePrice: 9.5,
      price: 9.5,
      quantityDiscountApplied: true,
    });

    const regular = applyQuantityPricing(discounted, 4);
    expect(regular).toMatchObject({
      basePrice: 12,
      effectivePrice: 12,
      price: 12,
      quantityDiscountApplied: false,
    });
  });

  test('uses the discounted price for estimated weighed totals', () => {
    expect(getEstimatedLineTotal({
      ...product,
      quantity: 5,
      measurementType: 'unit',
      averageWeightKg: 2,
    })).toBe(95);
  });

  test('creates a stable order-line pricing snapshot', () => {
    expect(buildPricingSnapshot({ ...product, quantity: 5 })).toEqual({
      basePrice: 12,
      effectivePrice: 9.5,
      threshold: 5,
      quantityDiscountThreshold: 5,
      quantityDiscountPrice: 9.5,
      quantityDiscountApplied: true,
    });

    expect(getEstimatedLineTotal({
      price: 12,
      effectivePrice: 9.5,
      quantity: 5,
      quantityDiscountApplied: true,
    })).toBe(47.5);
  });

  test('requires a complete discount below the regular price', () => {
    expect(validateQuantityDiscount('', '', 12)).toBe('');
    expect(validateQuantityDiscount(5, '', 12)).toMatch(/גם סף כמות/);
    expect(validateQuantityDiscount(0, 9, 12)).toMatch(/גדול מאפס/);
    expect(validateQuantityDiscount(5, 12, 12)).toMatch(/נמוך מהמחיר הרגיל/);
    expect(validateQuantityDiscount(5, 9, 12)).toBe('');
  });

  test('uses a custom quantity discount label when provided', () => {
    expect(getQuantityDiscountLabel({
      quantityDiscountLabel: 'במבצע 2 ב-14 ₪',
      quantityDiscountThreshold: 2,
      quantityDiscountPrice: 7,
    })).toBe('במבצע 2 ב-14 ₪');
  });

  test('falls back to the default quantity discount label', () => {
    expect(buildDefaultQuantityDiscountLabel(4, 4.9)).toBe('4+ ב-₪4.90 ליחידת מחיר');
    expect(getQuantityDiscountLabel({
      quantityDiscountThreshold: 4,
      quantityDiscountPrice: 4.9,
    })).toBe('4+ ב-₪4.90 ליחידת מחיר');
  });
});
