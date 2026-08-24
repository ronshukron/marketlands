import {
  applyCartPricing,
  applyQuantityPricing,
  attachGroupPromotionFields,
  buildDefaultGroupPromotionLabel,
  buildDefaultQuantityDiscountLabel,
  buildPricingSnapshot,
  evaluateOrderMinimum,
  formatOrderMinimumFailure,
  getEstimatedLineTotal,
  getEffectiveUnitPrice,
  getEligibleMinimumItemCount,
  getQuantityDiscountLabel,
  validateGroupPromotion,
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
      groupPromotionId: null,
      groupPromotionLabel: null,
      groupPromotionThreshold: null,
      groupPromotionPrice: null,
      groupPromotionPricingBasis: null,
      groupPromotionApplied: false,
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

const greensPromo = {
  id: 'greens-3-10',
  active: true,
  label: 'הנחה על ירק 3 ב-10',
  productIds: ['cilantro', 'parsley', 'dill'],
  threshold: 3,
  pricingBasis: 'package',
  discountedPrice: 10 / 3,
  bundleTotalPrice: 10,
};

const attachGreen = (item) => attachGroupPromotionFields(item, greensPromo);

describe('group promotions and order minimums', () => {
  test('applies a shared package promotion once mixed items reach the threshold', () => {
    const priced = applyCartPricing([
      attachGreen({ id: 'cilantro', orderId: 'o1', price: 5, quantity: 1, measurementType: 'package' }),
      attachGreen({ id: 'parsley', orderId: 'o1', price: 5, quantity: 1, measurementType: 'package' }),
      attachGreen({ id: 'dill', orderId: 'o1', price: 4, quantity: 1, measurementType: 'package' }),
    ]);

    expect(priced.every((item) => item.groupPromotionApplied)).toBe(true);
    priced.forEach((item) => {
      expect(item.effectivePrice).toBeCloseTo(3.33, 2);
    });
    expect(priced.reduce((sum, item) => sum + getEstimatedLineTotal(item), 0)).toBeCloseTo(9.99, 2);

    const snapshot = buildPricingSnapshot(priced[0]);
    expect(snapshot.groupPromotionApplied).toBe(true);
    expect(snapshot.groupPromotionId).toBe(greensPromo.id);
    expect(snapshot.effectivePrice).toBeCloseTo(3.33, 2);
    expect(snapshot.basePrice).toBe(5);
  });

  test('reprices in both directions when the mixed cart crosses the threshold', () => {
    const below = applyCartPricing([
      attachGreen({ id: 'cilantro', orderId: 'o1', price: 5, quantity: 1, measurementType: 'package' }),
      attachGreen({ id: 'parsley', orderId: 'o1', price: 5, quantity: 1, measurementType: 'package' }),
    ]);
    expect(below.every((item) => item.groupPromotionApplied === false)).toBe(true);
    expect(below[0].effectivePrice).toBe(5);

    const atThreshold = applyCartPricing([
      ...below,
      attachGreen({ id: 'dill', orderId: 'o1', price: 4, quantity: 1, measurementType: 'package' }),
    ]);
    expect(atThreshold.every((item) => item.groupPromotionApplied)).toBe(true);

    const afterRemoval = applyCartPricing(atThreshold.filter((item) => item.id !== 'dill'));
    expect(afterRemoval.every((item) => item.groupPromotionApplied === false)).toBe(true);
    expect(afterRemoval[0].effectivePrice).toBe(5);
  });

  test('does not pool quantities across different sales orders', () => {
    const priced = applyCartPricing([
      attachGreen({ id: 'cilantro', orderId: 'o1', price: 5, quantity: 2, measurementType: 'package' }),
      attachGreen({ id: 'parsley', orderId: 'o2', price: 5, quantity: 2, measurementType: 'package' }),
    ]);
    expect(priced.every((item) => item.groupPromotionApplied === false)).toBe(true);
  });

  test('applies a weighed-unit promotion per kg after the unit count threshold', () => {
    const unitPromo = {
      id: 'melons-4',
      active: true,
      label: '4 יחידות במבצע',
      productIds: ['melon-a', 'melon-b'],
      threshold: 4,
      pricingBasis: 'unit',
      discountedPrice: 6,
    };
    const priced = applyCartPricing([
      attachGroupPromotionFields({
        id: 'melon-a',
        orderId: 'o1',
        price: 10,
        quantity: 2,
        measurementType: 'unit',
        averageWeightKg: 2,
      }, unitPromo),
      attachGroupPromotionFields({
        id: 'melon-b',
        orderId: 'o1',
        price: 9,
        quantity: 2,
        measurementType: 'unit',
        averageWeightKg: 1.5,
      }, unitPromo),
    ]);

    expect(priced.every((item) => item.groupPromotionApplied)).toBe(true);
    expect(getEstimatedLineTotal(priced[0])).toBe(24);
    expect(getEstimatedLineTotal(priced[1])).toBe(18);
  });

  test('falls back to a per-product quantity discount below the group threshold', () => {
    const priced = applyCartPricing([
      attachGreen({
        id: 'cilantro',
        orderId: 'o1',
        price: 5,
        quantity: 2,
        measurementType: 'package',
        quantityDiscountThreshold: 2,
        quantityDiscountPrice: 4,
      }),
    ]);
    expect(priced[0].groupPromotionApplied).toBe(false);
    expect(priced[0].quantityDiscountApplied).toBe(true);
    expect(priced[0].effectivePrice).toBe(4);
  });

  test('gives an active group promotion priority over a per-product quantity discount', () => {
    const priced = applyCartPricing([
      attachGreen({
        id: 'cilantro',
        orderId: 'o1',
        price: 5,
        quantity: 2,
        measurementType: 'package',
        quantityDiscountThreshold: 2,
        quantityDiscountPrice: 4,
      }),
      attachGreen({ id: 'parsley', orderId: 'o1', price: 5, quantity: 1, measurementType: 'package' }),
    ]);
    expect(priced[0].groupPromotionApplied).toBe(true);
    expect(priced[0].quantityDiscountApplied).toBe(false);
    expect(priced[0].effectivePrice).toBeCloseTo(3.33, 2);
  });

  test('excludes kg, shipping, and basket-adjustment lines from group promotions and item minimums', () => {
    const priced = applyCartPricing([
      attachGreen({ id: 'cilantro', orderId: 'o1', price: 5, quantity: 3, measurementType: 'kg' }),
      attachGreen({ id: 'parsley', orderId: 'o1', price: 5, quantity: 3, measurementType: 'package', isShipping: true }),
      attachGreen({ id: 'dill', orderId: 'o1', price: 5, quantity: 3, measurementType: 'package', isBasketAdjustment: true }),
    ]);
    expect(priced.every((item) => item.groupPromotionApplied === false)).toBe(true);
    expect(getEligibleMinimumItemCount(priced)).toBe(0);
  });

  test('builds a familiar default package promotion label', () => {
    expect(buildDefaultGroupPromotionLabel(greensPromo)).toBe('3 ב-₪10.00');
  });

  test('rejects invalid group promotions and overlapping products', () => {
    const products = [
      { id: 'cilantro', name: 'כוסברה', price: 5, measurementType: 'package' },
      { id: 'tomato', name: 'עגבניה', price: 8, measurementType: 'kg' },
    ];
    expect(validateGroupPromotion({
      pricingBasis: 'package',
      productIds: ['cilantro'],
      threshold: 3,
      bundleTotalPrice: 10,
      products,
    })).toBe('');
    expect(validateGroupPromotion({
      pricingBasis: 'package',
      productIds: ['tomato'],
      threshold: 3,
      bundleTotalPrice: 10,
      products,
    })).toMatch(/מארז/);
    expect(validateGroupPromotion({
      pricingBasis: 'package',
      productIds: ['cilantro'],
      threshold: 3,
      bundleTotalPrice: 20,
      products,
    })).toMatch(/נמוך ממחיר/);
    expect(validateGroupPromotion({
      pricingBasis: 'package',
      productIds: ['cilantro'],
      threshold: 3,
      bundleTotalPrice: 10,
      products,
      existingPromotions: [greensPromo],
    })).toMatch(/מבצע פעיל אחר/);
  });

  test('treats missing minimums as valid and uses OR when both are configured', () => {
    const items = [
      { measurementType: 'package', quantity: 2 },
      { measurementType: 'kg', quantity: 5 },
    ];
    expect(evaluateOrderMinimum({ total: 10, items }).valid).toBe(true);
    expect(evaluateOrderMinimum({ total: 20, items, minimumOrderAmount: 50 }).valid).toBe(false);
    expect(evaluateOrderMinimum({ total: 10, items, minimumOrderItemCount: 3 }).valid).toBe(false);
    expect(evaluateOrderMinimum({
      total: 20,
      items,
      minimumOrderAmount: 50,
      minimumOrderItemCount: 2,
    }).valid).toBe(true);
    expect(evaluateOrderMinimum({
      total: 60,
      items: [{ measurementType: 'package', quantity: 1 }],
      minimumOrderAmount: 50,
      minimumOrderItemCount: 4,
    }).valid).toBe(true);
    expect(evaluateOrderMinimum({
      total: 10,
      items,
      minimumOrderAmount: 50,
      minimumOrderItemCount: 4,
    }).valid).toBe(false);
  });

  test('formats a Hebrew minimum-order failure that mentions both routes', () => {
    const message = formatOrderMinimumFailure({
      total: 12,
      items: [{ businessName: 'החקלאי', measurementType: 'package', quantity: 1 }],
      minimumOrderAmount: 40,
      minimumOrderItemCount: 3,
    });
    expect(message).toMatch(/החקלאי/);
    expect(message).toMatch(/40/);
    expect(message).toMatch(/3/);
  });

  test('does not let introduction-basket components trigger or receive a group promotion', () => {
    const priced = applyCartPricing([
      attachGreen({
        id: 'cilantro',
        orderId: 'o1',
        price: 5,
        quantity: 2,
        measurementType: 'package',
        isBasketComponent: true,
      }),
      attachGreen({ id: 'parsley', orderId: 'o1', price: 5, quantity: 1, measurementType: 'package' }),
    ]);

    expect(priced[0].groupPromotionApplied).toBe(false);
    expect(priced[0].effectivePrice).toBe(5);
    expect(priced[1].groupPromotionApplied).toBe(false);
    expect(priced[1].effectivePrice).toBe(5);
  });

  test('does not mutate source cart lines while repricing', () => {
    const cilantro = attachGreen({ id: 'cilantro', orderId: 'o1', price: 5, quantity: 3, measurementType: 'package' });
    const originalPrice = cilantro.price;
    const priced = applyCartPricing([cilantro]);
    expect(cilantro.price).toBe(originalPrice);
    expect(priced[0].groupPromotionApplied).toBe(true);
    expect(priced[0].effectivePrice).toBeCloseTo(3.33, 2);
    expect(priced[0]).not.toBe(cilantro);
  });

  test('restores mix-and-match pricing from flattened cart fields after reload', () => {
    const live = applyCartPricing([
      attachGreen({ id: 'cilantro', orderId: 'o1', price: 5, quantity: 1, measurementType: 'package' }),
      attachGreen({ id: 'parsley', orderId: 'o1', price: 5, quantity: 1, measurementType: 'package' }),
      attachGreen({ id: 'dill', orderId: 'o1', price: 4, quantity: 1, measurementType: 'package' }),
    ]);
    const reloaded = applyCartPricing(live.map((item) => applyQuantityPricing(item, item.quantity)));
    expect(reloaded.every((item) => item.groupPromotionApplied)).toBe(true);
    reloaded.forEach((item) => {
      expect(item.effectivePrice).toBeCloseTo(3.33, 2);
      expect(item.basePrice).toBeGreaterThan(item.effectivePrice);
    });
  });

  test('lets shipping help the amount minimum but not the item-count minimum', () => {
    const items = [
      { measurementType: 'package', quantity: 1, price: 10 },
      { measurementType: 'package', quantity: 1, price: 25, isShipping: true },
    ];
    expect(getEligibleMinimumItemCount(items)).toBe(1);
    expect(evaluateOrderMinimum({
      total: 35,
      items,
      minimumOrderAmount: 30,
      minimumOrderItemCount: 3,
    }).valid).toBe(true);
    expect(evaluateOrderMinimum({
      total: 10,
      items: [items[0]],
      minimumOrderAmount: 30,
      minimumOrderItemCount: 3,
    }).valid).toBe(false);
  });

  test('preserves a checkout snapshot even when the isolated line is below the group threshold', () => {
    const priced = applyCartPricing([
      attachGreen({ id: 'cilantro', orderId: 'o1', price: 5, quantity: 1, measurementType: 'package' }),
      attachGreen({ id: 'parsley', orderId: 'o1', price: 5, quantity: 2, measurementType: 'package' }),
    ]);
    const isolated = buildPricingSnapshot(priced[0]);
    expect(isolated.groupPromotionApplied).toBe(true);
    expect(isolated.effectivePrice).toBeCloseTo(3.33, 2);
    expect(buildPricingSnapshot({
      id: 'cilantro',
      price: 5,
      quantity: 1,
      measurementType: 'package',
      ...attachGreen({}),
    }).groupPromotionApplied).toBe(false);
  });
});
