/** null = unlimited stock (legacy products without stockAmount) */
export const getProductStockLimit = (product = {}) => {
  if (product.stockAmount === null || product.stockAmount === undefined) {
    return null;
  }
  const amount = Number(product.stockAmount);
  if (!Number.isFinite(amount)) return null;
  return Math.max(0, Math.floor(amount));
};

export const isMarketplaceProductInStock = (product = {}) => {
  const limit = getProductStockLimit(product);
  if (limit === null) return true;
  return limit > 0;
};

export const isMarketplaceProductInStoreCatalog = (product = {}) =>
  product.showInStore !== false;

export const getRemainingProductStock = (product = {}, quantityInCart = 0) => {
  const limit = getProductStockLimit(product);
  if (limit === null) return null;
  return Math.max(0, limit - Math.max(0, Number(quantityInCart) || 0));
};

export const canAddProductToStoreCart = (product = {}, quantityInCart = 0) => {
  if (!isMarketplaceProductInStoreCatalog(product)) return false;
  const remaining = getRemainingProductStock(product, quantityInCart);
  if (remaining === null) return true;
  return remaining > 0;
};

export const clampCartQuantityToStock = (product = {}, requestedQty) => {
  const limit = getProductStockLimit(product);
  const qty = Math.max(0, Math.floor(Number(requestedQty) || 0));
  if (limit === null) return qty;
  return Math.min(qty, limit);
};
