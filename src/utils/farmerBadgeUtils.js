export const normalizeFarmerBadgeBusinessIds = (businessIds) => {
  if (!Array.isArray(businessIds)) return [];

  return [...new Set(
    businessIds
      .filter((businessId) => typeof businessId === 'string')
      .map((businessId) => businessId.trim())
      .filter(Boolean)
  )];
};

export const enrichProductsWithFarmerBadge = (products, businessIds) => {
  const selectedBusinessIds = new Set(normalizeFarmerBadgeBusinessIds(businessIds));

  return (Array.isArray(products) ? products : []).map((product) => ({
    ...product,
    hasFarmerBadge: selectedBusinessIds.has(
      typeof product?.businessId === 'string' ? product.businessId.trim() : ''
    ),
  }));
};
