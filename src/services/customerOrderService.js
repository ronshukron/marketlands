import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import {
  ensureLineIdsInBreakdown,
  flattenOrderBreakdown,
  recomputeBreakdownTotals,
  safeNumber,
  roundTo,
} from '../components/adminV5/deliveryWeighingV5/v7/orderDraftUtils';
import {
  filterCustomerActiveLines,
  isCustomerBusinessLineEditable,
  isCustomerOrderOwner,
  isCustomerOrderStatusEditable,
  isSuccessfulDelayedCustomerOrder,
  isSuccessfulRegularCustomerOrder,
} from '../utils/customerOrderUtils';
import { getEffectiveUnitPrice } from '../utils/pricing';

export function getLegacyCustomerOrderIds(userData = {}) {
  return Array.isArray(userData.orders)
    ? userData.orders.filter((orderId) => typeof orderId === 'string' && orderId)
    : [];
}

export async function fetchCustomerOrderById(customerOrderId) {
  const [standardSnap, delayedSnap] = await Promise.all([
    getDoc(doc(db, 'customerOrders', customerOrderId)).catch(() => null),
    getDoc(doc(db, 'customerOrdersDelayed', customerOrderId)).catch(() => null),
  ]);
  if (standardSnap?.exists()) {
    return {
      id: customerOrderId,
      customerOrderSource: 'customerOrders',
      ...standardSnap.data(),
    };
  }
  if (delayedSnap?.exists()) {
    return {
      id: customerOrderId,
      customerOrderSource: 'customerOrdersDelayed',
      ...delayedSnap.data(),
    };
  }
  return null;
}

export async function fetchOwnedCustomerOrderById(customerOrderId, userId) {
  if (!customerOrderId || !userId) return null;
  const [standardSnap, delayedSnap, userSnap] = await Promise.all([
    getDocs(query(collection(db, 'customerOrders'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'customerOrdersDelayed'), where('userId', '==', userId))),
    getDoc(doc(db, 'users', userId)),
  ]);
  const match = standardSnap.docs.find((item) => item.id === customerOrderId);
  if (match) {
    return {
      id: match.id,
      customerOrderSource: 'customerOrders',
      ...match.data(),
    };
  }
  const delayedMatch = delayedSnap.docs.find((item) => item.id === customerOrderId);
  if (delayedMatch) {
    return {
      id: delayedMatch.id,
      customerOrderSource: 'customerOrdersDelayed',
      ...delayedMatch.data(),
    };
  }

  const legacyOrderIds = userSnap.exists() ? getLegacyCustomerOrderIds(userSnap.data()) : [];
  if (!legacyOrderIds.includes(customerOrderId)) return null;
  const legacyOrder = await fetchCustomerOrderById(customerOrderId);
  if (!legacyOrder || (legacyOrder.userId && legacyOrder.userId !== userId)) return null;
  return legacyOrder;
}

export function shouldIncludeCustomerOrderInList(order) {
  if (!order) return false;
  const isDelayed = order.customerOrderSource === 'customerOrdersDelayed';
  return isDelayed
    ? isSuccessfulDelayedCustomerOrder(order)
    : isSuccessfulRegularCustomerOrder(order);
}

export function getOrderDeliveryDateFromCustomerOrder(order = {}) {
  return order.deliveryDate
    || order.fulfillment?.deliveryDate
    || order.customerDetails?.deliveryDate
    || '';
}

export function getOrderPickupSpot(order = {}) {
  return order.customerDetails?.pickupSpot
    || order.pickupSpotName
    || order.community
    || order.fulfillment?.community
    || '';
}

function sumActiveItemsTotal(orderBreakdown, excludedLineIds = {}) {
  return Object.values(orderBreakdown || {}).reduce((sum, businessOrder) => {
    const subtotal = (businessOrder?.items || []).reduce((inner, item) => {
      if (excludedLineIds[item?.lineId]) return inner;
      const savedTotal = Number(item?.estimatedLineTotal);
      return inner + (
        Number.isFinite(savedTotal)
          ? savedTotal
          : safeNumber(item?.quantity) * getEffectiveUnitPrice(item)
      );
    }, 0);
    return sum + subtotal;
  }, 0);
}

export function computeCustomerOrderGrandTotal(order = {}, orderBreakdown = null) {
  const breakdown = orderBreakdown || order.orderBreakdown || {};
  const excluded = order.customerExcludedLineIds || {};
  const deliveryFee = safeNumber(order.customerDetails?.deliveryDetails?.deliveryFee, 0);
  return roundTo(sumActiveItemsTotal(breakdown, excluded) + deliveryFee, 2);
}

