import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db } from '../firebase/firebase';
import { useAuth } from './authContext';
import {
  describeSubscriptionError,
  setSubscriptionOrderItem,
  syncMySubscriberStatus,
} from '../services/basketSubscriptionService';
import { getDeliveryScheduleDocumentKeys, getEffectiveCutoffAt } from '../utils/deliveryScheduleUtils';
import { isCustomerBusinessLineEditable } from '../utils/customerOrderUtils';
import {
  SUBSCRIBER_STATES,
  applyPendingQuantities,
  deriveSubscriberDelivery,
  formatDeliveryDay,
  orderToCartItems,
  recentOrderIds,
  subscriptionItemKey,
  todayDateKey,
} from '../utils/subscriberStorefront';

// Subscriber mode: once the server marks the customer (subscriberStatus/{uid}
// storefrontMode), the storefront and cart work on their upcoming
// subscription delivery instead of a regular order.

const SubscriberContext = createContext(null);
export const useSubscriber = () => useContext(SubscriberContext);

const LOCK_REFRESH_MS = 60 * 1000;
const PENDING_TIMEOUT_MS = 6000;
const IDLE_WAIT_MS = 20 * 1000;
const UNCONFIRMED_KEY_PREFIX = 'subscriberOrderChanges:';

// Changes since the customer last pressed "אישור ההזמנה", per order. Every
// change is saved to the order right away; this only drives the reminder.
const readUnconfirmed = (orderId) => {
  if (!orderId) return 0;
  try {
    return Number(window.localStorage.getItem(UNCONFIRMED_KEY_PREFIX + orderId)) || 0;
  } catch {
    return 0;
  }
};
const writeUnconfirmed = (orderId, count) => {
  if (!orderId) return;
  try {
    if (count > 0) window.localStorage.setItem(UNCONFIRMED_KEY_PREFIX + orderId, String(count));
    else window.localStorage.removeItem(UNCONFIRMED_KEY_PREFIX + orderId);
  } catch {
    // Storage unavailable: the reminder lasts until the page is closed.
  }
};

const closedMessage = (delivery) => {
  if (delivery.state === SUBSCRIBER_STATES.AWAITING) {
    return delivery.deliveryDate
      ? `הסל למשלוח של ${formatDeliveryDay(delivery.deliveryDate)} עוד לא נפתח לעריכה. נשלח לכם הודעה כשייפתח.`
      : 'הסל למשלוח הקרוב עוד לא נפתח לעריכה.';
  }
  if (delivery.state === SUBSCRIBER_STATES.SKIPPED) {
    return `דילגתם על המשלוח של ${formatDeliveryDay(delivery.skippedDate)}. אפשר לבטל את הדילוג בעמוד "הסל השבועי שלי".`;
  }
  return 'המשלוח הקרוב כבר נסגר לעריכה.';
};

