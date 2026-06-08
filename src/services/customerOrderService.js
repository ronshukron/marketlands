import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import {
  ensureLineIdsInBreakdown,
  flattenOrderBreakdown,
  recomputeBreakdownTotals,
  safeNumber,
  roundTo,
} from '../components/adminV5/deliveryWeighingV5/v7/orderDraftUtils';
import { isDeliveryDateOrderable } from '../utils/deliveryScheduleUtils';

const DELAYED_EXCLUDED_STATUSES = new Set(['abandoned', 'cancelled', 'cancelled_by_admin']);

export async function fetchCustomerOrderById(customerOrderId) {
  const standardSnap = await getDoc(doc(db, 'customerOrders', customerOrderId));
  if (standardSnap.exists()) {
    return {
      id: customerOrderId,
      customerOrderSource: 'customerOrders',
      ...standardSnap.data(),
    };
  }
  const delayedSnap = await getDoc(doc(db, 'customerOrdersDelayed', customerOrderId));
  if (delayedSnap.exists()) {
    return {
      id: customerOrderId,
      customerOrderSource: 'customerOrdersDelayed',
      ...delayedSnap.data(),
    };
  }
  return null;
}

export function shouldIncludeCustomerOrderInList(order) {
  if (!order) return false;
  const isDelayed = order.customerOrderSource === 'customerOrdersDelayed';
  if (!isDelayed) {
    const status = String(order.paymentStatus || '').toLowerCase();
    return status === 'completed' || status === 'paid';
  }
  const delayedStatus = String(order.delayedOrderStatus || '').toLowerCase();
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  if (DELAYED_EXCLUDED_STATUSES.has(delayedStatus)) return false;
  if (paymentStatus === 'abandoned' || paymentStatus === 'cancelled') return false;
  return true;
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
      return inner + (safeNumber(item?.quantity) * safeNumber(item?.price));
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
  deliveryDate,
  deliverySchedule,
  businessOrderData,
  pickupSpot,
  now = new Date(),
}) {
  if (!deliveryDate || !deliverySchedule) return true;
  return isDeliveryDateOrderable(deliveryDate, deliverySchedule, now, businessOrderData, pickupSpot);
}

export function isCustomerOrderEditable(order, deliverySchedule, businessOrdersByKey = {}) {
  if (!order) return false;
  const paymentStatus = String(order.paymentStatus || '').toLowerCase();
  if (['completed', 'charged', 'settled'].includes(paymentStatus)) return false;
  const delayedStatus = String(order.delayedOrderStatus || '').toLowerCase();
  if (delayedStatus.includes('cancelled')) return false;

  const deliveryDate = getOrderDeliveryDateFromCustomerOrder(order);
  const pickupSpot = getOrderPickupSpot(order);

  if (!deliveryDate || !deliverySchedule) return true;

  const businessKeys = Object.keys(order.orderBreakdown || {});
  if (businessKeys.length === 0) {
    return isDeliveryDateOrderable(deliveryDate, deliverySchedule, new Date(), null, pickupSpot);
  }

  return businessKeys.some((businessKey) => {
    const businessOrderData = businessOrdersByKey[businessKey] || null;
    return isLineEditableForCustomer({
      deliveryDate,
      deliverySchedule,
      businessOrderData,
      pickupSpot,
    });
  });
}

export function flattenCustomerOrderLines(order = {}) {
  const { breakdown } = ensureLineIdsInBreakdown(order.id, order.orderBreakdown || {});
  return flattenOrderBreakdown(breakdown).map((item) => ({
    ...item,
    lineTotal: roundTo(safeNumber(item.quantity) * safeNumber(item.price), 2),
  }));
}

export async function toggleCustomerLineExclusion({
  orderId,
  customerOrderSource,
  lineId,
  exclude,
  userId,
}) {
  const collectionName = customerOrderSource || 'customerOrdersDelayed';
  const orderRef = doc(db, collectionName, orderId);
  const snap = await getDoc(orderRef);
  if (!snap.exists()) throw new Error('ההזמנה לא נמצאה');

  const data = snap.data();
  if (data.userId && userId && data.userId !== userId) {
    throw new Error('אין הרשאה לערוך הזמנה זו');
  }

  const paymentStatus = String(data.paymentStatus || '').toLowerCase();
  if (['completed', 'charged', 'settled'].includes(paymentStatus)) {
    throw new Error('לא ניתן לערוך הזמנה שכבר חויבה');
  }

  const { breakdown } = ensureLineIdsInBreakdown(orderId, data.orderBreakdown || {});
  const lineExists = flattenOrderBreakdown(breakdown).some((item) => item.lineId === lineId);
  if (!lineExists) throw new Error('פריט לא נמצא בהזמנה');

  const customerExcludedLineIds = { ...(data.customerExcludedLineIds || {}) };
  if (exclude) {
    customerExcludedLineIds[lineId] = true;
  } else {
    delete customerExcludedLineIds[lineId];
  }

  const orderBreakdown = recomputeBreakdownTotals(breakdown);
  const items = flattenOrderBreakdown(orderBreakdown);
  const grandTotal = computeCustomerOrderGrandTotal({ ...data, customerExcludedLineIds }, orderBreakdown);

  await updateDoc(orderRef, {
    orderBreakdown,
    items,
    customerExcludedLineIds,
    grandTotal,
    customerEditedAt: new Date().toISOString(),
    customerEditedBy: userId || null,
  });

  return {
    orderBreakdown,
    items,
    customerExcludedLineIds,
    grandTotal,
  };
}
