import axios from 'axios';
import { getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../../firebase/firebase';
import { functionsEndpoint } from '../../../utils/functionsClient';
import {
  ensureLineIdsInBreakdown,
  flattenOrderBreakdown,
  recomputeBreakdownTotals,
  roundTo,
  safeNumber,
  sumItemsTotal,
} from './v7/orderDraftUtils';

async function getIdTokenIfAvailable() {
  try {
    const user = getAuth().currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch (error) {
    return null;
  }
}

function toDateSafe(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value?.toDate && typeof value.toDate === 'function') {
    try {
      const parsed = value.toDate();
      return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    } catch (error) {
      return null;
    }
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  return null;
}

function weekWindowFromKey(weekKey) {
  const sunday = new Date(weekKey);
  if (Number.isNaN(sunday.getTime())) return null;
  const start = new Date(sunday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
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

function normalizeDelayedOrder(docSnap, weekKey) {
  const data = docSnap.data() || {};
  const { breakdown: canonicalBreakdown, newSeedsAssigned } = ensureLineIdsInBreakdown(docSnap.id, data.orderBreakdown || {});

  if (newSeedsAssigned) {
    const breakdownToSave = {};
    for (const [bKey, bVal] of Object.entries(canonicalBreakdown)) {
      breakdownToSave[bKey] = {
        ...bVal,
        items: (bVal.items || []).map(({ lineId, businessOrderKey, ...rest }) => rest),
      };
    }
    const orderRef = doc(db, 'customerOrdersDelayed', docSnap.id);
    updateDoc(orderRef, { orderBreakdown: breakdownToSave }).catch(() => {});
  }

  const rawItems = flattenOrderBreakdown(canonicalBreakdown);
  const items = (rawItems || [])
    .filter((item) => item && (item.quantity || item.quantity === 0))
    .filter((item) => !item.isShipping && item.productId !== 'Mdean61FIezxRcMUZjVn')
    .map((item) => {
      const productId = item.productId || item.id || '';
      return ({
        lineId: item.lineId,
        productId,
        productName: item.productName || item.name || 'Item',
        requestedQuantity: safeNumber(item.quantity, 0),
        pricePerUnit: safeNumber(item.price, 0),
        selectedOption: item.selectedOption || '',
        businessId: item.businessId || '',
        businessName: item.businessName || '',
        catalogNumber: item.catalogNumber || '',
        vatType: item.vatType ?? 3,
        measurementType: item.measurementType || 'kg',
        unitSize: safeNumber(item.unitSize, 1),
        averageWeightKg: safeNumber(item.averageWeightKg, 1),
      });
    });

  return {
    id: docSnap.id,
    source: 'customerOrdersDelayed',
    weekKey,
    pickupSpot: data.customerDetails?.pickupSpot || 'Unknown',
    customerDetails: {
      name: data.customerDetails?.name || 'Customer',
      phone: data.customerDetails?.phone || '',
      email: data.customerDetails?.email || '',
      pickupSpot: data.customerDetails?.pickupSpot || 'Unknown',
      deliveryDetails: data.customerDetails?.deliveryDetails || {},
    },
    delayedMeta: {
      isDelayed: data.isDelayedOrder === true || data.delayedOrder === true,
      paymentStatus: data.paymentStatus || '',
      delayedOrderStatus: data.delayedOrderStatus || '',
    },
    createdAtIso: (
      toDateSafe(data.createdAt)
      || toDateSafe(data.createdAtIso)
      || toDateSafe(data.updatedAt)
      || new Date()
    ).toISOString(),
    status: 'pending',
    suspendedPaymentRef: data.delayedPayment || data.suspendedPayment || null,
    orderBreakdown: canonicalBreakdown,
    items,
    businessIds: Array.isArray(data.businessIds) ? data.businessIds : [],
    grandTotal: safeNumber(data.grandTotal, 0),
    rawData: data,
  };
}

function classifyDelayedOrders(snapshot, weekKey, communities = [], startDate = '', endDate = '') {
  const window = normalizeSpecificDateRange(startDate, endDate) || weekWindowFromKey(weekKey);
  if (!window) return { pendingOrders: [], completedOrders: [], allOrders: [] };

  const allowedCommunities = Array.isArray(communities) ? communities.filter(Boolean) : [];
  const hasCommunityFilter = allowedCommunities.length > 0;
  const pendingOrders = [];
  const completedOrders = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const isDelayed = data.isDelayedOrder === true || data.delayedOrder === true;
    if (!isDelayed) return;

    const createdAt = toDateSafe(data.createdAt) || toDateSafe(data.createdAtIso) || toDateSafe(data.updatedAt);
    if (!createdAt) return;
    if (createdAt < window.start || createdAt > window.end) return;

    const pickupSpot = data.customerDetails?.pickupSpot || 'Unknown';
    if (hasCommunityFilter && !allowedCommunities.includes(pickupSpot)) return;

    const normalized = normalizeDelayedOrder(docSnap, weekKey);
    if (normalized.items.length === 0) return;

    const isPending = data.paymentStatus === 'held' && data.delayedOrderStatus === 'pending_weighing';
    const isCompleted = !isPending && (
      data.delayedOrderStatus === 'settled'
      || data.delayedOrderStatus === 'completed'
      || data.delayedOrderStatus === 'charged'
      || data.paymentStatus === 'charged'
      || data.paymentStatus === 'completed'
      || data.paymentStatus === 'settled'
    );

    if (isPending) {
      pendingOrders.push({ ...normalized, status: 'pending' });
    } else if (isCompleted) {
      completedOrders.push({ ...normalized, status: 'completed' });
    }
  });

  const sorter = (a, b) => {
    const communityCompare = (a.pickupSpot || '').localeCompare(b.pickupSpot || '');
    if (communityCompare !== 0) return communityCompare;
    return (a.customerDetails?.name || '').localeCompare(b.customerDetails?.name || '');
  };

  pendingOrders.sort(sorter);
  completedOrders.sort(sorter);
  return {
    pendingOrders,
    completedOrders,
    allOrders: [...pendingOrders, ...completedOrders],
  };
}

export async function fetchAvailableDeliveryWeeksV7() {
  const snapshot = await getDocs(collection(db, 'Orders'));
  const weeksSet = new Set();

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const endingTime = data.Ending_Time || data.endingTime;
    if (!endingTime) return;
    const endDate = endingTime?.toDate ? endingTime.toDate() : new Date(endingTime);
    if (!endDate || Number.isNaN(endDate.getTime())) return;
    const sunday = new Date(endDate);
    sunday.setDate(endDate.getDate() - endDate.getDay());
    sunday.setHours(0, 0, 0, 0);
    weeksSet.add(sunday.toISOString().split('T')[0]);
  });

  return Array.from(weeksSet).sort((a, b) => new Date(b) - new Date(a));
}

