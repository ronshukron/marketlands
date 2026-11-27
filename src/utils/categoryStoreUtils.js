import {
  PRODUCT_TYPE_NONE,
  findProductTypeByName,
  productTypesForCategory,
} from '../constants/productTypes';
import { normalizeSupplierLabel } from './supplierPriceMatching';

// Virtual category for kosher-mehadrin products.
// A mehadrin product keeps its original `category` (e.g. ירקות) and
// additionally belongs to this category via its `isKosherMehadrin` flag,
// so no Firestore data migration is needed.
export const KOSHER_MEHADRIN_CATEGORY = 'כשר מהדרין';

// Virtual category with every product of "הכל", grouped by product type
// (all the cucumbers together, then all the tomatoes...), in sections.
export const BY_TYPE_CATEGORY = 'לפי סוג';

export const STORE_CATEGORIES = [
  'הכל',
  BY_TYPE_CATEGORY,
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

// ---- Product types (constants/productTypes.js): the order of "לפי סוג" ----

// Legacy category names that are shown under a store category.
const STORE_CATEGORY_ALIASES = { 'ירוקים': 'ירוקים ופטריות' };
export const toStoreCategory = (category) => STORE_CATEGORY_ALIASES[category] || category || 'אחר';

const tokensOf = (value) => normalizeSupplierLabel(value).split(' ').filter(Boolean);
const keywordTokensCache = new Map();
const keywordTokens = (keyword) => {
  if (!keywordTokensCache.has(keyword)) keywordTokensCache.set(keyword, tokensOf(keyword));
  return keywordTokensCache.get(keyword);
};
// Whole words only: "מלפפון" matches "קרטון מלפפון 5 ק\"ג", not "מלפפונון".
const containsPhrase = (tokens, phrase) => {
  if (phrase.length === 0 || phrase.length > tokens.length) return false;
  for (let start = 0; start + phrase.length <= tokens.length; start += 1) {
    if (phrase.every((word, offset) => tokens[start + offset] === word)) return true;
  }
  return false;
};

const resolvedTypeCache = new WeakMap();

/**
 * A product's type: the farmer's choice (Products.productType) wins, "none"
 * means no type; otherwise the first type of the product's category with a
 * keyword that appears as a whole word in its name.
 * @param {Object} product
 * @return {Object|null} an entry of PRODUCT_TYPES
 */
export const resolveProductType = (product) => {
  if (!product || typeof product !== 'object') return null;
  const cacheKey = `${product.productType || ''}|${product.category || ''}|${product.name || ''}`;
  const cached = resolvedTypeCache.get(product);
  if (cached && cached.key === cacheKey) return cached.type;
  let type = null;
  const explicit = String(product.productType || '').trim();
  if (explicit === PRODUCT_TYPE_NONE) {
    type = null;
  } else if (explicit && findProductTypeByName(explicit)) {
    type = findProductTypeByName(explicit);
  } else {
    const tokens = tokensOf(product.name);
    type = productTypesForCategory(toStoreCategory(product.category))
      .find((candidate) => candidate.keywords.some((keyword) => containsPhrase(tokens, keywordTokens(keyword))))
      || null;
  }
  resolvedTypeCache.set(product, { key: cacheKey, type });
  return type;
};

const CATEGORY_ORDER = ['ירקות', 'פירות', 'ירוקים ופטריות', 'משתלה', 'אחר'];
const UNTYPED_RANK = 10000;
const getCategoryRank = (product) => {
  const index = CATEGORY_ORDER.indexOf(toStoreCategory(product?.category));
  return index === -1 ? CATEGORY_ORDER.length : index;
};
export const getProductTypeRank = (product) => resolveProductType(product)?.sortOrder ?? UNTYPED_RANK;

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

// Comparator for "לפי סוג": by category, then product type (in the order of
// constants/productTypes.js, untyped last in their category), then the usual
// farmer ranking inside a type.
export const sortProductsByType = (a, b) => {
  const categoryDiff = getCategoryRank(a) - getCategoryRank(b);
  if (categoryDiff !== 0) return categoryDiff;
  const typeDiff = getProductTypeRank(a) - getProductTypeRank(b);
  if (typeDiff !== 0) return typeDiff;
  return sortCategoryStoreProducts(a, b);
};

/**
 * "לפי סוג" in sections: for each store category in order, one section per
 * product type, then the category's products without a type ("עוד ב{category}",
 * or just the category name when it has no types at all).
 * @param {Array<Object>} products
 * @return {Array<{key: string, title: string, products: Array<Object>}>}
 */
export const groupProductsByType = (products) => {
  const sections = [];
  const byKey = new Map();
  [...(Array.isArray(products) ? products : [])].sort(sortProductsByType).forEach((product) => {
    const category = toStoreCategory(product?.category);
    const type = resolveProductType(product);
    const key = type ? `type:${type.name}` : `rest:${category}`;
    if (!byKey.has(key)) {
      const title = type
        ? type.plural
        : (productTypesForCategory(category).length > 0 ? `עוד ב${category}` : category);
      const section = { key, title, products: [] };
      byKey.set(key, section);
      sections.push(section);
    }
    byKey.get(key).products.push(product);
  });
  return sections;
};

export const sortProductsWithMehadrinLast = (products) => (
  [...(Array.isArray(products) ? products : [])].sort(sortCategoryStoreProducts)
);

// Whether a product belongs to a selected store category. The mehadrin
// category is additive: a mehadrin product also matches its original
// category. 'הכל' is handled by the caller (it has extra rules, e.g.
// nursery products), so it matches everything here.
export const productMatchesStoreCategory = (product, selectedCategory) => {
  if (!selectedCategory || selectedCategory === 'הכל' || selectedCategory === BY_TYPE_CATEGORY) return true;
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
  counts[BY_TYPE_CATEGORY] = list.length;
  return counts;
};
