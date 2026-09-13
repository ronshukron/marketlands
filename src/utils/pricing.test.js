import {
  applyCartPricing,
  applyQuantityPricing,
  attachCommunityWeeklyPromotionFields,
  attachGroupPromotionFields,
  buildDefaultGroupPromotionLabel,
  buildDefaultQuantityDiscountLabel,
  buildPricingSnapshot,
  evaluateOrderMinimum,
  formatOrderMinimumFailure,
  getItemCommunityWeeklyPromotion,
  getEstimatedLineTotal,
  getEffectiveUnitPrice,
  getEligibleMinimumItemCount,
  getQuantityDiscountLabel,
  hasEligibleCommunityWeeklyPromotion,
  isLineEligibleForCommunityWeeklyPromotion,
  normalizeCommunityWeeklyPromotion,
  validateGroupPromotion,
  validateQuantityDiscount,
} from './pricing';

const weeklyPromotion = {
  id: 'community-a__2026-08-23__tomato',
  price: 4,
  communityCode: 'community-a',
  weekKey: '2026-08-23',
  status: 'active',
  unlocked: true,
  productId: 'tomato',
  orderId: 'o1',
  startsAt: '2026-08-20T00:00:00.000Z',
  endsAt: '2026-08-30T00:00:00.000Z',
  schemaVersion: 1,
  pricingVersion: 'weekly-v1',
};

const attachWeekly = (item, overrides = {}) => attachCommunityWeeklyPromotionFields(
  item,
  { ...weeklyPromotion, ...overrides },
);

