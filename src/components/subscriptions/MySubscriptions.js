import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import SecureCardProgress, { useResetOnPageRestore } from './SecureCardProgress';
import {
  CARD_CONSENT_TEXT,
  FREQUENCY_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  cardConsentPayload,
  confirmBasketSubscriptionCard,
  describeSubscriptionError,
  listMySubscriptions,
  listSubscriptionOrders,
  updateBasketSubscription,
} from '../../services/basketSubscriptionService';
import { getCustomerOrderDisplayTotal, getCustomerOrderStatusInfo, STATUS_BADGE_CLASSES } from '../../utils/customerOrderDisplay';
import { parseDateSafe } from '../../utils/deliveryScheduleUtils';

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

const formatDateKey = (dateKey) => {
  const date = parseDateSafe(dateKey);
  return date ? date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' }) : '';
};

const SubscriptionCard = ({ subscription, onChanged }) => {
  const [orders, setOrders] = useState([]);
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
    } catch (error) {
      Swal.fire('הפעולה נכשלה', describeSubscriptionError(error), 'error');
    } finally {
      setBusy('');
    }
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
  const skipDates = Array.isArray(subscription.skipDates) ? subscription.skipDates : [];
  const nextDate = subscription.nextDeliveryDate;
  const nextIsSkipped = nextDate && skipDates.includes(nextDate);
  const upcomingOrders = orders.filter((order) => order.paymentStatus === 'held' && order.delayedOrderStatus === 'pending_weighing');
  const pastOrders = orders.filter((order) => !upcomingOrders.includes(order));

  return (
    <article className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{subscription.basketTitle || 'סל קבוע'}</h2>
          <p className="text-sm text-gray-600">
            {subscription.community} · {DELIVERY_OPTION_LABELS[subscription.deliveryOption] || ''} · {FREQUENCY_LABELS[subscription.frequency] || ''}
          </p>
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

      {status === 'payment_failed' && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          החיוב האחרון לא עבר. עדכנו כרטיס כדי שהמנוי ימשיך.
        </div>
      )}
      {status === 'paused' && subscription.pauseReason === 'basket_unavailable' && (
        <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
          הסל הזה לא זמין כרגע ולכן המנוי מושהה.
        </div>
      )}
      {status === 'pending_card' && (
        <div className="mt-3 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-900">
          הכרטיס עדיין לא נשמר. המנוי יתחיל אחרי שמירת כרטיס.
        </div>
      )}

      {status === 'active' && nextDate && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-700">
            המשלוח הבא: <strong>{formatDateKey(nextDate)}</strong>
            {nextIsSkipped ? ' (מדלגים)' : ''}
          </span>
          {nextIsSkipped ? (
            <button type="button" disabled={Boolean(busy)} onClick={() => run('unskip', { deliveryDate: nextDate })}
              className="px-3 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold disabled:opacity-50">
              בטל דילוג
            </button>
          ) : (
            <button type="button" disabled={Boolean(busy)} onClick={() => run('skip', { deliveryDate: nextDate })}
              className="px-3 py-1 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-semibold disabled:opacity-50">
              דלג על משלוח זה
            </button>
          )}
        </div>
      )}

      {upcomingOrders.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">סל שמחכה לך</h3>
          <ul className="space-y-2">
            {upcomingOrders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <span>
                  {formatDateKey(order.deliveryDate)} · כ-₪{getCustomerOrderDisplayTotal(order).amount.toFixed(2)}
                </span>
                <span className="flex gap-2">
                  <Link to={`/my-orders/${order.id}`} className="px-3 py-1 rounded-md bg-amber-600 text-white text-xs font-semibold">
                    עריכת הסל
                  </Link>
                  <button type="button" disabled={Boolean(busy)}
                    onClick={() => run('skip', { deliveryDate: order.deliveryDate }, 'לבטל את המשלוח הזה?')}
                    className="px-3 py-1 rounded-md bg-white text-gray-700 border border-gray-300 text-xs font-semibold disabled:opacity-50">
                    דלג
                  </button>
                </span>
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
            <button type="button" disabled={Boolean(busy)} onClick={() => run('pause', {}, 'להשהות את המנוי?')}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
              השהיה
            </button>
          )}
          {status === 'paused' && (
            <button type="button" disabled={Boolean(busy)} onClick={() => run('resume')}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
              חידוש המנוי
            </button>
          )}
          <button type="button" disabled={Boolean(busy)} onClick={replaceCard}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
            {status === 'pending_card' ? 'שמירת כרטיס' : 'החלפת כרטיס'}
          </button>
          <button type="button" disabled={Boolean(busy)}
            onClick={() => run('cancel', {}, 'לבטל את המנוי? משלוח שעוד לא נסגר יבוטל גם הוא.')}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">
            ביטול מנוי
          </button>
        </div>
      )}
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
      setError('טעינת המנויים נכשלה');
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
          await confirmBasketSubscriptionCard(returnedId);
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
        <p className="mb-3">כדי לנהל מנויים צריך להתחבר.</p>
        <Link to="/login" state={{ from: '/my-subscriptions' }} className="text-emerald-700 underline">התחברות</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4" dir="rtl">
      <h1 className="text-2xl font-black text-gray-900">המנויים שלי</h1>
      {error && <p className="text-red-600">{error}</p>}
      {subscriptions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-600">
          אין לך עדיין מנויים. סלי מנוי מופיעים בחנות של היישוב שלך.
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
