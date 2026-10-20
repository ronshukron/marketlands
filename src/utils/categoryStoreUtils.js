// Virtual category for kosher-mehadrin products.
// A mehadrin product keeps its original `category` (e.g. ירקות) and
// additionally belongs to this category via its `isKosherMehadrin` flag,
// so no Firestore data migration is needed.
export const KOSHER_MEHADRIN_CATEGORY = 'כשר מהדרין';

export const STORE_CATEGORIES = [
  'הכל',
  'ירקות',
  'פירות',
  'ירוקים ופטריות',
  'משתלה',
  'אחר',
  KOSHER_MEHADRIN_CATEGORY,
];

export const isKosherMehadrinProduct = (product) => Boolean(product?.isKosherMehadrin);

// 0 = regular product, 1 = kosher mehadrin (always sorted last).
export const getKosherMehadrinSortRank = (product) => (
  isKosherMehadrinProduct(product) ? 1 : 0
);

export const getCategoryStoreSortRank = (product) => {
  if (product?.businessName === 'הבסקט של בסטה') return 2;
  if (product?.isFarmerOrder === true) return 0;
  return 1;
};

// Comparator for the category store: kosher-mehadrin products come after
// every regular product (including farmer orders and "הבסקט של בסטה"),
// while the previous ordering is preserved inside each group.
export const sortCategoryStoreProducts = (a, b) => {
  const mehadrinDiff = getKosherMehadrinSortRank(a) - getKosherMehadrinSortRank(b);
  if (mehadrinDiff !== 0) return mehadrinDiff;
  const rankDiff = getCategoryStoreSortRank(a) - getCategoryStoreSortRank(b);
  if (rankDiff !== 0) return rankDiff;
  return (a?.sortIndex ?? 0) - (b?.sortIndex ?? 0);
};

export const sortProductsWithMehadrinLast = (products) => (
  [...(Array.isArray(products) ? products : [])].sort(sortCategoryStoreProducts)
);

// Whether a product belongs to a selected store category. The mehadrin
// category is additive: a mehadrin product also matches its original
// category. 'הכל' is handled by the caller (it has extra rules, e.g.
// nursery products), so it matches everything here.
export const productMatchesStoreCategory = (product, selectedCategory) => {
  if (!selectedCategory || selectedCategory === 'הכל') return true;
  if (selectedCategory === KOSHER_MEHADRIN_CATEGORY) {
    return isKosherMehadrinProduct(product);
  }
  const productCategory = product?.category || 'אחר';
  // Special handling for "ירוקים ופטריות" - match both "ירוקים" and "ירוקים ופטריות"
  if (selectedCategory === 'ירוקים ופטריות') {
    return productCategory === 'ירוקים' || productCategory === 'ירוקים ופטריות';
  }
  return productCategory === selectedCategory;
};

export const calculateCategoryCounts = (products) => {
  const counts = {};
  const list = Array.isArray(products) ? products : [];
  list.forEach((product) => {
    const cat = product?.category || 'אחר';
    counts[cat] = (counts[cat] || 0) + 1;
    if (isKosherMehadrinProduct(product)) {
      counts[KOSHER_MEHADRIN_CATEGORY] = (counts[KOSHER_MEHADRIN_CATEGORY] || 0) + 1;
    }
  });
  counts['הכל'] = list.length;
  return counts;
};
