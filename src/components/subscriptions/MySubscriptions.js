import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import SecureCardProgress, { useResetOnPageRestore } from './SecureCardProgress';
import SubscriptionBusyOverlay from './SubscriptionBusyOverlay';
import { useSubscriber } from '../../contexts/SubscriberContext';
import {
  CARD_CONSENT_TEXT,
  FREQUENCY_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  cardConsentPayload,
  confirmBasketSubscriptionCard,
  describeSubscriptionError,
  listMySubscriptions,
  listSubscriptionOrders,
  loadCommunitySchedule,
  updateBasketSubscription,
} from '../../services/basketSubscriptionService';
import { getCustomerOrderDisplayTotal, getCustomerOrderStatusInfo, STATUS_BADGE_CLASSES } from '../../utils/customerOrderDisplay';
import { getEffectiveCutoffAt, parseDateSafe } from '../../utils/deliveryScheduleUtils';
import { formatDeadline, formatDeliveryDay } from '../../utils/subscriberStorefront';
import {
  DELIVERY_TONE,
  EDIT_RECURRING,
  EDIT_THIS_DELIVERY,
  MY_WEEKLY_BASKET,
  ONE_TIME,
  PAUSE_CONFIRM_TEXT,
  RECURRING_BASKET,
  RECURRING_SCOPE,
  RECURRING_TONE,
  WEEKLY_BASKET,
  WHATSAPP_OPT_IN_HINT,
  WHATSAPP_ROW_LABEL,
  deliveryOptionOutcomeMessage,
  pauseOutcomeMessage,
  resumeOutcomeMessage,
} from './copy';
import DeliveryOptionSwitch from './DeliveryOptionSwitch';
import { confirmLeaving } from './leaveReasonPrompt';

// After replacing a card: how long to wait for Grow's server update.
const REPLACE_CARD_CHECKS = 8;
const REPLACE_CARD_CHECK_DELAY_MS = 2500;

const DELIVERY_OPTION_LABELS = {
  pickup: 'איסוף מנקודת החלוקה',
  homeDelivery: 'משלוח עד הבית',
  boxCollection: 'איסוף מארגז',
};

const STATUS_TONES = {
  active: 'green',
  pending_card: 'yellow',
  paused: 'gray',
  payment_failed: 'red',
  canceled: 'gray',
};

// "יום רביעי, 25.11", the same day format as the store and the cart.
const deliveryDayText = (dateKey) => formatDeliveryDay(dateKey);

const formatDateKey = (dateKey) => {
  const date = parseDateSafe(dateKey);
  return date ? date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' }) : '';
};

