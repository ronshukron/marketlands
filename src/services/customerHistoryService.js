// Thresholds for V7 customer indicators.
export const NEW_CUSTOMER_ORDER_THRESHOLD = 5; // fewer than this => "new"
export const LAPSED_WEEKS = 6; // no completed order in this many weeks => "lapsed"

function parseDate(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (val.toDate) {
    try {
      return val.toDate();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Build the per-customer history map from customerProfiles documents
 * (as returned by getCustomerProfiles). The backend keeps
 * completedCount / lastOrderDate on each profile when an order completes.
 *   { [key]: { completedCount: number, lastOrderDate: Date | null } }
 */
export function customerHistoryFromProfiles(profilesByKey = {}) {
  const stats = {};
  Object.entries(profilesByKey || {}).forEach(([key, profile]) => {
    const completedCount = Number(profile?.completedCount) || 0;
    if (completedCount <= 0) return;
    stats[key] = {
      completedCount,
      lastOrderDate: parseDate(profile?.lastOrderDate),
    };
  });
  return stats;
}

/**
 * Given a stats entry, classify the customer.
 * - isNew: fewer than NEW_CUSTOMER_ORDER_THRESHOLD completed orders
 * - isLapsed: has ordered before but last completed order older than LAPSED_WEEKS
 */
export function classifyCustomer(entry) {
  const completedCount = entry?.completedCount || 0;
  const lastOrderDate = entry?.lastOrderDate || null;

  const isNew = completedCount < NEW_CUSTOMER_ORDER_THRESHOLD;

  let isLapsed = false;
  if (completedCount > 0 && lastOrderDate) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LAPSED_WEEKS * 7);
    isLapsed = lastOrderDate < cutoff;
  }

  return { isNew, isLapsed, completedCount, lastOrderDate };
}
