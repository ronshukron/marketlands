import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { getCustomerKey } from './customerProfileService';

// Thresholds for V7 customer indicators.
export const NEW_CUSTOMER_ORDER_THRESHOLD = 5; // fewer than this => "new"
export const LAPSED_WEEKS = 6; // no completed order in this many weeks => "lapsed"

let _statsCache = null;
let _statsCacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

// A delayed order is considered a completed/fulfilled order once it has been
// settled/charged. Regular orders count once payment completed.
function isCompletedDelayed(data) {
  const ds = data.delayedOrderStatus || '';
  const ps = data.paymentStatus || '';
  return (
    ['settled', 'completed', 'charged'].includes(ds)
    || ['charged', 'settled', 'completed'].includes(ps)
  );
}

/**
 * Aggregate completed orders across `customerOrders` and `customerOrdersDelayed`
 * into a map keyed by (phone || email):
 *   { completedCount: number, lastOrderDate: Date | null }
 *
 * This is intentionally isolated from the V7 core data flow: it only feeds
 * display badges. Cached for a few minutes to avoid repeated full scans.
 */
export async function loadCustomerHistoryStats({ force = false } = {}) {
  const now = Date.now();
  if (!force && _statsCache && now - _statsCacheTimestamp < CACHE_TTL_MS) {
    return _statsCache;
  }

  const stats = {};

  const bump = (key, date) => {
    const id = (key || '').trim();
    if (!id) return;
    if (!stats[id]) stats[id] = { completedCount: 0, lastOrderDate: null };
    stats[id].completedCount += 1;
    if (date && (!stats[id].lastOrderDate || date > stats[id].lastOrderDate)) {
      stats[id].lastOrderDate = date;
    }
  };

  try {
    const [ordersSnap, delayedSnap] = await Promise.all([
      getDocs(collection(db, 'customerOrders')),
      getDocs(collection(db, 'customerOrdersDelayed')),
    ]);

    ordersSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.paymentStatus !== 'completed') return;
      const details = data.customerDetails || {};
      const key = getCustomerKey({ phone: details.phone, email: details.email });
      bump(key, parseDate(data.createdAt));
    });

    delayedSnap.docs.forEach((d) => {
      const data = d.data();
      if (!isCompletedDelayed(data)) return;
      const details = data.customerDetails || {};
      const key = getCustomerKey({ phone: details.phone, email: details.email });
      bump(key, parseDate(data.createdAt));
    });

    _statsCache = stats;
    _statsCacheTimestamp = now;
    return stats;
  } catch (error) {
    console.error('Failed to load customer history stats:', error);
    // Return whatever we had cached (possibly empty) so callers degrade gracefully.
    return _statsCache || {};
  }
}

export function invalidateCustomerHistoryCache() {
  _statsCache = null;
  _statsCacheTimestamp = 0;
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
