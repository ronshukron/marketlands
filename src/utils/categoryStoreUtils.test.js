import {
  BY_TYPE_CATEGORY,
  KOSHER_MEHADRIN_CATEGORY,
  STORE_CATEGORIES,
  calculateCategoryCounts,
  groupProductsByType,
  resolveProductType,
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

  it('has "לפי סוג" right after "הכל", matching every product', () => {
    expect(STORE_CATEGORIES.slice(0, 2)).toEqual(['הכל', BY_TYPE_CATEGORY]);
    expect(productMatchesStoreCategory({ category: 'פירות' }, BY_TYPE_CATEGORY)).toBe(true);
    expect(calculateCategoryCounts([{ category: 'ירקות' }, { category: 'פירות' }])[BY_TYPE_CATEGORY]).toBe(2);
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

describe('product types', () => {
  const typeOf = (name, category = 'ירקות', extra = {}) => resolveProductType({ name, category, ...extra })?.name ?? null;

  it('detects the type from a whole word anywhere in the name', () => {
    expect(typeOf('מלפפון בייבי')).toBe('מלפפון');
    expect(typeOf('קרטון מלפפון 5 ק"ג')).toBe('מלפפון');
    expect(typeOf('פלפל אדום')).toBe('פלפל');
    expect(typeOf("פלפל חריף צ'ילי אדום")).toBe('פלפל');
    expect(typeOf('עגבניות שרי')).toBe('עגבנייה');
    expect(typeOf('שרי לובלו')).toBe('עגבנייה');
    expect(typeOf('עגבניית תמר')).toBe('עגבנייה');
  });

  it('uses the product category, and the specific type wins', () => {
    expect(typeOf('תפוח אדמה אדום')).toBe('תפוח אדמה');
    expect(typeOf('אצבעות בטטה קרטון')).toBe('בטטה');
    expect(typeOf('תפוח עץ גאלה', 'פירות')).toBe('תפוח');
    expect(typeOf('סלק עלים/מנגולד', 'ירוקים')).toBe('עלים ירוקים');
    expect(typeOf('באק צוי מהדרין', 'ירוקים ופטריות')).toBe("באק צ'וי");
    expect(typeOf('מיקס פטריות אקזוטי', 'ירוקים')).toBe('פטריות');
    expect(typeOf('פטל אדום', 'פירות')).toBe('פירות יער');
  });

  it('part of a word is not a match, and unknown names have no type', () => {
    expect(typeOf('מלפפונון')).toBeNull();
    expect(typeOf('במיה')).toBeNull();
    expect(typeOf('עגבנייה', 'משתלה')).toBeNull();
    expect(typeOf('')).toBeNull();
    expect(resolveProductType(null)).toBeNull();
  });

  it("the farmer's choice wins over the name, and 'none' means no type", () => {
    expect(typeOf('מלפפון בייבי', 'ירקות', { productType: 'פלפל' })).toBe('פלפל');
    expect(typeOf('מלפפון בייבי', 'ירקות', { productType: 'none' })).toBeNull();
    expect(typeOf('מלפפון בייבי', 'ירקות', { productType: 'unknown' })).toBe('מלפפון');
  });

  it('other categories keep their old order: farmer rank and sortIndex, not type', () => {
    const products = [
      { id: 'pepper', name: 'פלפל צהוב', category: 'ירקות', sortIndex: 1 },
      { id: 'cucumber', name: 'מלפפון', category: 'ירקות', sortIndex: 2 },
      { id: 'okra', name: 'במיה', category: 'ירקות', sortIndex: 0 },
      { id: 'cucumber-farmer', name: 'מלפפון בייבי', category: 'ירקות', sortIndex: 3, isFarmerOrder: true },
    ];
    expect([...products].sort(sortCategoryStoreProducts).map((product) => product.id))
      .toEqual(['cucumber-farmer', 'okra', 'pepper', 'cucumber']);
  });

  it('"לפי סוג": sections per type in category order, untyped last in their category, farmer order kept', () => {
    const products = [
      { id: 'pepper', name: 'פלפל צהוב', category: 'ירקות', sortIndex: 1 },
      { id: 'cucumber2', name: 'מלפפון', category: 'ירקות', sortIndex: 2 },
      { id: 'okra', name: 'במיה', category: 'ירקות', sortIndex: 0 },
      { id: 'cucumber1', name: 'מלפפון בייבי', category: 'ירקות', sortIndex: 0, isFarmerOrder: true },
      { id: 'apple', name: 'תפוח עץ', category: 'פירות', sortIndex: 0 },
      { id: 'cucumber-mehadrin', name: 'מלפפון', category: 'ירקות', sortIndex: 0, isKosherMehadrin: true },
      { id: 'tomato', name: 'עגבנייה', category: 'ירקות', sortIndex: 3 },
      { id: 'honey', name: 'דבש', category: 'אחר', sortIndex: 0 },
      { id: 'mint', name: 'נענע', category: 'ירוקים', sortIndex: 0 },
    ];
    const input = [...products];
    const sections = groupProductsByType(products);
    expect(sections.map((section) => [section.title, section.products.map((product) => product.id)])).toEqual([
      ['עגבניות', ['tomato']],
      ['מלפפונים', ['cucumber1', 'cucumber2', 'cucumber-mehadrin']],
      ['פלפלים', ['pepper']],
      ['עוד בירקות', ['okra']],
      ['תפוחים', ['apple']],
      ['עלי תבלין', ['mint']],
      ['אחר', ['honey']],
    ]);
    expect(products).toEqual(input);
    expect(groupProductsByType(null)).toEqual([]);
  });
});
