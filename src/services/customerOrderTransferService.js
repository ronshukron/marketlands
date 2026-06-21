import { collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import {
  getDateRangeFromWeekKey,
  getOrderCommunity,
  getOrderDeliveryDate,
  getWeekKey,
  isOrderDeliveryDateFallback,
  toLocalDateKey,
} from '../utils/deliveryScheduleUtils';
import { fetchCustomerOrderById } from './customerOrderService';

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CANCELLED_STATUSES = new Set(['cancelled', 'cancelled_by_admin']);

export function canTransferCustomerOrderDelivery(orderData = {}) {
  return !isOrderDeliveryDateFallback(orderData);
}

export function buildDeliveryTransferUpdate(orderData = {}, newDeliveryDateKey, adminUid = null) {
  const weekKey = getWeekKey(newDeliveryDateKey);
  const community = getOrderCommunity(orderData);
  const now = new Date().toISOString();

  const payload = {
    deliveryDate: newDeliveryDateKey,
    deliveryWeekKey: weekKey,
    community,
    adminDeliveryTransferredAt: now,
    adminDeliveryTransferredBy: adminUid || null,
  };

  payload.fulfillment = {
    ...(orderData.fulfillment || {}),
    deliveryDate: newDeliveryDateKey,
    deliveryWeekKey: weekKey,
    community,
    adminTransferredAt: now,
  };

  if (orderData.customerDetails) {
    payload.customerDetails = {
      ...orderData.customerDetails,
      ...(orderData.customerDetails.deliveryDate !== undefined
        ? { deliveryDate: newDeliveryDateKey }
        : {}),
    };
  }

  if (orderData.orderBreakdown) {
    payload.orderBreakdown = Object.fromEntries(
      Object.entries(orderData.orderBreakdown).map(([key, businessOrder]) => [
        key,
        {
          ...businessOrder,
          deliveryDate: newDeliveryDateKey,
          deliveryWeekKey: weekKey,
          community,
        },
      ]),
    );
  }

  return payload;
}

function isActiveOrder(orderData, source) {
  const paymentStatus = String(orderData.paymentStatus || '').toLowerCase();
  const delayedStatus = String(orderData.delayedOrderStatus || '').toLowerCase();

  if (paymentStatus === 'abandoned') return false;
  if (CANCELLED_STATUSES.has(paymentStatus)) return false;
  if (source === 'customerOrdersDelayed' && delayedStatus === 'abandoned') return false;
  if (source === 'customerOrdersDelayed' && CANCELLED_STATUSES.has(delayedStatus)) return false;
  return true;
}

export async function fetchTransferableOrdersByDeliveryWeek(weekKey, options = {}) {
  const { communities = [] } = options;
  const window = getDateRangeFromWeekKey(weekKey);
  if (!window) return [];

  const communityFilter = Array.isArray(communities) ? communities.filter(Boolean) : [];
  const hasCommunityFilter = communityFilter.length > 0;

  const [regularSnap, delayedSnap] = await Promise.all([
    getDocs(collection(db, 'customerOrders')),
    getDocs(collection(db, 'customerOrdersDelayed')),
  ]);

  const results = [];
  const allDocs = [
    ...regularSnap.docs.map((docSnap) => ({ docSnap, source: 'customerOrders' })),
    ...delayedSnap.docs.map((docSnap) => ({ docSnap, source: 'customerOrdersDelayed' })),
  ];

  allDocs.forEach(({ docSnap, source }) => {
    const orderData = docSnap.data() || {};
    if (!isActiveOrder(orderData, source)) return;
    if (!canTransferCustomerOrderDelivery(orderData)) return;

    const deliveryDate = getOrderDeliveryDate(orderData);
    if (!deliveryDate || deliveryDate < window.start || deliveryDate > window.end) return;

    const community = getOrderCommunity(orderData);
    if (hasCommunityFilter && !communityFilter.includes(community)) return;

    results.push({
      id: docSnap.id,
      source,
      community,
      deliveryDate,
      deliveryDateKey: toLocalDateKey(deliveryDate),
      deliveryWeekKey: getWeekKey(deliveryDate),
      ...orderData,
    });
  });

  results.sort((a, b) => b.deliveryDate - a.deliveryDate);
  return results;
}

export async function lookupTransferableOrder(orderId) {
  const order = await fetchCustomerOrderById(orderId);
  if (!order) return null;

  const source = order.customerOrderSource || 'customerOrdersDelayed';
  if (!isActiveOrder(order, source)) {
    throw new Error('ההזמנה אינה פעילה');
  }
  if (!canTransferCustomerOrderDelivery(order)) {
    throw new Error('הזמנה זו אינה כוללת תאריך משלוח מפורש (הזמנה קלאסית)');
  }

  const deliveryDate = getOrderDeliveryDate(order);
  return {
    ...order,
    source,
    community: getOrderCommunity(order),
    deliveryDate,
    deliveryDateKey: toLocalDateKey(deliveryDate),
    deliveryWeekKey: getWeekKey(deliveryDate),
  };
}

export async function transferCustomerOrderDelivery({
  orderId,
  customerOrderSource,
  newDeliveryDateKey,
  adminUid,
}) {
  if (!DATE_KEY_REGEX.test(newDeliveryDateKey)) {
    throw new Error('תאריך משלוח לא תקין');
  }

  const collectionName = customerOrderSource || 'customerOrdersDelayed';
  const orderRef = doc(db, collectionName, orderId);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) throw new Error('ההזמנה לא נמצאה');

  const data = snap.data();
  if (!canTransferCustomerOrderDelivery(data)) {
    throw new Error('הזמנה זו אינה כוללת תאריך משלוח מפורש (הזמנה קלאסית)');
  }

  const payload = buildDeliveryTransferUpdate(data, newDeliveryDateKey, adminUid);
  await updateDoc(orderRef, payload);

  return {
    id: orderId,
    source: collectionName,
    previousDeliveryDateKey: toLocalDateKey(getOrderDeliveryDate(data)),
    newDeliveryDateKey,
    newDeliveryWeekKey: getWeekKey(newDeliveryDateKey),
  };
}

export async function fetchAvailableDeliveryWeekKeys() {
  const [regularSnap, delayedSnap] = await Promise.all([
    getDocs(collection(db, 'customerOrders')),
    getDocs(collection(db, 'customerOrdersDelayed')),
  ]);

  const weeksSet = new Set();
  [...regularSnap.docs, ...delayedSnap.docs].forEach((docSnap) => {
    const orderData = docSnap.data() || {};
    if (!canTransferCustomerOrderDelivery(orderData)) return;
    const weekKey = getWeekKey(getOrderDeliveryDate(orderData));
    if (weekKey) weeksSet.add(weekKey);
  });

  return Array.from(weeksSet).sort((a, b) => new Date(b) - new Date(a));
}
