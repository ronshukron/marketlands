import {
  KOSHER_MEHADRIN_CATEGORY,
  STORE_CATEGORIES,
  calculateCategoryCounts,
  isKosherMehadrinProduct,
  productMatchesStoreCategory,
  sortCategoryStoreProducts,
  sortProductsWithMehadrinLast,
} from './categoryStoreUtils';
import { searchProducts } from './productSearchUtils';

describe('isKosherMehadrinProduct', () => {
  it('detects the flag and tolerates missing products', () => {
    expect(isKosherMehadrinProduct({ isKosherMehadrin: true })).toBe(true);
    expect(isKosherMehadrinProduct({ isKosherMehadrin: false })).toBe(false);
    expect(isKosherMehadrinProduct({})).toBe(false);
    expect(isKosherMehadrinProduct(null)).toBe(false);
    expect(isKosherMehadrinProduct(undefined)).toBe(false);
  });
});

describe('STORE_CATEGORIES', () => {
  it('includes the kosher mehadrin category at the end', () => {
    expect(STORE_CATEGORIES).toContain(KOSHER_MEHADRIN_CATEGORY);
    expect(STORE_CATEGORIES[STORE_CATEGORIES.length - 1]).toBe(KOSHER_MEHADRIN_CATEGORY);
  });
});

describe('sortCategoryStoreProducts', () => {
  it('puts kosher mehadrin products after farmer, regular and basta products', () => {
    const farmer = { id: 'farmer', isFarmerOrder: true, sortIndex: 0 };
    const regular = { id: 'regular', sortIndex: 1 };
    const basta = { id: 'basta', businessName: 'הבסקט של בסטה', sortIndex: 2 };
    const mehadrinFarmer = { id: 'mehadrin-farmer', isFarmerOrder: true, isKosherMehadrin: true, sortIndex: 3 };
    const mehadrin = { id: 'mehadrin', isKosherMehadrin: true, sortIndex: 4 };

    const sorted = sortProductsWithMehadrinLast([mehadrin, basta, mehadrinFarmer, regular, farmer]);

    expect(sorted.map((p) => p.id)).toEqual([
      'farmer',
      'regular',
      'basta',
      'mehadrin-farmer',
      'mehadrin',
    ]);
  });

  it('preserves the previous ordering inside the mehadrin group', () => {
    const first = { id: 'first', isKosherMehadrin: true, sortIndex: 5 };
    const second = { id: 'second', isKosherMehadrin: true, sortIndex: 9 };

    expect([second, first].sort(sortCategoryStoreProducts).map((p) => p.id))
      .toEqual(['first', 'second']);
  });

  it('does not mutate the input array', () => {
    const products = [
      { id: 'mehadrin', isKosherMehadrin: true, sortIndex: 0 },
      { id: 'regular', sortIndex: 1 },
    ];
    sortProductsWithMehadrinLast(products);
    expect(products.map((p) => p.id)).toEqual(['mehadrin', 'regular']);
  });
});

describe('productMatchesStoreCategory', () => {
  const mehadrinVegetable = { category: 'ירקות', isKosherMehadrin: true };
  const regularVegetable = { category: 'ירקות' };

  it('matches a mehadrin product in both its original and the mehadrin category', () => {
    expect(productMatchesStoreCategory(mehadrinVegetable, 'ירקות')).toBe(true);
    expect(productMatchesStoreCategory(mehadrinVegetable, KOSHER_MEHADRIN_CATEGORY)).toBe(true);
  });

  it('does not match a regular product in the mehadrin category', () => {
    expect(productMatchesStoreCategory(regularVegetable, KOSHER_MEHADRIN_CATEGORY)).toBe(false);
    expect(productMatchesStoreCategory(regularVegetable, 'ירקות')).toBe(true);
  });

  it('keeps the ירוקים ופטריות alias and defaults missing categories to אחר', () => {
    expect(productMatchesStoreCategory({ category: 'ירוקים' }, 'ירוקים ופטריות')).toBe(true);
    expect(productMatchesStoreCategory({ category: 'ירוקים ופטריות' }, 'ירוקים ופטריות')).toBe(true);
    expect(productMatchesStoreCategory({}, 'אחר')).toBe(true);
    expect(productMatchesStoreCategory({}, KOSHER_MEHADRIN_CATEGORY)).toBe(false);
  });
});

describe('calculateCategoryCounts', () => {
  it('counts a mehadrin product in both its original category and the mehadrin category', () => {
    const counts = calculateCategoryCounts([
      { category: 'ירקות', isKosherMehadrin: true },
      { category: 'ירקות' },
      { category: 'פירות', isKosherMehadrin: true },
    ]);

    expect(counts['ירקות']).toBe(2);
    expect(counts['פירות']).toBe(1);
    expect(counts[KOSHER_MEHADRIN_CATEGORY]).toBe(2);
    // Not double-counted in the total.
    expect(counts['הכל']).toBe(3);
  });
});

describe('searchProducts kosher mehadrin ordering', () => {
  it('sorts mehadrin matches last even when they are more relevant', () => {
    const products = [
      { id: 'mehadrin', name: 'עגבניה', description: '', businessName: 'משק א', isKosherMehadrin: true },
      { id: 'regular', name: 'מלפפון עגבניה', description: '', businessName: 'משק ב' },
    ];

    expect(searchProducts(products, 'עגבניה').map((p) => p.id)).toEqual(['regular', 'mehadrin']);
  });

  it('keeps relevance ordering inside the mehadrin group', () => {
    const products = [
      { id: 'mehadrin-desc', name: 'מלפפון', description: 'טעם עגבניה', businessName: 'משק א', isKosherMehadrin: true },
      { id: 'mehadrin-exact', name: 'עגבניה', description: '', businessName: 'משק ב', isKosherMehadrin: true },
    ];

    expect(searchProducts(products, 'עגבניה').map((p) => p.id))
      .toEqual(['mehadrin-exact', 'mehadrin-desc']);
  });
});
