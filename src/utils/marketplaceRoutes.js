/** True when the user is browsing the public community marketplace (buyer flow). */
export const isCommunityMarketplacePath = (pathname = '') =>
  pathname.startsWith('/community-marketplace');

/** Seller dashboard / products / store management */
export const isSellerMarketplacePath = (pathname = '') =>
  pathname.startsWith('/marketplace');

/** Any marketplace module route — use dedicated MarketplaceMenu */
export const isMarketplacePath = (pathname = '') =>
  isCommunityMarketplacePath(pathname) || isSellerMarketplacePath(pathname);

export const MARKETPLACE_LOGIN_PATH = '/community-marketplace/login';
export const MARKETPLACE_REGISTER_PATH = '/community-marketplace/register';

/** Safe in-app redirect after marketplace auth (must stay under marketplace or my-orders). */
export const resolveMarketplaceAuthRedirect = (target, fallback = '/community-marketplace/my-orders') => {
  const path = String(target || '').trim();
  if (!path.startsWith('/')) return fallback;
  if (path.startsWith('/community-marketplace')) return path;
  return fallback;
};

export const marketplaceLoginLinkState = (redirectPath) => ({
  from: resolveMarketplaceAuthRedirect(redirectPath),
});