const SubscriptionCard = ({ subscription, onChanged }) => {
  const subscriber = useSubscriber();
  // In subscriber mode the upcoming delivery is edited in the store itself.
  const editInStore = Boolean(subscriber?.active) && subscriber?.delivery?.subscription?.id === subscription.id;
  const [orders, setOrders] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [busy, setBusy] = useState('');
  // '' | 'preparing' | 'redirecting', while opening Grow's card page
  const [cardStep, setCardStep] = useState('');
  const [growUrl, setGrowUrl] = useState('');
  useResetOnPageRestore(() => setCardStep(''));

  useEffect(() => {
    let active = true;
    listSubscriptionOrders(subscription)
      .then((result) => { if (active) setOrders(result); })
      .catch(() => { if (active) setOrders([]); });
    return () => { active = false; };
  }, [subscription]);

  // Editing deadlines of the upcoming deliveries.
  useEffect(() => {
    let active = true;
    loadCommunitySchedule(subscription.community)
      .then((result) => { if (active) setSchedule(result); })
      .catch(() => { if (active) setSchedule(null); });
    return () => { active = false; };
  }, [subscription.community]);
  const editDeadline = (deliveryDate) => {
    if (!schedule || !deliveryDate) return '';
    const cutoffAt = getEffectiveCutoffAt(deliveryDate, schedule);
    return cutoffAt ? formatDeadline(cutoffAt) : '';
  };

  const run = async (action, extra = {}, confirmText = '') => {
    if (confirmText) {
      const result = await Swal.fire({
        title: confirmText,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'כן',
        cancelButtonText: 'לא',
      });
      if (!result.isConfirmed) return;
    }
    setBusy(action);
    try {
      const result = await updateBasketSubscription(subscription.id, action, extra);
      if (result?.url) {
        window.location.assign(result.url);
        return;
      }
      await onChanged();
      // What happened to the delivery that was already open.
      const outcome = action === 'pause' ? pauseOutcomeMessage(result)
        : action === 'resume' ? resumeOutcomeMessage(result)
          : action === 'delivery_option' ? deliveryOptionOutcomeMessage(result) : null;
      if (outcome) Swal.fire({ ...outcome, confirmButtonText: 'הבנתי' });
    } catch (error) {
      Swal.fire('הפעולה נכשלה', describeSubscriptionError(error), 'error');
    } finally {
      setBusy('');
    }
  };

  // Pause and cancel ask "why?" too (optional); the answer goes with the action.
  const leave = async (action, title, text = '') => {
    const answer = await confirmLeaving(Swal, title, text);
    if (answer) await run(action, answer);
  };

  const replaceCard = async () => {
    const result = await Swal.fire({
      title: subscription.status === 'pending_card' ? 'שמירת כרטיס' : 'החלפת כרטיס',
      html: '<p style="font-size:14px">תעברו לעמוד המאובטח של Grow. התשלום בכרטיס אשראי בלבד.</p>',
      input: 'checkbox',
      inputValue: 0,
      inputPlaceholder: CARD_CONSENT_TEXT,
      confirmButtonText: 'המשך',
      showCancelButton: true,
      cancelButtonText: 'ביטול',
      inputValidator: (checked) => (checked ? undefined : 'יש לאשר את שמירת פרטי הכרטיס לחיובים עתידיים'),
    });
    if (!result.isConfirmed) return;
    setCardStep('preparing');
    try {
      const response = await updateBasketSubscription(subscription.id, 'replace_card', cardConsentPayload());
      if (!response?.url) throw new Error('PAYMENT_PAGE_FAILED');
      // The overlay stays up while the browser leaves for Grow.
      setGrowUrl(response.url);
      setCardStep('redirecting');
      window.location.assign(response.url);
    } catch (error) {
      setCardStep('');
      Swal.fire('הפעולה נכשלה', describeSubscriptionError(error), 'error');
    }
  };

  const status = subscription.status;
  const isOpen = status !== 'canceled';
  // WhatsApp reminder before orders close: the customer's choice, if made.
  const whatsapp = subscription.notifications?.whatsapp || null;
  const whatsappOn = whatsapp?.optIn === true;
  const whatsappPhoneDigits = String(whatsapp?.phoneE164 || subscription.customerDetails?.phone || '').replace(/\D/g, '').slice(-4);
  const setWhatsapp = (enabled) => run('whatsapp_opt_in', { enabled });
  const skipDates = Array.isArray(subscription.skipDates) ? subscription.skipDates : [];
  const nextDate = subscription.nextDeliveryDate;
  const nextIsSkipped = nextDate && skipDates.includes(nextDate);
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const byDateAsc = (a, b) => String(a.deliveryDate || '').localeCompare(String(b.deliveryDate || ''));
  const upcomingOrders = orders
    .filter((order) => order.paymentStatus === 'held' && order.delayedOrderStatus === 'pending_weighing')
    .sort(byDateAsc);
  // Deliveries the customer skipped that have not happened yet: still "upcoming", with an undo.
  const skippedOrders = orders.filter((order) => order.paymentStatus === 'canceled'
    && order.cancelReason === 'customer_skip' && String(order.deliveryDate || '') >= todayKey);
  const pastOrders = orders.filter((order) => !upcomingOrders.includes(order) && !skippedOrders.includes(order));
  const skippedDates = [...new Set(skipDates.filter((date) => date >= todayKey && date !== nextDate))].sort();

  const restore = async (deliveryDate) => {
    setBusy('unskip');
    try {
      const result = await updateBasketSubscription(subscription.id, 'unskip', { deliveryDate });
      await onChanged();
      const dropped = Array.isArray(result?.droppedProductNames) ? result.droppedProductNames : [];
      if (result?.restored) {
        Swal.fire({
          title: 'המשלוח חזר',
          text: dropped.length > 0
            ? `חלק מהמוצרים אזלו בינתיים ולא נכנסו: ${dropped.join(', ')}`
            : 'הסל חזר בדיוק כמו שהיה.',
          icon: 'success',
          confirmButtonText: 'הבנתי',
        });
      }
    } catch (error) {
      Swal.fire('הפעולה נכשלה', describeSubscriptionError(error), 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <article className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{subscription.basketTitle || WEEKLY_BASKET}</h2>
          <p className="text-sm text-gray-600">
            {subscription.community} · {FREQUENCY_LABELS[subscription.frequency] || ''}
          </p>
          {isOpen && status !== 'pending_card' ? (
            <DeliveryOptionSwitch
              subscription={subscription}
              busy={Boolean(busy)}
              onSave={(choice) => run('delivery_option', choice)}
            />
          ) : (
            <p className="text-sm text-gray-600">{DELIVERY_OPTION_LABELS[subscription.deliveryOption] || ''}</p>
          )}
          {subscription.card?.status === 'saved' && (
            <p className="text-xs text-gray-500 mt-1">
              כרטיס שמור{subscription.card.last4 ? ` מסתיים ב-${subscription.card.last4}` : ''}
            </p>
          )}
        </div>
        <span className={`self-start px-3 py-1 text-xs font-medium rounded-full ${STATUS_BADGE_CLASSES[STATUS_TONES[status] || 'gray']}`}>
          {SUBSCRIPTION_STATUS_LABELS[status] || status}
        </span>
      </div>

      {isOpen && status !== 'pending_card' && !whatsapp && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-950">
          <p className="font-semibold">רוצים תזכורת בוואטסאפ כמה שעות לפני סגירת ההזמנות?</p>
          <p className="mt-0.5 text-xs text-green-900">{WHATSAPP_OPT_IN_HINT}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={() => setWhatsapp(true)}
              className="px-3 py-1.5 rounded-md bg-green-700 text-white text-xs font-semibold hover:bg-green-800 disabled:opacity-50">
              כן, שלחו לי
            </button>
            <button type="button" disabled={Boolean(busy)} onClick={() => setWhatsapp(false)}
              className="px-3 py-1.5 rounded-md bg-white text-gray-700 border border-gray-300 text-xs font-semibold disabled:opacity-50">
              לא תודה
            </button>
          </div>
        </div>
      )}

      {status === 'payment_failed' && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          החיוב האחרון לא עבר. עדכנו כרטיס כדי שהסל השבועי ימשיך.
        </div>
      )}
      {status === 'paused' && subscription.pauseReason === 'basket_unavailable' && (
        <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
          הסל הזה לא זמין כרגע, ולכן המשלוחים מושהים.
        </div>
      )}
      {status === 'pending_card' && (
        <div className="mt-3 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-900">
          הכרטיס עדיין לא נשמר. הסל השבועי יתחיל אחרי שמירת כרטיס.
        </div>
      )}

      {status === 'active' && nextDate && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-700">
            המשלוח הבא: <strong>{formatDateKey(nextDate)}</strong>
            {nextIsSkipped ? ' (מדלגים)' : ''}
          </span>
          {nextIsSkipped ? (
            <button type="button" disabled={Boolean(busy)} onClick={() => restore(nextDate)}
              className="px-3 py-1 rounded-md bg-emerald-700 text-white hover:bg-emerald-800 text-xs font-semibold disabled:opacity-50">
              ביטול הדילוג
            </button>
          ) : (
            <button type="button" disabled={Boolean(busy)} onClick={() => run('skip', { deliveryDate: nextDate }, 'לדלג על המשלוח הזה? אפשר לבטל את הדילוג עד מועד הסגירה.')}
              className="px-3 py-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-semibold disabled:opacity-50">
              דלג על משלוח זה
            </button>
          )}
        </div>
      )}

      {isOpen && status !== 'pending_card' && (
        <section className={`mt-4 rounded-lg border-2 p-3 ${RECURRING_TONE.box}`} aria-label={RECURRING_BASKET}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold">
                {RECURRING_BASKET}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${RECURRING_TONE.chip}`}>{RECURRING_SCOPE}</span>
              </h3>
              <p className="mt-1 text-xs">
                {subscription.recurringLines?.length > 0
                  ? `${subscription.recurringLines.length} מוצרים שבחרתם`
                  : 'הסל כפי שנבחר בהרשמה'}
                {status === 'active' && nextDate
                  ? ` · שינוי יחול מ${deliveryDayText(nextDate)}`
                  : ' · שינוי יחול על המשלוחים הבאים'}
              </p>
            </div>
            <Link to={`/my-subscriptions/${subscription.id}/basket`} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${RECURRING_TONE.button}`}>
              {EDIT_RECURRING}
            </Link>
          </div>
        </section>
      )}

      {(upcomingOrders.length > 0 || skippedOrders.length > 0 || skippedDates.length > 0) && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">המשלוחים הקרובים</h3>
          <ul className="space-y-2">
            {upcomingOrders.map((order) => {
              const deadline = editDeadline(order.deliveryDate);
              const inStore = editInStore && subscriber?.order?.id === order.id;
              return (
                <li key={order.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 p-3 text-sm ${DELIVERY_TONE.box}`}>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong>המשלוח של {deliveryDayText(order.deliveryDate)}</strong>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DELIVERY_TONE.chip}`}>{ONE_TIME}</span>
                    </span>
                    <span className="block text-xs">
                      כ-₪{getCustomerOrderDisplayTotal(order).amount.toFixed(2)}
                      {deadline ? ` · אפשר לערוך עד ${deadline}` : ''}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <Link
                      to={inStore ? '/' : `/my-orders/${order.id}`}
                      state={inStore ? { openSubscriptionCart: true } : undefined}
                      className={`px-3 py-1 rounded-md text-xs font-semibold ${DELIVERY_TONE.button}`}
                    >
                      {EDIT_THIS_DELIVERY}
                    </Link>
                    <button type="button" disabled={Boolean(busy)}
                      onClick={() => run('skip', { deliveryDate: order.deliveryDate }, 'לדלג על המשלוח הזה? אפשר לבטל את הדילוג עד מועד הסגירה.')}
                      className="px-3 py-1 rounded-md bg-white text-gray-700 border border-gray-300 text-xs font-semibold disabled:opacity-50">
                      דלג
                    </button>
                  </span>
                </li>
              );
            })}
            {skippedOrders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <span className="text-gray-600">
                  <span className="line-through">{formatDateKey(order.deliveryDate)}</span>
                  <span className="mr-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">דילגתם</span>
                </span>
                <button type="button" disabled={Boolean(busy)} onClick={() => restore(order.deliveryDate)}
                  className="px-3 py-1 rounded-md bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50">
                  ביטול הדילוג
                </button>
              </li>
            ))}
            {skippedDates.map((date) => (
              <li key={`skip-${date}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <span className="text-gray-600">
                  <span className="line-through">{formatDateKey(date)}</span>
                  <span className="mr-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">דילגתם</span>
                </span>
                <button type="button" disabled={Boolean(busy)} onClick={() => restore(date)}
                  className="px-3 py-1 rounded-md bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50">
                  ביטול הדילוג
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pastOrders.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">משלוחים קודמים</h3>
          <ul className="space-y-1 text-sm">
            {pastOrders.map((order) => {
              const info = getCustomerOrderStatusInfo(order);
              return (
                <li key={order.id} className="flex items-center justify-between gap-2">
                  <Link to={`/my-orders/${order.id}`} className="text-blue-700 hover:underline">{formatDateKey(order.deliveryDate)}</Link>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_BADGE_CLASSES[info.tone]}`}>{info.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {isOpen && whatsapp && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <span className="text-gray-800">
            {WHATSAPP_ROW_LABEL}
            {whatsappPhoneDigits && (
              <span className="block text-xs text-gray-500" dir="rtl">למספר שמסתיים ב-{whatsappPhoneDigits}</span>
            )}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={whatsappOn}
            aria-label={WHATSAPP_ROW_LABEL}
            disabled={Boolean(busy)}
            onClick={() => setWhatsapp(!whatsappOn)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${whatsappOn ? 'bg-green-600' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${whatsappOn ? '-translate-x-6' : '-translate-x-1'}`} />
          </button>
        </div>
      )}

      {isOpen && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
          {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
            <button key={value} type="button" disabled={Boolean(busy) || subscription.frequency === value}
              onClick={() => run('frequency', { frequency: value })}
              aria-pressed={subscription.frequency === value}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                subscription.frequency === value ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-gray-700 border-gray-300 hover:border-emerald-400'
              }`}>
              {label}
            </button>
          ))}
          {status === 'active' && (
            <button type="button" disabled={Boolean(busy)} onClick={() => leave('pause', 'להשהות את הסל השבועי?', PAUSE_CONFIRM_TEXT)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
              השהיה
            </button>
          )}
          {status === 'paused' && (
            <button type="button" disabled={Boolean(busy)} onClick={() => run('resume')}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
              חידוש הסל השבועי
            </button>
          )}
          <button type="button" disabled={Boolean(busy)} onClick={replaceCard}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
            {status === 'pending_card' ? 'שמירת כרטיס' : 'החלפת כרטיס'}
          </button>
          <button type="button" disabled={Boolean(busy)}
            onClick={() => leave('cancel', 'לבטל את ההרשמה לסל השבועי? משלוח שעוד לא נסגר יבוטל גם הוא.')}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">
            ביטול ההרשמה
          </button>
        </div>
      )}
      <SubscriptionBusyOverlay action={busy} />
      <SecureCardProgress
        step={cardStep}
        purpose={status === 'pending_card' ? 'signup' : 'replace'}
        fallbackUrl={growUrl}
      />
    </article>
  );
};

