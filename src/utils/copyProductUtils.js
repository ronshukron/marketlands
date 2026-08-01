const CATALOG_NUMBER_URL =
  'https://us-central1-auth-development-323c3.cloudfunctions.net/returnCatalogNumber';

const getBusinessLabel = (business = {}) => (
  business.businessName || business.name || business.email || business.id || ''
);

const asNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asPositiveNumber = (value, fallback = 1) => {
  const parsed = asNumber(value, null);
  return parsed != null && parsed > 0 ? parsed : fallback;
};

/**
 * Builds a Firestore payload for a new Products doc cloned from a source product.
 * Generates a fresh catalog identity and rebinds ownership to the destination business.
 * Reuses image URLs as-is (no re-upload).
 */
export const buildCopiedProductPayload = (sourceProduct = {}, targetBusiness = {}, catalogNumber) => {
  if (!targetBusiness?.id) {
    throw new Error('targetBusiness.id is required');
  }
  if (!targetBusiness?.email) {
    throw new Error('targetBusiness.email is required');
  }
  if (catalogNumber == null || catalogNumber === '') {
    throw new Error('catalogNumber is required');
  }

  const measurementType = sourceProduct.measurementType || 'kg';
  const price = asNumber(sourceProduct.price, 0) ?? 0;
  const options = Array.isArray(sourceProduct.options) && sourceProduct.options.length > 0
    ? sourceProduct.options
    : ['ללא אופציות'];
  const images = Array.isArray(sourceProduct.images)
    ? sourceProduct.images.filter((url) => typeof url === 'string' && url.trim())
    : [];

  const payload = {
    name: String(sourceProduct.name || '').trim() || 'מוצר ללא שם',
    price,
    description: sourceProduct.description || '',
    options,
    images,
    stockAmount: asNumber(sourceProduct.stockAmount, 0) ?? 0,
    Owner_ID: targetBusiness.id,
    Owner_Email: targetBusiness.email,
    createdAt: new Date(),
    catalogNumber,
    vatType: asNumber(sourceProduct.vatType, 3) ?? 3,
    measurementType,
    unitSize: measurementType === 'kg'
      ? asPositiveNumber(sourceProduct.unitSize, 1)
      : 1,
    averageWeightKg: measurementType === 'unit'
      ? asPositiveNumber(sourceProduct.averageWeightKg, 1)
      : 1,
    showInAllCategory: sourceProduct.category === 'משתלה'
      ? Boolean(sourceProduct.showInAllCategory)
      : false,
    // Admin copies into weekly businesses should be immediately usable.
    verified: true,
    rejected: false,
    isSample: Boolean(sourceProduct.isSample) || price === 0,
    isOrganic: Boolean(sourceProduct.isOrganic),
    isRecommended: Boolean(sourceProduct.isRecommended),
  };

  if (asNumber(sourceProduct.merchantPrice, null) != null) {
    payload.merchantPrice = asNumber(sourceProduct.merchantPrice);
  }
  if (sourceProduct.thaiName) {
    payload.thaiName = String(sourceProduct.thaiName);
  }
  if (sourceProduct.category) {
    payload.category = String(sourceProduct.category);
  }
  if (Array.isArray(sourceProduct.tags) && sourceProduct.tags.length > 0) {
    payload.tags = sourceProduct.tags;
  }

  const quantityDiscountThreshold = asNumber(sourceProduct.quantityDiscountThreshold, null);
  const quantityDiscountPrice = asNumber(sourceProduct.quantityDiscountPrice, null);
  if (
    quantityDiscountThreshold != null
    && quantityDiscountThreshold > 0
    && quantityDiscountPrice != null
    && quantityDiscountPrice >= 0
  ) {
    payload.quantityDiscountThreshold = quantityDiscountThreshold;
    payload.quantityDiscountPrice = quantityDiscountPrice;
    if (typeof sourceProduct.quantityDiscountLabel === 'string' && sourceProduct.quantityDiscountLabel.trim()) {
      payload.quantityDiscountLabel = sourceProduct.quantityDiscountLabel.trim();
    }
  }

  return payload;
};

export const fetchNextCatalogNumber = async (fetcher = fetch) => {
  const response = await fetcher(CATALOG_NUMBER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`catalog number request failed (${response.status})`);
  }
  const data = await response.json();
  if (!data?.success || data.catalogNumber == null || data.catalogNumber === '') {
    throw new Error('catalog number response was invalid');
  }
  return data.catalogNumber;
};

export { getBusinessLabel, CATALOG_NUMBER_URL };
