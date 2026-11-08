import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import {
  getLinkedOrderEndForCommunity,
  getOrderGoLive,
  GO_LIVE_LINKED_ORDER_FIELD,
  GO_LIVE_MODES,
  isAlwaysOnGroceryOrder,
  parseDateSafe,
} from '../utils/deliveryScheduleUtils';

const LINKED_ORDER_CACHE_MS = 60 * 1000;
const linkedOrderCache = new Map();

async function fetchLinkedOrder(orderId) {
  const cached = linkedOrderCache.get(orderId);
  if (cached && Date.now() - cached.at < LINKED_ORDER_CACHE_MS) return cached.promise;
  const promise = getDoc(doc(db, 'Orders', orderId))
    .then((snap) => (snap.exists() ? snap.data() : null))
    .catch((error) => {
      console.error('Failed to load linked order form:', orderId, error);
      linkedOrderCache.delete(orderId);
      return null;
    });
  linkedOrderCache.set(orderId, { at: Date.now(), promise });
  return promise;
}

/**
 * Returns copies of the orders with the live linked Orders doc attached so the
 * synchronous go-live checks can read the linked form's current end times.
 */
export async function attachGoLiveLinkedOrders(orders = []) {
  const list = Array.isArray(orders) ? orders : [];
  const linkedIds = [...new Set(list
    .map((orderData) => getOrderGoLive(orderData))
    .filter((goLive) => goLive.mode === GO_LIVE_MODES.AFTER_ORDER && goLive.linkedOrderId)
    .map((goLive) => goLive.linkedOrderId))];
  if (linkedIds.length === 0) return list;

  const linkedById = new Map(await Promise.all(
    linkedIds.map(async (id) => [id, await fetchLinkedOrder(id)])
  ));
  return list.map((orderData) => {
    const { mode, linkedOrderId } = getOrderGoLive(orderData);
    if (mode !== GO_LIVE_MODES.AFTER_ORDER) return orderData;
    const linked = linkedById.get(linkedOrderId);
    return linked ? { ...orderData, [GO_LIVE_LINKED_ORDER_FIELD]: linked } : orderData;
  });
}

export async function attachGoLiveLinkedOrdersById(ordersById = {}) {
  const entries = Object.entries(ordersById || {});
  const attached = await attachGoLiveLinkedOrders(entries.map(([, data]) => data));
  return Object.fromEntries(entries.map(([id], index) => [id, attached[index]]));
}

/** One-time forms (any business) that have not ended yet, for the "open after" picker. */
export async function loadLinkableOrderForms({ excludeOrderId = '' } = {}) {
  const now = new Date();
  const ordersRef = collection(db, 'Orders');
  const snaps = await Promise.all([
    getDocs(query(ordersRef, where('endingTime', '>', now))),
    getDocs(query(ordersRef, where('Ending_Time', '>', now))),
  ]);
  const byId = new Map();
  snaps.forEach((snap) => snap.docs.forEach((docSnap) => {
    if (docSnap.id === excludeOrderId || byId.has(docSnap.id)) return;
    const data = docSnap.data();
    if (data.archived === true || isAlwaysOnGroceryOrder(data)) return;
    if (data.orderType && data.orderType !== 'one_time') return;
    byId.set(docSnap.id, {
      id: docSnap.id,
      orderName: data.orderName || 'ללא שם',
      businessName: data.businessName || '',
      endingTime: parseDateSafe(data.endingTime || data.Ending_Time),
      pickupSpots: Array.isArray(data.pickupSpots) ? data.pickupSpots : [],
      data,
    });
  }));
  return [...byId.values()].sort((a, b) => (a.endingTime?.getTime() || 0) - (b.endingTime?.getTime() || 0));
}

/**
 * Builds the persisted goLive object. For a linked form, the linked end time per
 * community is snapshotted so checks that cannot load the linked doc still work.
 * Returns { goLive } or { error }.
 */
export function buildGoLivePayload({ mode, opensAtLocal, linkedOrder, pickupSpots = [] }) {
  if (!mode || mode === GO_LIVE_MODES.IMMEDIATE) {
    return { goLive: { mode: GO_LIVE_MODES.IMMEDIATE } };
  }
  if (mode === GO_LIVE_MODES.AT_TIME) {
    const opensAt = opensAtLocal ? new Date(opensAtLocal) : null;
    if (!opensAt || Number.isNaN(opensAt.getTime())) {
      return { error: 'יש לבחור תאריך ושעה לפתיחת הטופס.' };
    }
    return { goLive: { mode, opensAt } };
  }
  if (mode === GO_LIVE_MODES.AFTER_ORDER) {
    if (!linkedOrder?.id) return { error: 'יש לבחור טופס שאחריו ייפתח הטופס הזה.' };
    const linkedEndsAtByCommunity = {};
    pickupSpots.forEach((spot) => {
      const end = getLinkedOrderEndForCommunity(linkedOrder.data, spot);
      if (end) linkedEndsAtByCommunity[spot] = end.toISOString();
    });
    const linkedEnd = parseDateSafe(linkedOrder.data?.endingTime || linkedOrder.data?.Ending_Time);
    return {
      goLive: {
        mode,
        linkedOrderId: linkedOrder.id,
        linkedOrderName: linkedOrder.orderName || '',
        linkedBusinessName: linkedOrder.businessName || '',
        linkedEndsAtByCommunity,
        linkedEndsAt: linkedEnd ? linkedEnd.toISOString() : null,
      },
    };
  }
  return { error: 'אפשרות פתיחה לא מוכרת.' };
}
