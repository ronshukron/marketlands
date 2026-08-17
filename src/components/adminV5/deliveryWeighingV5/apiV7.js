import axios from 'axios';
import { getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../../firebase/firebase';
import { functionsEndpoint } from '../../../utils/functionsClient';
import {
  getOrderCommunity,
  getOrderDeliveryDate,
  getWeekKey,
  normalizeDateRange,
  parseDateSafe,
  toLocalDateKey,
} from '../../../utils/deliveryScheduleUtils';
import {
  buildCommunityDiscountFingerprint,
  buildCommunityDiscountOrderPatch,
  ensureLineIdsInBreakdown,
  flattenOrderBreakdown,
  recomputeBreakdownTotals,
  roundTo,
  safeNumber,
} from './v7/orderDraftUtils';
import { filterCustomerActiveLines } from '../../../utils/customerOrderUtils';
import { isCommunityDiscountAvailable } from '../../../services/communityDiscountService';

async function getIdTokenIfAvailable() {
  try {
    const user = getAuth().currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch (error) {
    return null;
  }
}

function weekWindowFromKey(weekKey) {
  const start = parseDateSafe(weekKey);
  if (!start) return null;
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function normalizeDelayedItems(data, canonicalBreakdown) {
  const hasPreparedCommunityDiscount = data.communityDiscountPreparation?.status === 'prepared';
  const rawItems = filterCustomerActiveLines(data, flattenOrderBreakdown(canonicalBreakdown));
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
        pricePerUnit: safeNumber(
          hasPreparedCommunityDiscount
            ? (item.communityDiscountOriginalPrice ?? item.price)
            : item.price,
          0,
        ),
        selectedOption: item.selectedOption || '',
        businessId: item.businessId || '',
        businessName: item.businessName || '',
        catalogNumber: item.catalogNumber || '',
        vatType: item.vatType ?? 3,
        measurementType: item.measurementType || 'kg',
        unitSize: safeNumber(item.unitSize, 1),
        averageWeightKg: safeNumber(item.averageWeightKg, 1),
        isBasketComponent: item.isBasketComponent === true,
        basketId: item.basketId || '',
        basketInstanceId: item.basketInstanceId || '',
        basketTitle: item.basketTitle || '',
        basketPrice: safeNumber(
          hasPreparedCommunityDiscount
            ? (item.communityDiscountOriginalBasketPrice ?? item.basketPrice)
            : item.basketPrice,
          0,
        ),
        basketComponentSubtotal: safeNumber(item.basketComponentSubtotal, 0),
        basketCommunity: item.basketCommunity || '',
      });
    });
  return { rawItems, items };
}

function normalizeDelayedOrder(docSnap, weekKey) {
  const data = docSnap.data() || {};
  const deliveryDate = getOrderDeliveryDate(data) || new Date();
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

  const { rawItems, items } = normalizeDelayedItems(data, canonicalBreakdown);
  const computedGrandTotal = roundTo(
    rawItems.reduce((sum, item) => sum + (safeNumber(item.quantity) * safeNumber(item.price)), 0)
      + safeNumber(data.customerDetails?.deliveryDetails?.deliveryFee, 0),
    2,
  );

  return {
    id: docSnap.id,
    source: 'customerOrdersDelayed',
    weekKey,
    pickupSpot: getOrderCommunity(data),
    customerDetails: {
      name: data.customerDetails?.name || 'Customer',
      phone: data.customerDetails?.phone || '',
      email: data.customerDetails?.email || '',
      pickupSpot: getOrderCommunity(data),
      deliveryDetails: data.customerDetails?.deliveryDetails || {},
      packagingPreference: data.customerDetails?.packagingPreference || {},
    },
    delayedMeta: {
      isDelayed: data.isDelayedOrder === true || data.delayedOrder === true,
      paymentStatus: data.paymentStatus || '',
      delayedOrderStatus: data.delayedOrderStatus || '',
    },
    deliveryDateKey: toLocalDateKey(deliveryDate),
    deliveryDateIso: deliveryDate.toISOString(),
    createdAtIso: deliveryDate.toISOString(),
    status: 'pending',
    suspendedPaymentRef: data.delayedPayment || data.suspendedPayment || null,
    orderBreakdown: canonicalBreakdown,
    items,
    businessIds: Array.isArray(data.businessIds) ? data.businessIds : [],
    grandTotal: safeNumber(data.grandTotal, computedGrandTotal),
    rawData: data,
  };
}

