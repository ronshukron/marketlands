export const MARKETPLACE_SELLER_ROLES = new Set(['business', 'localBusiness']);

export const isMarketplaceSellerRole = (role) => MARKETPLACE_SELLER_ROLES.has(role);
