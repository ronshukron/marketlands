const SHOW_COMMUNITY_NUMBERING_KEY = 'deliveryV7::showCommunityNumbering';

export function readShowCommunityNumbering() {
  if (typeof localStorage === 'undefined') return true;
  try {
    const value = localStorage.getItem(SHOW_COMMUNITY_NUMBERING_KEY);
    if (value === null) return true;
    return value === 'true';
  } catch {
    return true;
  }
}

export function saveShowCommunityNumbering(enabled) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(SHOW_COMMUNITY_NUMBERING_KEY, enabled ? 'true' : 'false');
    return true;
  } catch {
    return false;
  }
}

export function compareOrdersByCustomerNumber(a, b, customerNumbersMap = {}) {
  const aCid = a?.customerDetails?.phone || a?.customerDetails?.email || a?.customerId || '';
  const bCid = b?.customerDetails?.phone || b?.customerDetails?.email || b?.customerId || '';
  const aNum = Number(customerNumbersMap[aCid] ?? a?.customerNumber);
  const bNum = Number(customerNumbersMap[bCid] ?? b?.customerNumber);
  const aHasNum = Number.isFinite(aNum) && aNum > 0;
  const bHasNum = Number.isFinite(bNum) && bNum > 0;
  if (aHasNum && bHasNum && aNum !== bNum) return aNum - bNum;
  if (aHasNum !== bHasNum) return aHasNum ? -1 : 1;
  const aName = a?.customerDetails?.name || '';
  const bName = b?.customerDetails?.name || '';
  return String(aName).localeCompare(String(bName));
}

/**
 * Assign 1..N per community based on the same customer-number sort used in delivery lists.
 */
export function computeCommunityOrderNumbers({
  orders = [],
  communities = [],
  customerNumbersMap = {},
  getCommunity = (order) => order?.customerDetails?.pickupSpot || order?.pickupSpot || '',
}) {
  const result = {};
  const communityList = communities.length > 0
    ? communities
    : Array.from(new Set(orders.map(getCommunity).filter(Boolean)));

  communityList.forEach((community) => {
    const communityOrders = orders
      .filter((order) => getCommunity(order) === community)
      .sort((a, b) => compareOrdersByCustomerNumber(a, b, customerNumbersMap));

    result[community] = {};
    communityOrders.forEach((order, index) => {
      const orderId = order?.id || order?.order?.id;
      if (orderId) {
        result[community][orderId] = index + 1;
      }
    });
  });

  return result;
}

/**
 * Loading priority per community. The route visits `communities` in order and
 * the truck is loaded in reverse, so the last community on the route is loaded
 * first and gets 1, the one before it 2, and so on. Every box of a community
 * carries the same number. Communities without orders are skipped, so the
 * numbers stay 1, 2, 3… with no gaps, in one sequence across delivery groups.
 * Returns { [community]: loadingNumber }.
 */
export function computeCommunityLoadingNumbers({
  orders = [],
  communities = [],
  getCommunity = (order) => order?.customerDetails?.pickupSpot || order?.pickupSpot || '',
}) {
  const withOrders = new Set(orders.map(getCommunity).filter(Boolean));
  const route = [];
  communities.forEach((community) => {
    if (withOrders.has(community) && !route.includes(community)) route.push(community);
  });
  // Communities missing from the route list go last on the route (loaded first).
  withOrders.forEach((community) => {
    if (!route.includes(community)) route.push(community);
  });

  const result = {};
  route.forEach((community, index) => {
    result[community] = route.length - index;
  });
  return result;
}

/**
 * Same numbers as computeCommunityLoadingNumbers, keyed by order id.
 * Returns { [orderId]: loadingNumber }.
 */
export function computeLoadingOrderNumbers({
  orders = [],
  communities = [],
  getCommunity = (order) => order?.customerDetails?.pickupSpot || order?.pickupSpot || '',
}) {
  const byCommunity = computeCommunityLoadingNumbers({ orders, communities, getCommunity });
  const result = {};
  orders.forEach((order) => {
    const orderId = order?.id || order?.order?.id;
    const number = byCommunity[getCommunity(order)];
    if (orderId && number) result[orderId] = number;
  });
  return result;
}