function classifyDelayedOrders(snapshot, weekKey, communities = [], startDate = '', endDate = '') {
  const window = normalizeDateRange(startDate, endDate) || weekWindowFromKey(weekKey);
  if (!window) return { pendingOrders: [], completedOrders: [], allOrders: [] };

  const allowedCommunities = Array.isArray(communities) ? communities.filter(Boolean) : [];
  const hasCommunityFilter = allowedCommunities.length > 0;
  const pendingOrders = [];
  const completedOrders = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const isDelayed = data.isDelayedOrder === true || data.delayedOrder === true;
    if (!isDelayed) return;

    const deliveryDate = getOrderDeliveryDate(data);
    if (!deliveryDate) return;
    if (deliveryDate < window.start || deliveryDate > window.end) return;

    const pickupSpot = getOrderCommunity(data);
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
  const snapshot = await getDocs(collection(db, 'customerOrdersDelayed'));
  const weeksSet = new Set();

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const weekKey = getWeekKey(getOrderDeliveryDate(data));
    if (weekKey) weeksSet.add(weekKey);
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

  const collectionRef = weekKey
    ? query(collection(db, 'customerOrdersDelayed'), where('deliveryWeekKey', '==', weekKey))
    : collection(db, 'customerOrdersDelayed');

  const unsubscribe = onSnapshot(
    collectionRef,
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
  const activeItems = filterCustomerActiveLines(currentData, items);
  const deliveryFee = safeNumber(currentData.customerDetails?.deliveryDetails?.deliveryFee, 0);
  const grandTotal = roundTo(
    activeItems.reduce((sum, item) => sum + (safeNumber(item.quantity) * safeNumber(item.price)), 0)
      + deliveryFee,
    2,
  );
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
    items: activeItems,
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

export async function prepareCommunityDiscountForSettlementV7({
  orderId,
  communityDiscount,
  removedLineIds = {},
  session,
}) {
  if (!orderId) throw new Error('Order ID is required.');
  if (safeNumber(communityDiscount?.percent, 0) <= 0) {
    throw new Error('A positive community discount is required.');
  }

  const fingerprint = buildCommunityDiscountFingerprint({
    orderId,
    communityDiscount,
    removedLineIds,
  });
  const preparedAtIso = new Date().toISOString();
  const orderRef = doc(db, 'customerOrdersDelayed', orderId);

  return runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Order not found.');
    const orderData = orderSnap.data() || {};
    const paymentStatus = String(orderData.paymentStatus || '').toLowerCase();
    const delayedStatus = String(orderData.delayedOrderStatus || '').toLowerCase();
    if (paymentStatus !== 'held' || delayedStatus !== 'pending_weighing') {
      throw new Error('Order is no longer eligible for settlement preparation.');
    }

    const existingPreparation = orderData.communityDiscountPreparation;
    if (existingPreparation?.status === 'prepared') {
      if (existingPreparation.fingerprint === fingerprint) {
        const canonicalBreakdown = ensureLineIdsInBreakdown(
          orderId,
          orderData.orderBreakdown || {},
        ).breakdown;
        return {
          ok: true,
          skipped: true,
          fingerprint,
          preparation: existingPreparation,
          preparedItems: normalizeDelayedItems(orderData, canonicalBreakdown).items,
        };
      }
      throw new Error('A different community discount is already prepared for this order.');
    }

    const configRef = doc(db, 'settings', 'communityDiscount');
    const configSnap = await transaction.get(configRef);
    const discountConfig = configSnap.exists() ? configSnap.data() : {};
    if (!isCommunityDiscountAvailable(communityDiscount?.community, discountConfig)) {
      throw new Error('Community discount is not available for this community.');
    }

    const patch = buildCommunityDiscountOrderPatch({
      orderId,
      orderData,
      communityDiscount,
      fingerprint,
      removedLineIds,
    });
    if (!patch) throw new Error('Unable to prepare community discount prices.');

    const snapshot = {
      ...communityDiscount,
      fingerprint,
      source: 'delivery-v7',
    };
    const preparation = {
      status: 'prepared',
      fingerprint,
      snapshot,
      preparedAtIso,
      preparedBySessionId: session?.sessionId || '',
      preparedByStationId: session?.stationId || '',
      preparedByUserId: session?.userId || '',
      preparedByName: session?.userName || '',
    };
    const preparedOrderData = {
      ...orderData,
      orderBreakdown: patch.orderBreakdown,
      items: patch.items,
      grandTotal: patch.grandTotal,
      communityDiscount: snapshot,
      communityDiscountPreparation: preparation,
    };
    transaction.update(orderRef, {
      orderBreakdown: patch.orderBreakdown,
      items: patch.items,
      grandTotal: patch.grandTotal,
      communityDiscount: snapshot,
      communityDiscountPreparation: preparation,
      ...buildAuditPatch(session, 'prepare_community_discount'),
    });

    return {
      ok: true,
      skipped: false,
      fingerprint,
      preparation,
      grandTotal: patch.grandTotal,
      preparedItems: normalizeDelayedItems(
        preparedOrderData,
        patch.orderBreakdown,
      ).items,
    };
  });
}

export async function handleSuspendedPaymentV7({
  orderId,
  weightsByLineId,
  removedLineIds = {},
  finalInvoiceLines = [],
  finalSum = 0,
  productDataForGrow = {},
  weighingAudit = null,
}) {
  const token = await getIdTokenIfAvailable();
  const url = functionsEndpoint('handleSuspendedPayment');
  const { data } = await axios.post(
    url,
    {
      orderId,
      weightsByLineId,
      removedLineIds,
      finalInvoiceLines,
      finalSum,
      productDataForGrow,
      ...(weighingAudit ? { weighingAudit } : {}),
    },
    {
      headers: getMutationHeaders(token),
      timeout: 30000,
    },
  );
  return data;
}
