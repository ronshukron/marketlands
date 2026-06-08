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
