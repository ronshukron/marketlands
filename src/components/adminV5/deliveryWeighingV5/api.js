import axios from 'axios';
import { getAuth } from 'firebase/auth';
import { functionsEndpoint } from '../../../utils/functionsClient';
import { buildMockDelayedOrders } from './mockDelayedOrders';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase/firebase';

async function getIdTokenIfAvailable() {
  try {
    const u = getAuth().currentUser;
    if (!u) return null;
    return await u.getIdToken();
  } catch (e) {
    return null;
  }
}

function toDateSafe(v) {
  if (!v) return null;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (v?.toDate && typeof v.toDate === 'function') {
    try {
      const d = v.toDate();
      return d && !Number.isNaN(d.getTime()) ? d : null;
    } catch (e) {
      return null;
    }
  }
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  return null;
}

function weekWindowFromKey(weekKey) {
  const sunday = new Date(weekKey);
  if (Number.isNaN(sunday.getTime())) return null;
  const start = new Date(sunday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 5);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function flattenOrderBreakdown(orderBreakdown) {
  const out = [];
  if (!orderBreakdown || typeof orderBreakdown !== 'object') return out;
  Object.values(orderBreakdown).forEach((biz) => {
    const businessName = biz?.businessName || '';
    (biz?.items || []).forEach((it) => {
      out.push({ ...it, businessName });
    });
  });
  return out;
}

export async function fetchDelayedOrdersFromCustomerOrders({
  weekKey,
  communities = [],
}) {
  const window = weekWindowFromKey(weekKey);
  if (!window) return [];

  const allowedCommunities = Array.isArray(communities) ? communities.filter(Boolean) : [];
  const hasCommunityFilter = allowedCommunities.length > 0;

  const snapshot = await getDocs(collection(db, 'customerOrdersDelayed'));

  const orders = [];
  snapshot.forEach((docSnap) => {
    const d = docSnap.data() || {};

    // "Delayed" flag will be added later; until then we keep this flexible.
    // Include if explicit delayed flag exists OR if still pending payment (most similar to delayed, for now).
    const isDelayed = d.isDelayedOrder === true || d.delayedOrder === true;
    const isPendingPayment = d.paymentStatus === 'pending_payment' || d.paymentStatus === 'suspended' || d.paymentStatus === 'delayed_pending';
    const isabandonded = d.status === 'abandoned' && d.paymentStatus === 'pending_payment';
    if (!isDelayed && !isPendingPayment || isabandonded) return;

    const createdAt = toDateSafe(d.createdAt) || toDateSafe(d.createdAtIso) || toDateSafe(d.updatedAt);
    if (!createdAt) return;
    if (createdAt < window.start || createdAt > window.end) return;

    const pickupSpot = d.customerDetails?.pickupSpot || 'לא צוין';
    if (hasCommunityFilter && !allowedCommunities.includes(pickupSpot)) return;

    const rawItems = d.items && Array.isArray(d.items) ? d.items : flattenOrderBreakdown(d.orderBreakdown);
    const items = (rawItems || [])
      .filter((it) => it && (it.quantity || it.quantity === 0))
      .filter((it) => !it.isShipping && it.productId !== 'Mdean61FIezxRcMUZjVn')
      .map((it, idx) => {
        const productId = it.productId || it.id || '';
        const selectedOption = it.selectedOption || '';
        const lineId = it.lineId || `${docSnap.id}::${productId || it.productName || it.name || idx}::${selectedOption}::${idx}`;
        return {
          lineId,
          productId,
          productName: it.productName || it.name || 'פריט',
          unit: 'kg',
          // For now we assume quantity is "requested kg" for relevant items
          requestedQuantity: Number(it.quantity) || 0,
          pricePerUnit: Number(it.price) || 0,
          selectedOption,
          businessName: it.businessName || '',
          vatType: it.vatType,
          catalogNumber: it.catalogNumber || '',
        };
      });

    if (items.length === 0) return;

    orders.push({
      id: docSnap.id,
      source: 'customerOrdersDelayed',
      status: 'pending',
      weekKey,
      pickupSpot,
      customerDetails: {
        name: d.customerDetails?.name || 'לקוח',
        phone: d.customerDetails?.phone || '',
        pickupSpot,
      },
      delayedMeta: {
        isDelayed,
        paymentStatus: d.paymentStatus || '',
      },
      suspendedPaymentRef: d.delayedPayment || d.suspendedPayment || null,
      items,
      createdAtIso: createdAt.toISOString(),
    });
  });

  // Sort by community then name for easier packing workflow
  orders.sort((a, b) => {
    const s1 = (a.pickupSpot || '').localeCompare(b.pickupSpot || '');
    if (s1 !== 0) return s1;
    return (a.customerDetails?.name || '').localeCompare(b.customerDetails?.name || '');
  });
  return orders;
}

export async function fetchDelayedOrdersForDeliveryV5({
  weekKey,
  communities = [],
}) {
  try {
    // Phase 1: Use real orders from Firestore.
    const firestoreOrders = await fetchDelayedOrdersFromCustomerOrders({ weekKey, communities });
    if (firestoreOrders.length > 0) return firestoreOrders;
  } catch (e) {
    console.warn('[DeliveryWeighingV5] Failed to load from Firestore, falling back to mock:', e?.message || e);
  }
  return buildMockDelayedOrders({ weekKey, communities });
}

export async function handleSuspendedPaymentV5({
  orderId,
  // weightsByLineId: { [lineId]: { actualQuantity, source } }
  weightsByLineId,
}) {
  // User request: call "handlesuspendedpayment" backend endpoint when completing the order.
  // We don't yet know the exact deployed function name/contract, so we keep this isolated here.
  const url = functionsEndpoint('handleSuspendedPayment');
  const token = await getIdTokenIfAvailable();
  const { data } = await axios.post(
    url,
    { orderId, weightsByLineId },
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );
  return data;
}


