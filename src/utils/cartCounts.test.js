import { countCartLines, formatCartBadge, sumCartQuantity } from './cartCounts';

describe('cartCounts', () => {
  test('kg fractions count as lines and sum without float noise', () => {
    const items = [
      { id: 'a', quantity: 0.3 },
      { id: 'b', quantity: 0.6 },
      { id: 'c', quantity: 2 },
    ];
    expect(countCartLines(items)).toBe(3);
    expect(sumCartQuantity(items)).toBe(2.9);
  });

  test('the sum that used to show as 999 is rounded', () => {
    // 0.7 + 0.7 + 0.7 + 0.9 === 2.9999999999999996 in plain floating point.
    const items = [0.7, 0.7, 0.7, 0.9].map((quantity, index) => ({ id: String(index), quantity }));
    expect(items.reduce((s, i) => s + i.quantity, 0)).not.toBe(3);
    expect(sumCartQuantity(items)).toBe(3);
    expect(countCartLines(items)).toBe(4);
  });

  test('basket adjustment and shipping lines are skipped', () => {
    const items = [
      { id: 'a', quantity: 1 },
      { id: 'adj', quantity: 1, isBasketAdjustment: true },
      { id: 'ship', quantity: 1, isShipping: true },
      { id: 'b', quantity: 0.5 },
    ];
    expect(countCartLines(items)).toBe(2);
    expect(sumCartQuantity(items)).toBe(1.5);
  });

  test('bad input gives zero', () => {
    expect(countCartLines(null)).toBe(0);
    expect(sumCartQuantity(undefined)).toBe(0);
    expect(sumCartQuantity([{ quantity: 'x' }, null, { quantity: 2 }])).toBe(2);
  });

  test('badge text is a whole number, capped at 99+', () => {
    expect(formatCartBadge(0)).toBe('0');
    expect(formatCartBadge(7)).toBe('7');
    expect(formatCartBadge(99)).toBe('99');
    expect(formatCartBadge(100)).toBe('99+');
    expect(formatCartBadge(2.9999999999999996)).toBe('2');
  });
});
