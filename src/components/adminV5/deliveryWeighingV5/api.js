import axios from 'axios';
import { getAuth } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase/firebase';
import { getOrderCommunity, getOrderDeliveryDate } from '../../../utils/deliveryScheduleUtils';
import { filterCustomerActiveLines } from '../../../utils/customerOrderUtils';
import { ensureLineIdsInBreakdown, flattenOrderBreakdown } from './v7/orderDraftUtils';

async function getIdTokenIfAvailable() {
  try {
    const u = getAuth().currentUser;
    if (!u) return null;
    return await u.getIdToken();
  } catch (e) {
    return null;
  }
}

function weekWindowFromKey(weekKey) {
  const sunday = new Date(weekKey);
  if (Number.isNaN(sunday.getTime())) return null;
  const start = new Date(sunday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  // Include Saturday as well (Sun -> Sat) so weekend orders show up.
  end.setDate(start.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function normalizeSpecificDateRange(startDate, endDate) {
  if (!startDate && !endDate) return null;
  const rawStart = startDate || endDate;
  const rawEnd = endDate || startDate;
  const start = new Date(rawStart);
  const end = new Date(rawEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return start <= end ? { start, end } : { start: end, end: start };
}

export async function fetchDelayedOrdersFromCustomerOrders({
  weekKey,
  communities = [],
  startDate = '',
  endDate = '',
}) {
  const window = normalizeSpecificDateRange(startDate, endDate) || weekWindowFromKey(weekKey);
  if (!window) return [];

  const allowedCommunities = Array.isArray(communities) ? communities.filter(Boolean) : [];
  const hasCommunityFilter = allowedCommunities.length > 0;

  const snapshot = await getDocs(collection(db, 'customerOrdersDelayed'));

  const orders = [];
  snapshot.forEach((docSnap) => {
    const d = docSnap.data() || {};

    // Only show orders that are eligible for weighing & settlement:
    // - paymentStatus must be "held" (customer completed authorization)
    // - delayedOrderStatus must be "pending_weighing"
    const isDelayed = d.isDelayedOrder === true || d.delayedOrder === true;
    if (!isDelayed) return;
    if (d.paymentStatus !== 'held') return;
    if (d.delayedOrderStatus !== 'pending_weighing') return;
    const deliveryDate = getOrderDeliveryDate(d);
    if (!deliveryDate) return;
    if (deliveryDate < window.start || deliveryDate > window.end) return;

    const pickupSpot = getOrderCommunity(d);
    if (hasCommunityFilter && !allowedCommunities.includes(pickupSpot)) return;

    const canonicalBreakdown = ensureLineIdsInBreakdown(docSnap.id, d.orderBreakdown || {}).breakdown;
    const rawItems = filterCustomerActiveLines(d, flattenOrderBreakdown(canonicalBreakdown));
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
      createdAtIso: deliveryDate.toISOString(),
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

export async function fetchCompletedOrdersForWeek({
  weekKey,
  communities = [],
  startDate = '',
  endDate = '',
}) {
  const window = normalizeSpecificDateRange(startDate, endDate) || weekWindowFromKey(weekKey);
  if (!window) return [];

  const allowedCommunities = Array.isArray(communities) ? communities.filter(Boolean) : [];
  const hasCommunityFilter = allowedCommunities.length > 0;

  const snapshot = await getDocs(collection(db, 'customerOrdersDelayed'));

  const orders = [];
  snapshot.forEach((docSnap) => {
    const d = docSnap.data() || {};

    const isDelayed = d.isDelayedOrder === true || d.delayedOrder === true;
    if (!isDelayed) return;

    // Completed orders: payment was already settled / charged (NOT 'held' + 'pending_weighing')
    // We look for any delayed order in this week that is no longer pending_weighing.
    const isPending = d.paymentStatus === 'held' && d.delayedOrderStatus === 'pending_weighing';
    if (isPending) return; // skip — these are fetched by fetchDelayedOrdersFromCustomerOrders

    // Must have been processed at some point (has a recognizable status)
    const status = d.delayedOrderStatus || '';
    const payStatus = d.paymentStatus || '';
    const isCompleted = status === 'settled' || status === 'completed' || status === 'charged'
      || payStatus === 'charged' || payStatus === 'completed' || payStatus === 'settled';
    if (!isCompleted) return;

    const deliveryDate = getOrderDeliveryDate(d);
    if (!deliveryDate) return;
    if (deliveryDate < window.start || deliveryDate > window.end) return;

    const pickupSpot = getOrderCommunity(d);
    if (hasCommunityFilter && !allowedCommunities.includes(pickupSpot)) return;

    const canonicalBreakdown = ensureLineIdsInBreakdown(docSnap.id, d.orderBreakdown || {}).breakdown;
    const rawItems = filterCustomerActiveLines(d, flattenOrderBreakdown(canonicalBreakdown));
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
      status: 'completed',
      weekKey,
      pickupSpot,
      customerDetails: {
        name: d.customerDetails?.name || 'לקוח',
        phone: d.customerDetails?.phone || '',
        pickupSpot,
      },
      delayedMeta: {
        isDelayed,
        paymentStatus: payStatus,
        delayedOrderStatus: status,
      },
      items,
      createdAtIso: deliveryDate.toISOString(),
    });
  });

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
  startDate = '',
  endDate = '',
}) {
  // Use real orders from Firestore only. No mock fallback.
  return await fetchDelayedOrdersFromCustomerOrders({ weekKey, communities, startDate, endDate });
}

export async function handleSuspendedPaymentV5({
  orderId,
  // weightsByLineId: { [lineId]: { actualQuantity, source } }
  weightsByLineId,
  // removedLineIds: { [lineId]: true } - items that were removed (not in stock)
  removedLineIds = {},
  // finalInvoiceLines: array of items with actual weighed quantities (buffer line and removed items excluded)
  finalInvoiceLines = [],
  // finalSum: the total amount to charge (sum of finalInvoiceLines[].linePrice)
  finalSum = 0,
  // productDataForGrow: ready-to-use Grow productData format { "productData[0][catalogNumber]": "...", ... }
  // Backend can spread this directly into the Grow J4 request.
  productDataForGrow = {},
}) {
  // User request: call "handlesuspendedpayment" backend endpoint when completing the order.
  // We don't yet know the exact deployed function name/contract, so we keep this isolated here.
  // const url = functionsEndpoint('handleSuspendedPayment');
  const url = 'https://us-central1-auth-development-323c3.cloudfunctions.net/handleSuspendedPayment';
  const token = await getIdTokenIfAvailable();
  console.log('handleSuspendedPaymentV5 url', url);
  console.log('handleSuspendedPaymentV5 orderId:', orderId, 'finalSum:', finalSum, 'lines:', finalInvoiceLines?.length);
  try {
    const { data } = await axios.post(
      url,
      { orderId, weightsByLineId, removedLineIds, finalInvoiceLines, finalSum, productDataForGrow },
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    return data;
  } catch (err) {
    console.error('handleSuspendedPaymentV5 FAILED:', {
      status: err?.response?.status,
      serverMessage: err?.response?.data,
      orderId,
      finalSum,
      linesCount: finalInvoiceLines?.length,
      hasToken: !!token,
    });
    throw err;
  }
}