export function subscribeDelayedOrdersForWeekV7({
  weekKey,
  communities = [],
  startDate = '',
  endDate = '',
  onOrders,
  onError,
}) {
  if (!weekKey && !startDate && !endDate) return () => {};

  const unsubscribe = onSnapshot(
    collection(db, 'customerOrdersDelayed'),
    (snapshot) => {
      const next = classifyDelayedOrders(snapshot, weekKey, communities, startDate, endDate);
      if (typeof onOrders === 'function') onOrders(next);
    },
    (error) => {
      if (typeof onError === 'function') onError(error);
    },
  );

  return unsubscribe;
}

export async function fetchProductDetailsV7(productIds = []) {
  const ids = Array.from(new Set((productIds || []).filter(Boolean)));
  if (ids.length === 0) return {};

  const productMap = {};
  await Promise.all(ids.map(async (productId) => {
    try {
      const productRef = doc(db, 'Products', productId);
      const productSnap = await getDoc(productRef);
      if (!productSnap.exists()) return;
      const data = productSnap.data() || {};
      productMap[productId] = {
        id: productSnap.id,
        name: data.name || '',
        thaiName: data.thaiName || '',
        price: safeNumber(data.price, 0),
        images: Array.isArray(data.images) ? data.images : [],
        businessId: data.businessId || '',
        businessName: data.businessName || '',
        catalogNumber: data.catalogNumber || '',
        vatType: data.vatType ?? 3,
        measurementType: data.measurementType || 'kg',
        unitSize: safeNumber(data.unitSize, 1),
        averageWeightKg: safeNumber(data.averageWeightKg, 1),
      };
    } catch (error) {
      // Ignore per-product failures so one bad product does not break the whole view.
    }
  }));

  return productMap;
}

