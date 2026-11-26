import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { FiArrowRight } from 'react-icons/fi';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import { useSubscriber } from '../../contexts/SubscriberContext';
import LoadingSpinner from '../LoadingSpinner';
import SubscriptionBusyOverlay from './SubscriptionBusyOverlay';
import RecurringLinesEditor from './RecurringLinesEditor';
import {
  describeSubscriptionError,
  getMySubscription,
  listRecurringBasketProducts,
  loadProductsInfo,
  updateRecurringBasket,
} from '../../services/basketSubscriptionService';
import {
  estimateRecurringLines,
  initialRecurringLines,
  isRecurringBasketChanged,
  toProductInfo,
  toRecurringPayload,
} from '../../utils/recurringBasket';
import { SUBSCRIBER_STATES } from '../../utils/subscriberStorefront';
import { isAdminAccount } from '../../utils/accountRoles';

// "עריכת הסל הקבוע": the customer's own recurring basket. Saved on their
// subscription only; deliveries created after saving start from it.

const RecurringBasketEditor = () => {
  const { subscriptionId } = useParams();
  const { currentUser, userRole, loading: authLoading } = useAuth();
  const subscriber = useSubscriber();
  // An admin can open a customer's basket from /admin/subscriptions.
  const isAdmin = isAdminAccount(currentUser, userRole);
  const [subscription, setSubscription] = useState(null);
  const [initial, setInitial] = useState([]);
  const [lines, setLines] = useState([]);
  const [productInfo, setProductInfo] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return undefined;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const sub = currentUser ? await getMySubscription(subscriptionId) : null;
        if (!sub || (sub.userId !== currentUser?.uid && !isAdmin)) {
          if (active) setLoadError('המנוי לא נמצא');
          return;
        }
        let basket = null;
        if (!(Array.isArray(sub.recurringLines) && sub.recurringLines.length > 0) && sub.basketId) {
          try {
            const basketSnap = await getDoc(doc(db, 'subscriptionBaskets', sub.basketId));
            basket = basketSnap.exists() ? basketSnap.data() : null;
          } catch {
            basket = null;
          }
        }
        const { lines: startLines } = initialRecurringLines(sub, basket);
        const products = await loadProductsInfo(startLines.map((line) => line.productId));
        if (!active) return;
        setSubscription(sub);
        setInitial(startLines);
        setLines(startLines);
        setProductInfo(Object.fromEntries(Object.entries(products).map(([id, data]) => [id, toProductInfo(data)])));
      } catch (error) {
        if (active) setLoadError('טעינת הסל נכשלה');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authLoading, currentUser, isAdmin, subscriptionId]);

  const changed = useMemo(() => isRecurringBasketChanged(initial, lines), [initial, lines]);
  const estimate = useMemo(() => estimateRecurringLines(lines, productInfo), [lines, productInfo]);

  useEffect(() => {
    if (!changed) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changed]);

  const loadCatalog = () => listRecurringBasketProducts(subscriptionId).then((result) => result.products);

  const save = async () => {
    if (lines.length === 0) return;
    setSaving(true);
    try {
      await updateRecurringBasket(subscriptionId, toRecurringPayload(lines));
      setInitial(lines);
      Swal.fire({
        title: 'הסל הקבוע נשמר',
        text: 'משלוחים שייווצרו מעכשיו יתחילו מהסל הזה. משלוח שכבר נפתח לא משתנה.',
        icon: 'success',
        confirmButtonText: 'הבנתי',
      });
    } catch (error) {
      const productId = error?.response?.data?.productId;
      const name = productId ? (productInfo[productId]?.productName || '') : '';
      const message = describeSubscriptionError(error);
      Swal.fire('הסל לא נשמר', name ? `${message}: ${name}` : message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) return <div className="py-12"><LoadingSpinner /></div>;
  if (!currentUser) {
    return (
      <div className="mx-auto max-w-xl p-6 text-center" dir="rtl">
        <p className="mb-3">כדי לערוך את הסל הקבוע צריך להתחבר.</p>
        <Link to="/login" className="text-emerald-700 underline">התחברות</Link>
      </div>
    );
  }
  if (loadError || !subscription) {
    return (
      <div className="mx-auto max-w-xl p-6 text-center" dir="rtl">
        <p className="mb-3 text-red-700">{loadError || 'המנוי לא נמצא'}</p>
        <Link to={isAdmin ? '/admin/subscriptions' : '/my-subscriptions'} className="text-emerald-700 underline">לניהול המנויים</Link>
      </div>
    );
  }

  const readOnly = subscription.status === 'canceled';
  const forCustomer = subscription.userId !== currentUser.uid;
  const backPath = forCustomer ? '/admin/subscriptions' : '/my-subscriptions';
  const showWeeklyLink = !forCustomer && subscriber?.active
    && subscriber.delivery?.subscription?.id === subscriptionId
    && subscriber.delivery?.state === SUBSCRIBER_STATES.OPEN;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6" dir="rtl">
      <Link to={backPath} className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline">
        <FiArrowRight className="h-4 w-4" aria-hidden="true" />
        {forCustomer ? 'מנויים (אדמין)' : 'ניהול מנויים'}
      </Link>

      {forCustomer && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          עריכה כאדמין של הסל של <strong>{subscription.customerDetails?.name || 'הלקוח'}</strong>.
          השינוי נשמר במנוי של הלקוח ונרשם ביומן הפעולות.
        </p>
      )}

      <header>
        <h1 className="text-2xl font-black text-gray-900">עריכת הסל הקבוע</h1>
        <p className="mt-1 text-sm text-gray-600">
          {subscription.basketTitle || 'סל קבוע'} · {subscription.community}
        </p>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          זה הסל שממנו מתחיל כל משלוח חדש. כדי לשנות רק את המשלוח הקרוב, ערכו אותו בחנות.
        </p>
      </header>

      {readOnly && (
        <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-700">המנוי בוטל, ולכן אי אפשר לערוך את הסל.</p>
      )}

      <RecurringLinesEditor
        lines={lines}
        setLines={setLines}
        productInfo={productInfo}
        setProductInfo={setProductInfo}
        loadCatalog={loadCatalog}
        catalogKey={`subscription|${subscriptionId}`}
        readOnly={readOnly}
      />

      {!readOnly && (
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-xl sm:border">
          <div className="text-xs text-gray-600">
            {lines.length > 0 && (
              <p className="text-sm text-gray-800">
                הערכה לכל משלוח: <strong>₪{estimate.toFixed(2)}</strong> (לפני משלוח, לפי שקילה)
              </p>
            )}
            <p>השינוי יחול על משלוחים שעדיין לא נוצרו</p>
            {showWeeklyLink && (
              <Link to="/" className="font-semibold text-emerald-700 underline">לעריכת המשלוח הקרוב</Link>
            )}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={!changed || lines.length === 0 || saving}
            className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            שמירת הסל הקבוע
          </button>
        </div>
      )}

      <SubscriptionBusyOverlay action={saving ? 'recurring_basket' : ''} />
    </div>
  );
};

export default RecurringBasketEditor;