describe('final-exclusive community weekly pricing', () => {
  test('an eligible unlocked price overrides quantity pricing', () => {
    const [priced] = applyCartPricing([attachWeekly({
      id: 'tomato',
      orderId: 'o1',
      communityCode: 'community-a',
      deliveryWeekKey: '2026-08-23',
      measurementType: 'kg',
      price: 10,
      quantity: 5,
      quantityDiscountThreshold: 2,
      quantityDiscountPrice: 7,
    }, { startsAt: null, endsAt: null })]);

    expect(priced).toMatchObject({
      basePrice: 10,
      effectivePrice: 4,
      price: 4,
      quantityDiscountApplied: false,
      groupPromotionApplied: false,
      communityWeeklyPromotionApplied: true,
    });
  });

  test('a locked promotion falls back to existing quantity pricing', () => {
    const [priced] = applyCartPricing([attachWeekly({
      id: 'tomato',
      orderId: 'o1',
      communityCode: 'community-a',
      deliveryWeekKey: '2026-08-23',
      price: 10,
      quantity: 2,
      quantityDiscountThreshold: 2,
      quantityDiscountPrice: 7,
    }, { unlocked: false, startsAt: null, endsAt: null })]);

    expect(priced.effectivePrice).toBe(7);
    expect(priced.quantityDiscountApplied).toBe(true);
    expect(priced.communityWeeklyPromotionApplied).toBe(false);
  });

  test('weekly-exclusive lines neither receive nor trigger a group promotion', () => {
    const group = {
      id: 'produce-pair',
      active: true,
      productIds: ['tomato', 'cucumber'],
      threshold: 2,
      pricingBasis: 'package',
      discountedPrice: 3,
    };
    const tomato = attachWeekly(attachGroupPromotionFields({
      id: 'tomato',
      orderId: 'o1',
      communityCode: 'community-a',
      deliveryWeekKey: '2026-08-23',
      measurementType: 'package',
      price: 10,
      quantity: 1,
    }, group), { startsAt: null, endsAt: null });
    const cucumber = attachGroupPromotionFields({
      id: 'cucumber',
      orderId: 'o1',
      measurementType: 'package',
      price: 8,
      quantity: 1,
    }, group);
    const priced = applyCartPricing([tomato, cucumber]);

    expect(priced[0]).toMatchObject({
      effectivePrice: 4,
      communityWeeklyPromotionApplied: true,
      groupPromotionApplied: false,
    });
    expect(priced[1]).toMatchObject({
      effectivePrice: 8,
      groupPromotionApplied: false,
    });
  });

  test('rejects expired and community, week, product, or order mismatches', () => {
    const line = attachWeekly({
      id: 'tomato',
      orderId: 'o1',
      communityCode: 'community-a',
      deliveryWeekKey: '2026-08-23',
      price: 10,
    });
    const promo = getItemCommunityWeeklyPromotion(line);

    expect(isLineEligibleForCommunityWeeklyPromotion(
      line,
      promo,
      { now: '2026-08-25T00:00:00.000Z' },
    )).toBe(true);
    expect(isLineEligibleForCommunityWeeklyPromotion(
      line,
      promo,
      { now: '2026-09-01T00:00:00.000Z' },
    )).toBe(false);
    expect(isLineEligibleForCommunityWeeklyPromotion(
      { ...line, communityCode: 'community-b' },
      promo,
      { now: '2026-08-25T00:00:00.000Z' },
    )).toBe(false);
    expect(isLineEligibleForCommunityWeeklyPromotion(
      { ...line, deliveryWeekKey: '2026-08-30' },
      promo,
      { now: '2026-08-25T00:00:00.000Z' },
    )).toBe(false);
    expect(isLineEligibleForCommunityWeeklyPromotion(
      { ...line, id: 'cucumber' },
      promo,
      { now: '2026-08-25T00:00:00.000Z' },
    )).toBe(false);
    expect(isLineEligibleForCommunityWeeklyPromotion(
      { ...line, orderId: 'o2' },
      promo,
      { now: '2026-08-25T00:00:00.000Z' },
    )).toBe(false);
  });

  test.each([
    ['kg', 3, undefined, 12],
    ['unit', 3, 2, 24],
    ['package', 3, undefined, 12],
  ])('prices %s lines using their existing chargeable quantity', (
    measurementType,
    quantity,
    averageWeightKg,
    total,
  ) => {
    const [priced] = applyCartPricing([attachWeekly({
      id: 'tomato',
      orderId: 'o1',
      communityCode: 'community-a',
      deliveryWeekKey: '2026-08-23',
      measurementType,
      averageWeightKg,
      quantity,
      price: 10,
    }, { startsAt: null, endsAt: null })]);
    expect(getEstimatedLineTotal(priced)).toBe(total);
  });

  test.each(['isShipping', 'isBasketAdjustment', 'isBasketComponent'])(
    'does not apply to lines marked %s',
    (excludedField) => {
      const [priced] = applyCartPricing([attachWeekly({
        id: 'tomato',
        orderId: 'o1',
        communityCode: 'community-a',
        deliveryWeekKey: '2026-08-23',
        quantity: 1,
        price: 10,
        [excludedField]: true,
      }, { startsAt: null, endsAt: null })]);
      expect(priced.effectivePrice).toBe(10);
      expect(priced.communityWeeklyPromotionApplied).toBe(false);
    },
  );

  test('normalizes ergonomic promotion input and restores flattened snapshots', () => {
    expect(normalizeCommunityWeeklyPromotion(weeklyPromotion)).toMatchObject({
      id: weeklyPromotion.id,
      price: 4,
      communityCode: 'community-a',
      unlocked: true,
    });

    const [live] = applyCartPricing([attachWeekly({
      id: 'tomato',
      orderId: 'o1',
      communityCode: 'community-a',
      deliveryWeekKey: '2026-08-23',
      quantity: 1,
      price: 10,
    }, { startsAt: null, endsAt: null })]);
    const snapshot = buildPricingSnapshot(live);
    expect(snapshot).toMatchObject({
      communityWeeklyPromotionId: weeklyPromotion.id,
      communityWeeklyPromotionPrice: 4,
      communityWeeklyPromotionApplied: true,
      communityWeeklyPromotionCommunityCode: 'community-a',
      communityWeeklyPromotionWeekKey: '2026-08-23',
      communityWeeklyPromotionUnlocked: true,
      communityWeeklyPromotionSchemaVersion: 1,
      communityWeeklyPromotionPricingVersion: 'weekly-v1',
    });

    const flattened = {
      id: 'tomato',
      orderId: 'o1',
      communityCode: 'community-a',
      deliveryWeekKey: '2026-08-23',
      quantity: 1,
      price: 4,
      ...snapshot,
    };
    expect(hasEligibleCommunityWeeklyPromotion(flattened)).toBe(true);
    expect(applyCartPricing([flattened])[0]).toMatchObject({
      basePrice: 10,
      effectivePrice: 4,
      communityWeeklyPromotionApplied: true,
    });
  });
});

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
