/** Firestore collection for שוק הבסטות product catalog (separate from legacy Products) */
export const MARKETPLACE_PRODUCTS_COLLECTION = 'marketplaceProducts';

/** Storage path prefix (must match Firebase Storage rules: marketplace-products/{userId}/...) */
export const MARKETPLACE_PRODUCTS_STORAGE_PREFIX = 'marketplace-products';

export const MARKETPLACE_PRODUCT_CATEGORIES = [
  'ירקות',
  'פירות',
  'ירוקים ופטריות',
  'מוצרי חלב',
  'מאפים',
  'אחר',
];