export async function searchProductsV7({ term = '', limit = 20 }) {
  const snapshot = await getDocs(collection(db, 'Products'));
  const needle = String(term || '').trim().toLowerCase();

  const rows = snapshot.docs
    .map((docSnap) => {
      const data = docSnap.data() || {};
      return {
        id: docSnap.id,
        name: data.name || '',
        thaiName: data.thaiName || '',
        independentFarmer: data.independentFarmer === true,
        price: safeNumber(data.price, 0),
        images: Array.isArray(data.images) ? data.images : [],
        businessId: data.businessId || '',
        businessName: data.businessName || '',
        catalogNumber: data.catalogNumber || '',
        vatType: data.vatType ?? 3,
        measurementType: data.measurementType || 'kg',
        unitSize: safeNumber(data.unitSize, 1),
        averageWeightKg: safeNumber(data.averageWeightKg, 1),
      };
    })
    .filter((product) => product.independentFarmer !== true)
    .filter((product) => {
      if (!needle) return true;
      return [
        product.name,
        product.thaiName,
        product.catalogNumber,
        product.businessName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return rows.slice(0, limit);
}

function getMutationHeaders(token) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Content-Type': 'application/json',
  };
}

async function callMutationEndpoint(name, payload) {
  const token = await getIdTokenIfAvailable();
  const endpoint = functionsEndpoint(name);
  const { data } = await axios.post(endpoint, payload, {
    headers: getMutationHeaders(token),
    timeout: 30000,
  });
  return data;
}

function ensureEditableOrder(data = {}) {
  const delayedStatus = String(data.delayedOrderStatus || '').toLowerCase();
  const paymentStatus = String(data.paymentStatus || '').toLowerCase();

  if (delayedStatus.includes('cancelled')) {
    throw new Error('Cancelled orders are not editable.');
  }
  if (['completed', 'charged', 'settled'].includes(paymentStatus)) {
    throw new Error('Settled orders are not editable.');
  }
}

function buildAuditPatch(session = {}, action = '') {
  return {
    adminEditedAt: new Date().toISOString(),
    adminEditedBy: session?.userId || null,
    adminEditedByName: session?.userName || '',
    adminEditSource: 'delivery-v7',
    adminEditAction: action,
  };
}

function locateItem(orderBreakdown = {}, lineId) {
  for (const [businessOrderKey, businessOrder] of Object.entries(orderBreakdown || {})) {
    const items = Array.isArray(businessOrder?.items) ? businessOrder.items : [];
    const index = items.findIndex((item) => item?.lineId === lineId);
    if (index !== -1) {
      return { businessOrderKey, itemIndex: index, item: items[index] };
    }
  }
  return null;
}

async function mutateDelayedOrderFallback({
  orderId,
  session,
  action,
  mutation,
}) {
  const orderRef = doc(db, 'customerOrdersDelayed', orderId);
  const orderSnap = await getDoc(orderRef);
  if (!orderSnap.exists()) throw new Error('Order not found.');

  const currentData = orderSnap.data() || {};
  ensureEditableOrder(currentData);

  let orderBreakdown = ensureLineIdsInBreakdown(orderId, currentData.orderBreakdown || {}).breakdown;
  orderBreakdown = mutation(orderBreakdown, currentData) || orderBreakdown;
  orderBreakdown = ensureLineIdsInBreakdown(orderId, orderBreakdown).breakdown;
  orderBreakdown = recomputeBreakdownTotals(orderBreakdown);

  const items = flattenOrderBreakdown(orderBreakdown);
  const deliveryFee = safeNumber(currentData.customerDetails?.deliveryDetails?.deliveryFee, 0);
  const grandTotal = roundTo(sumItemsTotal(orderBreakdown) + deliveryFee, 2);
  const businessIds = Array.from(new Set(
    Object.values(orderBreakdown)
      .map((businessOrder) => businessOrder?.businessId)
      .filter(Boolean),
  ));

  await updateDoc(orderRef, {
    orderBreakdown,
    items,
    businessIds,
    grandTotal,
    ...buildAuditPatch(session, action),
  });

  return {
    ok: true,
    orderId,
    items,
    grandTotal,
  };
}

export async function addItemToDelayedOrderV7({
  orderId,
  product,
  quantity,
  priceOverride,
  session,
}) {
  const payload = { orderId, product, quantity, priceOverride, session };
  try {
    return await callMutationEndpoint('addItemToDelayedOrder', payload);
  } catch (error) {
    return mutateDelayedOrderFallback({
      orderId,
      session,
      action: 'add_item',
      mutation: (orderBreakdown) => {
        const next = { ...(orderBreakdown || {}) };
        const requestedQuantity = safeNumber(quantity, product?.measurementType === 'kg' ? product?.unitSize || 1 : 1);
        const price = safeNumber(priceOverride ?? product?.price, 0);
        const businessKey = Object.keys(next).find((key) => next[key]?.businessId === product?.businessId)
          || `manual::${product?.businessId || product?.id}`;
        const target = next[businessKey] || {
          businessId: product?.businessId || '',
          businessName: product?.businessName || 'Manual Item',
          items: [],
        };
        const newItem = {
          productId: product?.id || '',
          productName: product?.name || 'Item',
          quantity: requestedQuantity,
          price,
          selectedOption: '',
          businessId: product?.businessId || target.businessId || '',
          businessName: product?.businessName || target.businessName || '',
          catalogNumber: product?.catalogNumber || '',
          vatType: product?.vatType ?? 3,
          measurementType: product?.measurementType || 'kg',
          unitSize: safeNumber(product?.unitSize, 1),
          averageWeightKg: safeNumber(product?.averageWeightKg, 1),
          thaiName: product?.thaiName || '',
          images: Array.isArray(product?.images) ? product.images : [],
        };

        next[businessKey] = {
          ...target,
          businessId: newItem.businessId,
          businessName: newItem.businessName,
          items: [...(target.items || []), newItem],
        };

        return next;
      },
    });
  }
}

export async function updateDelayedOrderLineV7({
  orderId,
  lineId,
  changes,
  session,
}) {
  const payload = { orderId, lineId, changes, session };
  try {
    return await callMutationEndpoint('updateDelayedOrderLine', payload);
  } catch (error) {
    return mutateDelayedOrderFallback({
      orderId,
      session,
      action: 'update_line',
      mutation: (orderBreakdown) => {
        const next = { ...(orderBreakdown || {}) };
        const found = locateItem(next, lineId);
        if (!found) throw new Error('Line item not found.');

        const targetBusiness = next[found.businessOrderKey];
        const items = [...(targetBusiness.items || [])];
        const current = items[found.itemIndex] || {};
        items[found.itemIndex] = {
          ...current,
          ...(changes?.productName != null ? { productName: changes.productName } : {}),
          ...(changes?.selectedOption != null ? { selectedOption: changes.selectedOption } : {}),
          ...(changes?.quantity != null ? { quantity: safeNumber(changes.quantity, current.quantity) } : {}),
          ...(changes?.price != null ? { price: safeNumber(changes.price, current.price) } : {}),
        };
        next[found.businessOrderKey] = {
          ...targetBusiness,
          items,
        };
        return next;
      },
    });
  }
}

export async function removeDelayedOrderLineV7({
  orderId,
  lineId,
  session,
}) {
  const payload = { orderId, lineId, session };
  try {
    return await callMutationEndpoint('removeDelayedOrderLine', payload);
  } catch (error) {
    return mutateDelayedOrderFallback({
      orderId,
      session,
      action: 'remove_line',
      mutation: (orderBreakdown) => {
        const next = { ...(orderBreakdown || {}) };
        const found = locateItem(next, lineId);
        if (!found) throw new Error('Line item not found.');

        const targetBusiness = next[found.businessOrderKey];
        const items = (targetBusiness.items || []).filter((_, index) => index !== found.itemIndex);
        if (items.length === 0) {
          delete next[found.businessOrderKey];
        } else {
          next[found.businessOrderKey] = {
            ...targetBusiness,
            items,
          };
        }

        if (Object.keys(next).length === 0) {
          throw new Error('Cannot remove the last item from the order.');
        }

        return next;
      },
    });
  }
}

export async function handleSuspendedPaymentV7({
  orderId,
  weightsByLineId,
  removedLineIds = {},
  finalInvoiceLines = [],
  finalSum = 0,
  productDataForGrow = {},
}) {
  const token = await getIdTokenIfAvailable();
  const url = functionsEndpoint('handleSuspendedPayment');
  const { data } = await axios.post(
    url,
    { orderId, weightsByLineId, removedLineIds, finalInvoiceLines, finalSum, productDataForGrow },
    {
      headers: getMutationHeaders(token),
      timeout: 30000,
    },
  );
  return data;
}