export const SubscriberProvider = ({ children }) => {
  const { currentUser } = useAuth() || {};
  const uid = currentUser?.uid || '';

  const [status, setStatus] = useState(null);
  const [subscriptions, setSubscriptions] = useState(null);
  const [ordersById, setOrdersById] = useState({});
  const [ordersReady, setOrdersReady] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [formsById, setFormsById] = useState({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pending, setPending] = useState({});
  const [saving, setSaving] = useState(0);
  const [lastError, setLastError] = useState('');
  const [cartOpenSignal, setCartOpenSignal] = useState(0);
  const [unconfirmed, setUnconfirmed] = useState({ orderId: '', count: 0 });

  const storefrontMode = Boolean(uid && status?.storefrontMode === true);

  // 1. The switch, written by the server.
  useEffect(() => {
    setStatus(null);
    if (!uid) return undefined;
    return onSnapshot(
      doc(db, 'subscriberStatus', uid),
      (snap) => setStatus(snap.exists() ? snap.data() : { storefrontMode: false }),
      () => setStatus({ storefrontMode: false }),
    );
  }, [uid]);

  // 2. The customer's subscriptions (also tells the menu to show "הסל השבועי שלי").
  useEffect(() => {
    setSubscriptions(null);
    if (!uid) return undefined;
    return onSnapshot(
      query(collection(db, 'basketSubscriptions'), where('userId', '==', uid)),
      (snap) => setSubscriptions(snap.docs.map((subDoc) => ({ id: subDoc.id, ...subDoc.data() }))),
      () => setSubscriptions([]),
    );
  }, [uid]);

  // 2b. The status record is written by the server whenever a subscription
  // changes. If it is missing or disagrees with the subscriptions (one changed
  // before the record existed), ask the server to rebuild it, once per state.
  const syncRequestedRef = useRef('');
  useEffect(() => {
    if (!uid || status === null || !Array.isArray(subscriptions)) return;
    const hasActive = subscriptions.some((sub) => sub.status === 'active');
    if (hasActive === (status.active === true)) return;
    const signature = `${uid}|${hasActive}`;
    if (syncRequestedRef.current === signature) return;
    syncRequestedRef.current = signature;
    syncMySubscriberStatus().catch((error) => {
      console.warn('Could not refresh subscriber status', error?.message || error);
    });
  }, [status, subscriptions, uid]);

  // 3. Recent generated orders of the active subscriptions, live.
  const orderIdsKey = useMemo(() => (
    storefrontMode && subscriptions
      ? subscriptions
        .filter((sub) => sub.status === 'active')
        .flatMap(recentOrderIds)
        .sort()
        .join(',')
      : ''
  ), [storefrontMode, subscriptions]);

  useEffect(() => {
    setOrdersById({});
    if (!orderIdsKey) {
      setOrdersReady(true);
      return undefined;
    }
    const ids = orderIdsKey.split(',');
    const seen = new Set();
    setOrdersReady(false);
    const unsubscribers = ids.map((orderId) => onSnapshot(
      doc(db, 'customerOrdersDelayed', orderId),
      (snap) => {
        seen.add(orderId);
        setOrdersById((prev) => {
          const next = { ...prev };
          if (snap.exists()) next[orderId] = { id: orderId, ...snap.data() };
          else delete next[orderId];
          return next;
        });
        if (seen.size >= ids.length) setOrdersReady(true);
      },
      () => {
        seen.add(orderId);
        if (seen.size >= ids.length) setOrdersReady(true);
      },
    ));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [orderIdsKey]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), LOCK_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const delivery = useMemo(() => (
    storefrontMode && subscriptions
      ? deriveSubscriberDelivery({ subscriptions, ordersById, todayKey: todayDateKey(new Date(nowMs)) })
      : { state: SUBSCRIBER_STATES.NONE }
  ), [nowMs, ordersById, storefrontMode, subscriptions]);

  const community = delivery.subscription?.community || '';
  const order = delivery.order || null;

  // 4. Community delivery schedule (editing deadline, always-on farmer locks).
  useEffect(() => {
    let active = true;
    setSchedule(null);
    if (!community) return undefined;
    (async () => {
      for (const key of getDeliveryScheduleDocumentKeys(community)) {
        try {
          const snap = await getDoc(doc(db, 'deliverySchedules', key));
          if (snap.exists()) {
            if (active) setSchedule(snap.data());
            return;
          }
        } catch {
          // An unreadable schedule only hides the deadline; the server still decides.
        }
      }
    })();
    return () => { active = false; };
  }, [community]);

  // 5. Farmer forms of the order's lines, to show which farmers are closed.
  const formIdsKey = useMemo(() => Object.keys(order?.orderBreakdown || {}).sort().join(','), [order]);
  useEffect(() => {
    let active = true;
    if (!formIdsKey) return undefined;
    const missing = formIdsKey.split(',').filter((formId) => !(formId in formsById));
    if (missing.length === 0) return undefined;
    Promise.all(missing.map(async (formId) => {
      try {
        const snap = await getDoc(doc(db, 'Orders', formId));
        return [formId, snap.exists() ? snap.data() : null];
      } catch {
        return [formId, null];
      }
    })).then((entries) => {
      if (active) setFormsById((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => { active = false; };
  }, [formIdsKey, formsById]);

  const lockedFormIds = useMemo(() => {
    const locked = new Set();
    if (!order) return locked;
    const now = new Date(nowMs);
    Object.keys(order.orderBreakdown || {}).forEach((formId) => {
      const form = formsById[formId];
      if (form === undefined) return;
      const editable = isCustomerBusinessLineEditable({
        customerOrder: order,
        businessOrderData: form,
        deliveryDate: order.deliveryDate,
        deliverySchedule: schedule,
        pickupSpot: community,
        now,
      });
      if (!editable) locked.add(formId);
    });
    return locked;
  }, [community, formsById, nowMs, order, schedule]);

  const baseItems = useMemo(() => (
    delivery.state === SUBSCRIBER_STATES.OPEN || delivery.state === SUBSCRIBER_STATES.CLOSED
      ? orderToCartItems(order, { lockedFormIds })
      : []
  ), [delivery.state, lockedFormIds, order]);

  const items = useMemo(() => applyPendingQuantities(baseItems, pending), [baseItems, pending]);

  // Pending quantities give way to the order once it shows them (or after a timeout).
  useEffect(() => {
    setPending((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      keys.forEach((key) => {
        const change = prev[key];
        if (!change.confirmedAt) return;
        const base = baseItems.find((item) => item.key === key);
        const baseQuantity = base ? base.quantity : 0;
        if (baseQuantity === change.quantity || Date.now() - change.confirmedAt > PENDING_TIMEOUT_MS) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [baseItems, nowMs]);

  // Saving: one request per product at a time; quick clicks collapse into the latest quantity.
  const queueRef = useRef(new Map());
  const inFlightRef = useRef(new Set());
  const orderIdRef = useRef('');
  orderIdRef.current = order?.id || '';
  const lastErrorRef = useRef('');
  lastErrorRef.current = lastError;
  const idleWaitersRef = useRef([]);

  const orderId = order?.id || '';
  useEffect(() => {
    setUnconfirmed({ orderId, count: readUnconfirmed(orderId) });
  }, [orderId]);
  const unconfirmedCount = unconfirmed.orderId === orderId ? unconfirmed.count : 0;

  const isIdle = useCallback(() => queueRef.current.size === 0 && inFlightRef.current.size === 0, []);
  const releaseIdleWaiters = useCallback(() => {
    if (!isIdle()) return;
    const waiters = idleWaitersRef.current;
    idleWaitersRef.current = [];
    waiters.forEach((resolve) => resolve(true));
  }, [isIdle]);

  const processQueue = useCallback(async (key) => {
    if (inFlightRef.current.has(key)) return;
    const next = queueRef.current.get(key);
    if (!next) return;
    queueRef.current.delete(key);
    inFlightRef.current.add(key);
    setSaving((count) => count + 1);
    try {
      await setSubscriptionOrderItem({
        orderId: orderIdRef.current,
        productId: next.item.id,
        formId: next.formId,
        selectedOption: next.item.selectedOption || '',
        quantity: next.quantity,
      });
      setLastError('');
      setPending((prev) => (
        prev[key] && prev[key].quantity === next.quantity
          ? { ...prev, [key]: { ...prev[key], confirmedAt: Date.now() } }
          : prev
      ));
    } catch (error) {
      queueRef.current.delete(key);
      setPending((prev) => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
      const code = error?.response?.data?.error || '';
      const maxQuantity = Number(error?.response?.data?.maxQuantity);
      let message = describeSubscriptionError(error);
      if (code === 'OUT_OF_STOCK' && Number.isFinite(maxQuantity)) message = `${message}. אפשר להזמין עד ${maxQuantity}`;
      setLastError(message);
      Swal.fire({ title: 'השינוי לא נשמר', text: message, icon: 'warning', confirmButtonText: 'הבנתי' });
    } finally {
      inFlightRef.current.delete(key);
      setSaving((count) => Math.max(0, count - 1));
      if (queueRef.current.has(key)) processQueue(key);
      else releaseIdleWaiters();
    }
  }, [releaseIdleWaiters]);

  // Leaving while a change is still on its way to the server would lose it.
  useEffect(() => {
    if (saving === 0) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saving]);

  const deliveryRef = useRef(delivery);
  deliveryRef.current = delivery;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const lockedRef = useRef(lockedFormIds);
  lockedRef.current = lockedFormIds;

  const setItemQuantity = useCallback((item, quantity, formId = '') => {
    const current = deliveryRef.current;
    if (current.state !== SUBSCRIBER_STATES.OPEN || !orderIdRef.current) {
      Swal.fire({ title: 'הסל למשלוח הקרוב', text: closedMessage(current), icon: 'info', confirmButtonText: 'הבנתי' });
      return false;
    }
    const key = subscriptionItemKey(item.id, item.selectedOption);
    const existing = itemsRef.current.find((entry) => entry.key === key);
    const target = Math.max(0, Math.round(Number(quantity) * 1000) / 1000);
    const resolvedFormId = existing?.orderId || formId || item.orderId || '';
    if (existing && target > existing.quantity && lockedRef.current.has(resolvedFormId)) {
      Swal.fire({
        title: 'ההזמנה מהחקלאי נסגרה',
        text: 'אפשר להפחית או להסיר את המוצר עד השקילה, אבל לא להוסיף.',
        icon: 'info',
        confirmButtonText: 'הבנתי',
      });
      return false;
    }
    setPending((prev) => ({ ...prev, [key]: { item: { ...item, orderId: resolvedFormId }, quantity: target } }));
    queueRef.current.set(key, { item, quantity: target, formId: resolvedFormId });
    const changedOrderId = orderIdRef.current;
    setUnconfirmed((prev) => {
      const count = (prev.orderId === changedOrderId ? prev.count : readUnconfirmed(changedOrderId)) + 1;
      writeUnconfirmed(changedOrderId, count);
      return { orderId: changedOrderId, count };
    });
    processQueue(key);
    return true;
  }, [processQueue]);

  // "אישור ההזמנה": wait until every change reached the server, then clear the reminder.
  const confirmOrder = useCallback(async () => {
    if (!isIdle()) {
      const idle = await Promise.race([
        new Promise((resolve) => { idleWaitersRef.current.push(resolve); }),
        new Promise((resolve) => { setTimeout(() => resolve(false), IDLE_WAIT_MS); }),
      ]);
      if (!idle) return { ok: false, error: 'השמירה מתעכבת. בדקו את החיבור לאינטרנט ונסו שוב.' };
    }
    // Let the failed save's error state land before reading it.
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    if (lastErrorRef.current) return { ok: false, error: lastErrorRef.current };
    const confirmedOrderId = orderIdRef.current;
    writeUnconfirmed(confirmedOrderId, 0);
    setUnconfirmed({ orderId: confirmedOrderId, count: 0 });
    return { ok: true };
  }, [isIdle]);

  const addToOrder = useCallback((item, formId) => {
    const key = subscriptionItemKey(item.id, item.selectedOption);
    const existing = itemsRef.current.find((entry) => entry.key === key);
    const added = Number(item.quantity) || 0;
    return setItemQuantity(item, (existing ? existing.quantity : 0) + added, formId);
  }, [setItemQuantity]);

  const setQuantityByUid = useCallback((uidValue, quantity) => {
    const item = itemsRef.current.find((entry) => entry.uid === uidValue);
    if (!item) return false;
    return setItemQuantity(item, quantity, item.orderId);
  }, [setItemQuantity]);

  const requestCartOpen = useCallback(() => setCartOpenSignal((count) => count + 1), []);

  const cutoffAt = useMemo(() => (
    delivery.deliveryDate && schedule ? getEffectiveCutoffAt(delivery.deliveryDate, schedule) : null
  ), [delivery.deliveryDate, schedule]);

  const loading = Boolean(uid) && (
    status === null
    || (storefrontMode && (subscriptions === null || !ordersReady))
  );

  const value = useMemo(() => ({
    loading,
    storefrontMode,
    // Subscriber mode is on only while there is an active subscription to shop for.
    active: storefrontMode && delivery.state !== SUBSCRIBER_STATES.NONE,
    hasSubscriptions: Array.isArray(subscriptions) && subscriptions.length > 0,
    subscriptions: subscriptions || [],
    subscriptionsLoaded: !uid || subscriptions !== null,
    delivery,
    order,
    community,
    cutoffAt,
    opensAt: delivery.state === SUBSCRIBER_STATES.AWAITING ? delivery.subscription?.nextGenerateAt || null : null,
    items,
    lockedFormIds,
    saveStatus: saving > 0 ? 'saving' : (lastError ? 'error' : 'saved'),
    lastError,
    unconfirmedCount,
    confirmOrder,
    setItemQuantity,
    setQuantityByUid,
    addToOrder,
    cartOpenSignal,
    requestCartOpen,
  }), [
    addToOrder, cartOpenSignal, community, confirmOrder, cutoffAt, delivery, items, lastError, loading,
    lockedFormIds, order, requestCartOpen, saving, setItemQuantity, setQuantityByUid, storefrontMode,
    subscriptions, uid, unconfirmedCount,
  ]);

  return <SubscriberContext.Provider value={value}>{children}</SubscriberContext.Provider>;
};

export default SubscriberContext;
