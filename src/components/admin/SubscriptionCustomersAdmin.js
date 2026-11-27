import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import SubscriptionBusyOverlay from '../subscriptions/SubscriptionBusyOverlay';
import {
  FREQUENCY_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  describeSubscriptionError,
  listAllSubscriptions,
  listSubscriptionOrders,
  updateBasketSubscription,
} from '../../services/basketSubscriptionService';
import { isAdminAccount } from '../../utils/accountRoles';
import { getCustomerOrderDisplayTotal, getCustomerOrderStatusInfo, STATUS_BADGE_CLASSES } from '../../utils/customerOrderDisplay';
import { parseDateSafe } from '../../utils/deliveryScheduleUtils';
import { WhatsappReminderSettings, WhatsappReminderStatus } from './WhatsappReminderAdmin';
import FunnelReport from './FunnelReport';
import { LEAVE_REASON_LABELS } from '../../constants/funnel';
import {
  ADMIN_PAUSE_CONFIRM_TEXT,
  ADMIN_RESUME_CONFIRM_TEXT,
  deliveryOptionOutcomeMessage,
  pauseOutcomeMessage,
  resumeOutcomeMessage,
} from '../subscriptions/copy';
import DeliveryOptionSwitch from '../subscriptions/DeliveryOptionSwitch';

// /admin/subscriptions: every basket subscription, with the customer's details
// and the same actions the customer has (except saving a card, which needs the
// customer's own consent). Actions go through updateBasketSubscription, which
// logs them on the subscription (adminActions).

const STATUS_ORDER = ['payment_failed', 'active', 'paused', 'pending_card', 'canceled'];
const STATUS_TONES = { active: 'green', pending_card: 'yellow', paused: 'gray', payment_failed: 'red', canceled: 'gray' };
const DELIVERY_OPTION_LABELS = { pickup: 'איסוף מנקודת החלוקה', homeDelivery: 'משלוח עד הבית', boxCollection: 'איסוף מארגז' };
const PAUSE_REASON_LABELS = { customer: 'הלקוח השהה', admin: 'אדמין השהה', basket_unavailable: 'הסל לא זמין' };
const ACTION_LABELS = {
  pause: 'השהיה',
  resume: 'חידוש',
  cancel: 'ביטול מנוי',
  skip: 'דילוג על משלוח',
  unskip: 'ביטול דילוג',
  frequency: 'שינוי תדירות',
  recurring_basket: 'עריכת הסל הקבוע',
};
const GENERATION_LABELS = {
  generated: 'נוצרה הזמנה',
  skipped: 'דילוג',
  paused: 'הושהה',
  waiting_for_forms: 'ממתין לטפסי חקלאים',
  already_generated: 'ההזמנה כבר קיימת',
  order_id_taken: 'מזהה ההזמנה תפוס',
};
const SKIP_REASON_LABELS = {
  customer_skip: 'דילוג',
  no_delivery: 'אין משלוח בתאריך',
  cutoff_passed: 'עבר מועד הסגירה',
  no_items_available: 'אין מוצרים זמינים',
  basket_unavailable: 'הסל לא זמין',
};

// The customer's answer to "מה הסיבה?" when pausing or canceling.
const describeLeaveFeedback = (feedback) => {
  if (!feedback || (!feedback.reason && !feedback.note)) return '';
  const label = LEAVE_REASON_LABELS[feedback.reason] || '';
  return [label, feedback.note ? `"${feedback.note}"` : ''].filter(Boolean).join(': ');
};

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const formatDateTime = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
};
const formatDateKey = (dateKey) => {
  const date = parseDateSafe(dateKey);
  return date ? date.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' }) : (dateKey || '');
};
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
// Only the last 4 digits are stored. Expiry comes as MMYY; written as 12/28 so
// it is not read as more card digits.
const formatCardExpiry = (exp) => {
  const digits = String(exp || '').replace(/\D/g, '');
  return digits.length === 4 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : String(exp || '');
};
const describeCard = (card) => {
  if (!card || card.status !== 'saved') return 'לא נשמר';
  const parts = [card.brand, card.last4 ? `מסתיים ב-${card.last4}` : '', card.exp ? `תוקף ${formatCardExpiry(card.exp)}` : ''];
  return parts.filter(Boolean).join(' · ') || 'שמור';
};