const MySubscriptions = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmingCard, setConfirmingCard] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!currentUser?.uid) return;
    try {
      setSubscriptions(await listMySubscriptions(currentUser.uid));
      setError('');
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
      setError('טעינת הסל השבועי נכשלה');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      setLoading(false);
      return;
    }
    const params = new URLSearchParams(location.search);
    const returnedId = params.get('subscriptionId');
    const cardResult = params.get('card');
    (async () => {
      if (returnedId && cardResult === 'saved') {
        setConfirmingCard(true);
        try {
          // Wait briefly for Grow's server update to save the new card.
          for (let attempt = 0; attempt < REPLACE_CARD_CHECKS; attempt += 1) {
            const result = await confirmBasketSubscriptionCard(returnedId);
            if (!result?.cardPending) break;
            await new Promise((resolve) => { setTimeout(resolve, REPLACE_CARD_CHECK_DELAY_MS); });
          }
        } catch (err) {
          console.warn('Card confirmation after replace failed; the webhook will finish it', err);
        } finally {
          setConfirmingCard(false);
        }
      }
      if (cardResult === 'canceled') {
        Swal.fire('הכרטיס לא הוחלף', 'החלפת הכרטיס בוטלה.', 'info');
      }
      if (cardResult) navigate('/my-subscriptions', { replace: true });
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, currentUser]);

  if (confirmingCard) {
    return <div className="px-4 py-8"><SecureCardProgress step="confirming" purpose="replace" variant="inline" /></div>;
  }

  if (authLoading || loading) return <div className="py-12"><LoadingSpinner /></div>;

  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center" dir="rtl">
        <p className="mb-3">כדי לנהל את הסל השבועי צריך להתחבר.</p>
        <Link to="/login" state={{ from: '/my-subscriptions' }} className="text-emerald-700 underline">התחברות</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4" dir="rtl">
      <h1 className="text-2xl font-black text-gray-900">{MY_WEEKLY_BASKET}</h1>
      {error && <p className="text-red-600">{error}</p>}
      {subscriptions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-600">
          עדיין לא נרשמת לסל שבועי. אפשר להירשם בחנות של היישוב שלך
          <div className="mt-3"><Link to="/" className="text-emerald-700 underline">לחנות</Link></div>
        </div>
      ) : (
        subscriptions.map((subscription) => (
          <SubscriptionCard key={subscription.id} subscription={subscription} onChanged={load} />
        ))
      )}
    </div>
  );
};

export default MySubscriptions;
