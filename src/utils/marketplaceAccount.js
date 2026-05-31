/** Logged-in shopper on שוק הבסטות (not seller / coordinator / driver). */
export const isCommunityMarketplaceShopper = ({ userLoggedIn, userRole, isDriver = false }) => {
  if (!userLoggedIn || isDriver) return false;
  if (userRole === 'marketplaceCustomer' || userRole === 'user') return true;
  if (!userRole) return true;
  return !['business', 'localBusiness', 'driver', 'coordinator'].includes(userRole);
};

export const isMarketplaceOnlyCustomer = (userRole) => userRole === 'marketplaceCustomer';