export function isLineEditableForCustomer({
  customerOrder = {},
  deliveryDate,
  deliverySchedule,
  businessOrderData,
  pickupSpot,
  now = new Date(),
}) {
  return isCustomerBusinessLineEditable({
    customerOrder,
    deliveryDate,
    deliverySchedule,
    businessOrderData,
    pickupSpot,
    now,
  });
}

export function isCustomerOrderEditable(order, deliverySchedule, businessOrdersByKey = {}) {
  if (!order || !isCustomerOrderStatusEditable(order)) return false;

  const deliveryDate = getOrderDeliveryDateFromCustomerOrder(order);
  const pickupSpot = getOrderPickupSpot(order);

  const businessKeys = Object.keys(order.orderBreakdown || {});
  if (businessKeys.length === 0) return false;

  return businessKeys.some((businessKey) => {
    const businessOrderData = businessOrdersByKey[businessKey] || null;
    return isLineEditableForCustomer({
      deliveryDate,
      deliverySchedule,
      businessOrderData,
      pickupSpot,
      customerOrder: order,
    });
  });
}

export function flattenCustomerOrderLines(order = {}) {
  const { breakdown } = ensureLineIdsInBreakdown(order.id, order.orderBreakdown || {});
  return flattenOrderBreakdown(breakdown).map((item) => ({
    ...item,
    lineTotal: roundTo(
      Number.isFinite(Number(item.estimatedLineTotal))
        ? Number(item.estimatedLineTotal)
        : safeNumber(item.quantity) * getEffectiveUnitPrice(item),
      2,
    ),
  }));
}

export async function toggleCustomerLineExclusion({
  orderId,
  customerOrderSource,
  lineId,
  exclude,
  userId,
}) {
  if (!userId) throw new Error('יש להתחבר כדי לערוך הזמנה');
  const allowedCollections = new Set(['customerOrders', 'customerOrdersDelayed']);
  const collectionName = customerOrderSource || 'customerOrdersDelayed';
  if (!allowedCollections.has(collectionName)) throw new Error('מקור הזמנה לא נתמך');

  const orderRef = doc(db, collectionName, orderId);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(orderRef);
    if (!snap.exists()) throw new Error('ההזמנה לא נמצאה');

    const data = snap.data();
    const userSnap = await transaction.get(doc(db, 'users', userId));
    const hasLegacyMembership = !data.userId
      && userSnap.exists()
      && getLegacyCustomerOrderIds(userSnap.data()).includes(orderId);
    if (!isCustomerOrderOwner(data, userId) && !hasLegacyMembership) {
      throw new Error('אין הרשאה לערוך הזמנה זו');
    }
    if (!isCustomerOrderStatusEditable(data)) {
      throw new Error('לא ניתן לערוך הזמנה שכבר חויבה או בוטלה');
    }

    const { breakdown } = ensureLineIdsInBreakdown(orderId, data.orderBreakdown || {});
    const line = flattenOrderBreakdown(breakdown).find((item) => item.lineId === lineId);
    if (!line) throw new Error('פריט לא נמצא בהזמנה');

    const businessOrderRef = doc(db, 'Orders', line.businessOrderKey);
    const businessOrderSnap = await transaction.get(businessOrderRef);
    if (!businessOrderSnap.exists()) throw new Error('הזמנת העסק לא נמצאה');
    const businessOrderData = businessOrderSnap.data();

    const deliveryDate = getOrderDeliveryDateFromCustomerOrder(data);
    const pickupSpot = getOrderPickupSpot(data);
    let deliverySchedule = null;
    if (deliveryDate && pickupSpot) {
      const scheduleSnap = await transaction.get(doc(db, 'deliverySchedules', pickupSpot));
      deliverySchedule = scheduleSnap.exists() ? scheduleSnap.data() : null;
    }

    if (!isCustomerBusinessLineEditable({
      customerOrder: data,
      businessOrderData,
      deliveryDate,
      deliverySchedule,
      pickupSpot,
      now: new Date(),
    })) {
      throw new Error('זמן העריכה של פריט זה הסתיים');
    }

    const customerExcludedLineIds = { ...(data.customerExcludedLineIds || {}) };
    if (exclude) {
      customerExcludedLineIds[lineId] = true;
    } else {
      delete customerExcludedLineIds[lineId];
    }

    const orderBreakdown = recomputeBreakdownTotals(breakdown);
    const items = flattenOrderBreakdown(orderBreakdown);
    const grandTotal = computeCustomerOrderGrandTotal({ ...data, customerExcludedLineIds }, orderBreakdown);

    transaction.update(orderRef, {
      customerExcludedLineIds,
      customerEditedAt: new Date().toISOString(),
      customerEditedBy: userId,
    });

    return {
      orderBreakdown,
      items: filterCustomerActiveLines({ customerExcludedLineIds }, items),
      customerExcludedLineIds,
      grandTotal,
    };
  });
}
