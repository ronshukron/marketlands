import { toProductDate } from './productFreshness';

export const MARKETPLACE_LAST_VISIT_KEY = 'marketplaceLastVisitedAt';
export const MARKETPLACE_VISIT_EVENT = 'marketplace-visit-updated';

export const isApprovedMarketplaceBusiness = (business = {}) =>
  business.visible !== false && (business.status === 'active' || business.status === 'approved');

export const hasNewApprovedMarketplaceBusinesses = (
  businesses = [],
  lastVisitedAt,
) => {
  const lastVisit = toProductDate(lastVisitedAt);
  return businesses.some((business) => {
    if (!isApprovedMarketplaceBusiness(business)) return false;
    const createdAt = toProductDate(business.createdAt);
    if (!createdAt) return false;
    return !lastVisit || createdAt.getTime() > lastVisit.getTime();
  });
};

export const recordMarketplaceVisit = (storage, visitedAt = new Date()) => {
  const date = toProductDate(visitedAt);
  if (!storage || !date) return '';
  const value = date.toISOString();
  try {
    storage.setItem(MARKETPLACE_LAST_VISIT_KEY, value);
    return value;
  } catch {
    return '';
  }
};