const StatusBadge = ({ status }) => (
  <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[STATUS_TONES[status] || 'gray']}`}>
    {SUBSCRIPTION_STATUS_LABELS[status] || status}
  </span>
);

const Field = ({ label, children }) => (
  <div className="text-sm">
    <span className="text-gray-500">{label}: </span>
    <span className="text-gray-900">{children}</span>
  </div>
);

const SubscriberDetails = ({ subscription, currentUid, onChanged }) => {
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState('');

  const loadOrders = useCallback(() => {
    listSubscriptionOrders(subscription)
      .then(setOrders)
      .catch(() => setOrders([]));
  }, [subscription]);
  useEffect(() => { loadOrders(); }, [loadOrders]);

  const run = async (action, extra = {}, confirm = null) => {
    if (confirm) {
      const result = await Swal.fire({
        title: confirm.title,
        text: confirm.text || '',
        icon: confirm.icon || 'question',
        showCancelButton: true,
        confirmButtonText: confirm.button || 'כן',
        cancelButtonText: 'לא',
      });
      if (!result.isConfirmed) return;
    }
    setBusy(action);
    try {
      const result = await updateBasketSubscription(subscription.id, action, extra);
      if (action === 'cancel' && Array.isArray(result?.canceledOrderIds)) {
        Swal.fire('המנוי בוטל', result.canceledOrderIds.length > 0
          ? `בוטלו גם ${result.canceledOrderIds.length} משלוחים פתוחים, והמלאי שלהם חזר.`
          : 'לא היה משלוח פתוח לביטול. משלוח שכבר עבר את מועד הסגירה נשאר, ואפשר לבטל אותו בדף ההזמנות השבועיות.', 'success');
      }
      const outcome = action === 'pause' ? pauseOutcomeMessage(result, { admin: true })
        : action === 'resume' ? resumeOutcomeMessage(result)
          : action === 'delivery_option' ? deliveryOptionOutcomeMessage(result) : null;
      if (outcome) Swal.fire({ ...outcome, confirmButtonText: 'הבנתי' });
      if (action === 'unskip' && result?.droppedProductNames?.length > 0) {
        Swal.fire('המשלוח חזר', `חלק מהמוצרים אזלו ולא נכנסו: ${result.droppedProductNames.join(', ')}`, 'info');
      }
      await onChanged();
      loadOrders();
    } catch (error) {
      Swal.fire('הפעולה נכשלה', describeSubscriptionError(error), 'error');
    } finally {
      setBusy('');
    }
  };

  const details = subscription.customerDetails || {};
  const status = subscription.status;
  const isOpen = status !== 'canceled';
  const today = todayKey();
  const skipDates = Array.isArray(subscription.skipDates) ? subscription.skipDates : [];
  const nextDate = subscription.nextDeliveryDate;
  const nextIsSkipped = Boolean(nextDate) && skipDates.includes(nextDate);
  const orderList = orders || [];
  const upcoming = orderList.filter((order) => order.paymentStatus === 'held' && order.delayedOrderStatus === 'pending_weighing');
  const skippedOrders = orderList.filter((order) => order.paymentStatus === 'canceled'
    && order.cancelReason === 'customer_skip' && String(order.deliveryDate || '') >= today);
  const pastOrders = orderList.filter((order) => !upcoming.includes(order) && !skippedOrders.includes(order));
  const futureSkipDates = [...new Set(skipDates.filter((date) => date >= today))].sort();
  const nextHasOrder = orderList.some((order) => order.deliveryDate === nextDate);
  const personalLines = Array.isArray(subscription.recurringLines) ? subscription.recurringLines : [];
  const adminLog = (Array.isArray(subscription.adminActions) ? subscription.adminActions : [])
    .slice()
    .sort((a, b) => (toDate(b.at)?.getTime() || 0) - (toDate(a.at)?.getTime() || 0))
    .slice(0, 10);
  const skipConfirm = (date) => ({
    title: `לדלג על המשלוח של ${formatDateKey(date)}?`,
    text: 'אם כבר נוצרה הזמנה היא תבוטל והמלאי יחזור. אפשר להחזיר עד מועד הסגירה.',
  });

  return (
    <div className="mt-3 space-y-4 border-t border-gray-100 pt-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="space-y-1">
          <h3 className="text-sm font-bold text-gray-800">לקוח</h3>
          <Field label="שם">{details.name || '—'}</Field>
          <Field label="טלפון">
            {details.phone ? <a href={`tel:${details.phone}`} className="text-blue-700 hover:underline" dir="ltr">{details.phone}</a> : '—'}
          </Field>
          <Field label="אימייל">
            {details.email ? <a href={`mailto:${details.email}`} className="text-blue-700 hover:underline">{details.email}</a> : '—'}
          </Field>
          <Field label="קבלה">
            {isOpen ? (
              <DeliveryOptionSwitch subscription={subscription} busy={Boolean(busy)} compact
                onSave={(choice) => run('delivery_option', choice)} />
            ) : (DELIVERY_OPTION_LABELS[subscription.deliveryOption] || subscription.deliveryOption || '—')}
          </Field>
          {details.address && <Field label="כתובת">{details.address}</Field>}
          {details.directions && <Field label="הערות">{details.directions}</Field>}
        </section>
        <section className="space-y-1">
          <h3 className="text-sm font-bold text-gray-800">מנוי</h3>
          <Field label="נרשם">{formatDateTime(subscription.createdAt)}</Field>
          {subscription.activatedAt && <Field label="הופעל">{formatDateTime(subscription.activatedAt)}</Field>}
          <Field label="כרטיס">{describeCard(subscription.card)}</Field>
          <Field label="וואטסאפ">
            <WhatsappReminderStatus
              subscription={subscription}
              busy={busy}
              onToggle={isOpen ? (enabled) => run('whatsapp_opt_in', { enabled }) : null}
            />
          </Field>
          {status === 'paused' && <Field label="סיבת השהיה">{PAUSE_REASON_LABELS[subscription.pauseReason] || subscription.pauseReason || '—'}</Field>}
          {status === 'paused' && describeLeaveFeedback(subscription.pauseFeedback) && (
            <Field label="למה השהה">{describeLeaveFeedback(subscription.pauseFeedback)}</Field>
          )}
          {status === 'canceled' && (
            <Field label="בוטל">
              {formatDateTime(subscription.canceledAt)}
              {subscription.canceledBy ? ` (${subscription.canceledBy === 'admin' ? 'אדמין' : 'הלקוח'})` : ''}
            </Field>
          )}
          {status === 'canceled' && describeLeaveFeedback(subscription.cancelFeedback) && (
            <Field label="למה ביטל">{describeLeaveFeedback(subscription.cancelFeedback)}</Field>
          )}
          {subscription.lastGeneration && (
            <Field label="הפעלה אחרונה">
              {GENERATION_LABELS[subscription.lastGeneration.result] || subscription.lastGeneration.result}
              {subscription.lastGeneration.reason ? ` (${SKIP_REASON_LABELS[subscription.lastGeneration.reason] || subscription.lastGeneration.reason})` : ''}
              {subscription.lastGeneration.deliveryDate ? ` · ${formatDateKey(subscription.lastGeneration.deliveryDate)}` : ''}
            </Field>
          )}
          {status === 'payment_failed' && subscription.paymentFailure && (
            <p className="rounded-md bg-red-50 p-2 text-xs text-red-800">
              החיוב נכשל{subscription.paymentFailure.amount ? ` (₪${Number(subscription.paymentFailure.amount).toFixed(2)})` : ''}
              {subscription.paymentFailure.message ? `: ${subscription.paymentFailure.message}` : ''}
              {subscription.paymentFailure.at ? ` · ${formatDateTime(subscription.paymentFailure.at)}` : ''}
              . רק הלקוח יכול להחליף כרטיס, מעמוד ניהול המנויים שלו.
            </p>
          )}
        </section>
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-800">
            הסל הקבוע
            <span className="mr-2 text-xs font-normal text-gray-500">
              {personalLines.length > 0 ? `סל אישי · ${personalLines.length} מוצרים` : `לפי "${subscription.basketTitle || 'הסל'}"`}
            </span>
          </h3>
          {isOpen && (
            <Link to={`/my-subscriptions/${subscription.id}/basket`} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800">
              עריכת הסל של הלקוח
            </Link>
          )}
        </div>
        {personalLines.length > 0 && (
          <p className="mt-1 text-xs text-gray-600">
            {personalLines.map((line) => `${line.productName || line.productId} ${line.quantity}`).join(' · ')}
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold text-gray-800">משלוחים</h3>
        {orders === null ? (
          <p className="text-xs text-gray-500">טוען משלוחים...</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {status === 'active' && nextDate && !nextHasOrder && (
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 p-2">
                <span>
                  הבא: <strong>{formatDateKey(nextDate)}</strong>
                  {nextIsSkipped ? ' · מדלגים' : ' · ההזמנה עוד לא נוצרה'}
                </span>
                {nextIsSkipped ? (
                  <button type="button" disabled={Boolean(busy)} onClick={() => run('unskip', { deliveryDate: nextDate })}
                    className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                    ביטול הדילוג
                  </button>
                ) : (
                  <button type="button" disabled={Boolean(busy)} onClick={() => run('skip', { deliveryDate: nextDate }, skipConfirm(nextDate))}
                    className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    דילוג
                  </button>
                )}
              </li>
            )}
            {upcoming.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                <span>
                  <strong>{formatDateKey(order.deliveryDate)}</strong> · ממתין לשקילה · כ-₪{getCustomerOrderDisplayTotal(order).amount.toFixed(2)}
                  <span className="mr-2 text-xs text-gray-500" dir="ltr">{order.id}</span>
                </span>
                {isOpen && (
                  <button type="button" disabled={Boolean(busy)} onClick={() => run('skip', { deliveryDate: order.deliveryDate }, skipConfirm(order.deliveryDate))}
                    className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    דילוג
                  </button>
                )}
              </li>
            ))}
            {skippedOrders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 p-2 text-gray-600">
                <span><span className="line-through">{formatDateKey(order.deliveryDate)}</span> · דילגו</span>
                {isOpen && (
                  <button type="button" disabled={Boolean(busy)} onClick={() => run('unskip', { deliveryDate: order.deliveryDate })}
                    className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                    ביטול הדילוג
                  </button>
                )}
              </li>
            ))}
            {futureSkipDates.filter((date) => date !== nextDate && !orderList.some((order) => order.deliveryDate === date)).map((date) => (
              <li key={`skip-${date}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 p-2 text-gray-600">
                <span><span className="line-through">{formatDateKey(date)}</span> · דילגו</span>
                {isOpen && (
                  <button type="button" disabled={Boolean(busy)} onClick={() => run('unskip', { deliveryDate: date })}
                    className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                    ביטול הדילוג
                  </button>
                )}
              </li>
            ))}
            {pastOrders.map((order) => {
              const info = getCustomerOrderStatusInfo(order);
              return (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-1">
                  <span>
                    {formatDateKey(order.deliveryDate)} · ₪{getCustomerOrderDisplayTotal(order).amount.toFixed(2)}
                    <span className="mr-2 text-xs text-gray-500" dir="ltr">{order.id}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE_CLASSES[info.tone]}`}>{info.label}</span>
                </li>
              );
            })}
            {orderList.length === 0 && !(status === 'active' && nextDate) && (
              <li className="text-xs text-gray-500">אין משלוחים</li>
            )}
          </ul>
        )}
      </section>

      {isOpen && status !== 'pending_card' && (
        <section className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
            <button key={value} type="button" disabled={Boolean(busy) || subscription.frequency === value}
              onClick={() => run('frequency', { frequency: value }, { title: `לשנות ל"${label}"?` })}
              aria-pressed={subscription.frequency === value}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                subscription.frequency === value ? 'border-emerald-700 bg-emerald-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-emerald-400'
              }`}>
              {label}
            </button>
          ))}
          {status === 'active' && (
            <button type="button" disabled={Boolean(busy)}
              onClick={() => run('pause', {}, { title: 'להשהות את המנוי?', text: ADMIN_PAUSE_CONFIRM_TEXT })}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50">
              השהיה
            </button>
          )}
          {status === 'paused' && (
            <button type="button" disabled={Boolean(busy)}
              onClick={() => run('resume', {}, { title: 'לחדש את המנוי?', text: ADMIN_RESUME_CONFIRM_TEXT })}
              className="rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
              חידוש
            </button>
          )}
        </section>
      )}
      {isOpen && (
        <div>
          <button type="button" disabled={Boolean(busy)}
            onClick={() => run('cancel', {}, {
              title: `לבטל את המנוי של ${details.name || 'הלקוח'}?`,
              text: 'משלוח שעוד לא עבר את מועד הסגירה יבוטל והמלאי שלו יחזור. אי אפשר לבטל את הפעולה.',
              icon: 'warning',
              button: 'ביטול המנוי',
            })}
            className="rounded-md bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">
            ביטול מנוי
          </button>
        </div>
      )}

      {adminLog.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-bold text-gray-800">פעולות אדמין</h3>
          <ul className="space-y-0.5 text-xs text-gray-600">
            {adminLog.map((entry, index) => (
              <li key={`${entry.action}-${index}`}>
                {formatDateTime(entry.at)} · {ACTION_LABELS[entry.action] || entry.action}
                {entry.deliveryDate ? ` · ${formatDateKey(entry.deliveryDate)}` : ''}
                {entry.frequency ? ` · ${FREQUENCY_LABELS[entry.frequency] || entry.frequency}` : ''}
                {entry.uid && entry.uid !== currentUid ? ` · ${String(entry.uid).slice(0, 6)}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
      <SubscriptionBusyOverlay action={busy} />
    </div>
  );
};

const SubscriptionCustomersAdmin = () => {
  const { currentUser, userRole, loading: authLoading } = useAuth();
  const isAdmin = isAdminAccount(currentUser, userRole);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [community, setCommunity] = useState('');
  const [basketId, setBasketId] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState('');
  // The funnel report reads funnelEvents, so it loads only when opened.
  const [showFunnels, setShowFunnels] = useState(() => (
    typeof window !== 'undefined' && window.location.hash === '#funnels'
  ));

  const load = useCallback(async () => {
    try {
      setSubscriptions(await listAllSubscriptions());
      setError('');
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
      setError(err?.code === 'permission-denied' ? 'אין הרשאה לקרוא מנויים.' : 'טעינת המנויים נכשלה.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    load();
  }, [authLoading, isAdmin, load]);

  const counts = useMemo(() => subscriptions.reduce((acc, sub) => {
    acc[sub.status] = (acc[sub.status] || 0) + 1;
    return acc;
  }, {}), [subscriptions]);
  const communities = useMemo(() => [...new Set(subscriptions.map((sub) => sub.community).filter(Boolean))].sort(), [subscriptions]);
  const baskets = useMemo(() => {
    const map = new Map();
    subscriptions.forEach((sub) => { if (sub.basketId) map.set(sub.basketId, sub.basketTitle || sub.basketId); });
    return [...map.entries()];
  }, [subscriptions]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return subscriptions
      .filter((sub) => (statusFilter === 'all' ? true : statusFilter === 'open' ? sub.status !== 'canceled' : sub.status === statusFilter))
      .filter((sub) => !community || sub.community === community)
      .filter((sub) => !basketId || sub.basketId === basketId)
      .filter((sub) => {
        if (!query) return true;
        const details = sub.customerDetails || {};
        return [details.name, details.phone, details.email, sub.id].some((value) => String(value || '').toLowerCase().includes(query));
      })
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  }, [subscriptions, statusFilter, community, basketId, search]);

  if (authLoading || loading) return <div className="py-12"><LoadingSpinner /></div>;
  if (!isAdmin) {
    return <div className="p-6 text-center text-red-700" dir="rtl">אין הרשאה לדף הזה</div>;
  }

  const filterChips = [
    ['open', 'פתוחים', subscriptions.length - (counts.canceled || 0)],
    ...STATUS_ORDER.map((status) => [status, SUBSCRIPTION_STATUS_LABELS[status] || status, counts[status] || 0]),
    ['all', 'הכל', subscriptions.length],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-gray-900">מנויים</h1>
          <p className="text-sm text-gray-600">כל לקוחות המנוי, המשלוחים שלהם, ופעולות בשמם.</p>
        </div>
        <Link to="/admin/subscription-baskets" className="text-sm text-blue-700 hover:underline">סלי מנוי</Link>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <WhatsappReminderSettings />

      <div>
        <button type="button" onClick={() => setShowFunnels((open) => !open)} aria-expanded={showFunnels}
          aria-controls="funnel-report" className="text-sm font-semibold text-blue-700 hover:underline">
          {showFunnels ? 'הסתרת המשפכים' : 'משפכים: מי התחיל ומי עצר'}
        </button>
        {showFunnels && (
          <div id="funnel-report" className="mt-2">
            <FunnelReport subscriptions={subscriptions} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {filterChips.map(([value, label, count]) => (
          <button key={value} type="button" onClick={() => setStatusFilter(value)} aria-pressed={statusFilter === value}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${
              statusFilter === value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500'
            }`}>
            {label} <span className="font-normal opacity-80">{count}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש שם, טלפון או אימייל"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm" aria-label="חיפוש מנוי" />
        <select value={community} onChange={(event) => setCommunity(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" aria-label="סינון לפי יישוב">
          <option value="">כל היישובים</option>
          {communities.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={basketId} onChange={(event) => setBasketId(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" aria-label="סינון לפי סל">
          <option value="">כל הסלים</option>
          {baskets.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">אין מנויים להצגה</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((sub) => {
            const details = sub.customerDetails || {};
            const expanded = expandedId === sub.id;
            const skipped = sub.nextDeliveryDate && (sub.skipDates || []).includes(sub.nextDeliveryDate);
            return (
              <li key={sub.id} className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
                <button type="button" onClick={() => setExpandedId(expanded ? '' : sub.id)} aria-expanded={expanded}
                  className="flex w-full flex-wrap items-center justify-between gap-2 text-right">
                  <span className="min-w-0">
                    <span className="block font-bold text-gray-900">
                      {details.name || 'ללא שם'}
                      {details.phone && <span className="mr-2 text-sm font-normal text-gray-600" dir="ltr">{details.phone}</span>}
                    </span>
                    <span className="block text-xs text-gray-600">
                      {sub.community} · {sub.basketTitle || 'סל'}
                      {Array.isArray(sub.recurringLines) && sub.recurringLines.length > 0 ? ' (סל אישי)' : ''}
                      {' · '}{FREQUENCY_LABELS[sub.frequency] || sub.frequency}
                      {sub.status === 'active' && sub.nextDeliveryDate ? ` · הבא ${formatDateKey(sub.nextDeliveryDate)}${skipped ? ' (דילוג)' : ''}` : ''}
                      {sub.card?.status !== 'saved' ? ' · אין כרטיס' : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={sub.status} />
                    <span className="text-xs text-blue-700">{expanded ? 'סגירה' : 'פרטים ופעולות'}</span>
                  </span>
                </button>
                {expanded && <SubscriberDetails subscription={sub} currentUid={currentUser?.uid} onChanged={load} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default SubscriptionCustomersAdmin;
