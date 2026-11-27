import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { FiArrowRight, FiRepeat } from 'react-icons/fi';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import { useSubscriber } from '../../contexts/SubscriberContext';
import LoadingSpinner from '../LoadingSpinner';
import SubscriptionBusyOverlay from './SubscriptionBusyOverlay';
import RecurringLinesEditor from './RecurringLinesEditor';
import useBusinessPromotions from './useBusinessPromotions';
import useBottomBarSpace from '../../hooks/useBottomBarSpace';
import {
  describeSubscriptionError,
  getMySubscription,
  listRecurringBasketProducts,
  loadProductsInfo,
  setSubscriptionOrderItem,
  updateRecurringBasket,
} from '../../services/basketSubscriptionService';
import {
  diffRecurringLines,
  estimateRecurringLines,
  priceRecurringLines,
  initialRecurringLines,
  isRecurringBasketChanged,
  toProductInfo,
  toRecurringPayload,
} from '../../utils/recurringBasket';
import { SUBSCRIBER_STATES } from '../../utils/subscriberStorefront';
import { isAdminAccount } from '../../utils/accountRoles';
import {
  DELIVERY_TONE,
  MY_WEEKLY_BASKET,
  RECURRING_SCOPE,
  RECURRING_TONE,
  WEEKLY_BASKET,
  deliveryName,
  recurringAppliesFrom,
} from './copy';

// Why the open delivery refused a change, in the customer's words.
const REFUSAL_REASONS = {
  FORM_CLOSED: 'ההזמנה מהחקלאי כבר נסגרה',
  OUT_OF_STOCK: 'אין מספיק במלאי',
  PRODUCT_MISSING: 'המוצר לא זמין',
  ORDER_LOCKED: 'המשלוח כבר בהכנה',
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Put the recurring-basket changes on the delivery that is already open, one
 * product at a time (the server checks the farmer form and stock each time).
 * @return {Promise<Array<{name: string, reason: string}>>} the changes that were refused
 */
async function applyChangesToDelivery({ orderId, changes, productInfo }) {
  const refused = [];
  for (const change of changes) {
    try {
      await setSubscriptionOrderItem({
        orderId,
        productId: change.productId,
        formId: change.formId || productInfo[change.productId]?.formId || '',
        selectedOption: change.selectedOption,
        quantity: change.quantity,
      });
    } catch (error) {
      const code = error?.response?.data?.error || '';
      const name = change.productName || productInfo[change.productId]?.productName || change.productId;
      refused.push({ name, reason: REFUSAL_REASONS[code] || describeSubscriptionError(error) });
      // The delivery closed or went to weighing meanwhile: the rest would be refused too.
      if (code === 'ORDER_LOCKED' || code === 'ORDER_CLOSED') {
        changes.slice(changes.indexOf(change) + 1).forEach((rest) => {
          refused.push({ name: rest.productName || productInfo[rest.productId]?.productName || rest.productId, reason: REFUSAL_REASONS.ORDER_LOCKED });
        });
        break;
      }
    }
  }
  return refused;
}

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
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (authLoading) return undefined;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const sub = currentUser ? await getMySubscription(subscriptionId) : null;
        if (!sub || (sub.userId !== currentUser?.uid && !isAdmin)) {
          if (active) setLoadError('הסל השבועי לא נמצא');
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
  // The save bar is pinned to the bottom on phones: keep the accessibility button above it.
  useBottomBarSpace(Boolean(subscription) && subscription.status !== 'canceled');
  // Farmers' shared promotions ("N for ₪X" across products), priced like the delivery.
  const promotionsByBusinessId = useBusinessPromotions(lines, productInfo);
  const linePricing = useMemo(
    () => priceRecurringLines(lines, productInfo, promotionsByBusinessId),
    [lines, productInfo, promotionsByBusinessId],
  );
  const estimate = useMemo(
    () => estimateRecurringLines(lines, productInfo, promotionsByBusinessId),
    [lines, productInfo, promotionsByBusinessId],
  );

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

  // The first delivery a change reaches; unknown while paused.
  const appliesFromDate = subscription?.status === 'active' ? subscription.nextDeliveryDate : '';

  // The delivery of this subscription that is open for editing right now, if any.
  const openDelivery = subscription && subscription.userId === currentUser?.uid && subscriber?.active
    && subscriber.delivery?.subscription?.id === subscriptionId
    && subscriber.delivery?.state === SUBSCRIBER_STATES.OPEN
    && subscriber.order?.id
    ? { orderId: subscriber.order.id, deliveryDate: subscriber.delivery.deliveryDate }
    : null;

  const save = async () => {
    if (lines.length === 0) return;
    setSaving(true);
    let saved = false;
    const changes = diffRecurringLines(initial, lines);
    try {
      await updateRecurringBasket(subscriptionId, toRecurringPayload(lines));
      setInitial(lines);
      saved = true;
    } catch (error) {
      const productId = error?.response?.data?.productId;
      const name = productId ? (productInfo[productId]?.productName || '') : '';
      const message = describeSubscriptionError(error);
      Swal.fire('הסל לא נשמר', name ? `${message}: ${name}` : message, 'error');
    } finally {
      setSaving(false);
    }
    if (!saved) return;

    if (!openDelivery || changes.length === 0) {
      Swal.fire({
        title: 'הסל הקבוע נשמר',
        text: `${recurringAppliesFrom(appliesFromDate)}.`,
        icon: 'success',
        confirmButtonText: 'הבנתי',
      });
      return;
    }

    const deliveryTitle = deliveryName(openDelivery.deliveryDate);
    const answer = await Swal.fire({
      title: 'הסל הקבוע נשמר',
      html: `<div dir="rtl" style="font-size:15px">`
        + `<p style="margin:0 0 8px">${escapeHtml(recurringAppliesFrom(appliesFromDate))}.</p>`
        + `<p style="margin:0"><strong>להחיל את השינויים גם על ${escapeHtml(deliveryTitle)}?</strong></p>`
        + '<p style="margin:6px 0 0;color:#4b5563;font-size:13px">המשלוח הזה כבר נפתח. מוצרים שהוספתם רק אליו לא ישתנו.</p>'
        + '</div>',
      icon: 'success',
      showCancelButton: true,
      confirmButtonText: 'כן, גם על המשלוח הקרוב',
      cancelButtonText: 'לא, רק מהמשלוח הבא',
      confirmButtonColor: '#d97706',
      cancelButtonColor: '#047857',
      reverseButtons: true,
    });
    if (!answer.isConfirmed) return;

    setApplying(true);
    let refused = [];
    try {
      refused = await applyChangesToDelivery({ orderId: openDelivery.orderId, changes, productInfo });
    } finally {
      setApplying(false);
    }
    if (refused.length === 0) {
      Swal.fire({
        title: `${deliveryTitle} עודכן`,
        text: 'השינויים נכנסו גם למשלוח הזה.',
        icon: 'success',
        confirmButtonText: 'הבנתי',
      });
      return;
    }
    const applied = changes.length - refused.length;
    Swal.fire({
      title: applied > 0 ? `${deliveryTitle} עודכן חלקית` : `${deliveryTitle} לא השתנה`,
      html: `<div dir="rtl" style="font-size:14px;text-align:right">`
        + '<p style="margin:0 0 6px">הסל הקבוע נשמר. את השינויים האלה לא אפשר היה להכניס למשלוח הזה:</p>'
        + `<ul style="margin:0;padding-right:18px">${refused.map((item) => `<li>${escapeHtml(item.name)}: ${escapeHtml(item.reason)}</li>`).join('')}</ul>`
        + '</div>',
      icon: 'warning',
      confirmButtonText: 'הבנתי',
    });
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
        <p className="mb-3 text-red-700">{loadError || 'הסל השבועי לא נמצא'}</p>
        <Link to={isAdmin ? '/admin/subscriptions' : '/my-subscriptions'} className="text-emerald-700 underline">{isAdmin ? 'לקוחות סל שבועי' : `ל${MY_WEEKLY_BASKET}`}</Link>
      </div>
    );
  }

  const readOnly = subscription.status === 'canceled';
  const forCustomer = subscription.userId !== currentUser.uid;
  const backPath = forCustomer ? '/admin/subscriptions' : '/my-subscriptions';

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4 text-right sm:space-y-4 sm:p-6 [&_p]:mb-0" dir="rtl">
      <Link to={backPath} className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline">
        <FiArrowRight className="h-4 w-4" aria-hidden="true" />
        {forCustomer ? 'לקוחות סל שבועי (אדמין)' : MY_WEEKLY_BASKET}
      </Link>

      {forCustomer && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          עריכה כאדמין של הסל של <strong>{subscription.customerDetails?.name || 'הלקוח'}</strong>.
          השינוי נשמר בסל השבועי של הלקוח ונרשם ביומן הפעולות.
        </p>
      )}

      <header>
        <h1 className="text-xl font-black text-gray-900 sm:text-2xl">עריכת הסל הקבוע</h1>
        <p className="mt-1 text-sm text-gray-600">
          {subscription.basketTitle || WEEKLY_BASKET} · {subscription.community}
        </p>
        <div className={`mt-2 rounded-xl border-2 px-3 py-2 sm:mt-3 sm:px-4 sm:py-3 ${RECURRING_TONE.box}`} role="note">
          <p className="flex items-start gap-2 text-sm font-bold sm:text-base">
            <FiRepeat className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>עורכים את הסל הקבוע · {recurringAppliesFrom(appliesFromDate)}</span>
          </p>
          <p className="mt-1 hidden pr-7 text-sm sm:block">זה הסל שממנו מתחיל כל משלוח חדש ({RECURRING_SCOPE}).</p>
        </div>
        {openDelivery && (
          <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm ${DELIVERY_TONE.box}`}>
            <span>
              {deliveryName(openDelivery.deliveryDate)} כבר נפתח ולא ישתנה. אחרי השמירה נשאל אם להחיל עליו את השינויים.
            </span>
            <Link to="/" state={{ openSubscriptionCart: true }} className={`rounded-md px-3 py-2 text-sm font-semibold ${DELIVERY_TONE.button}`}>
              לעריכת המשלוח הזה
            </Link>
          </div>
        )}
      </header>

      {readOnly && (
        <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-700">ההרשמה לסל השבועי בוטלה, ולכן אי אפשר לערוך את הסל.</p>
      )}

      <RecurringLinesEditor
        lines={lines}
        setLines={setLines}
        productInfo={productInfo}
        setProductInfo={setProductInfo}
        loadCatalog={loadCatalog}
        catalogKey={`subscription|${subscriptionId}`}
        readOnly={readOnly}
        linePricing={linePricing}
      />
      {lines.length > 0 && (
        <p className="text-xs text-gray-500">ההערכה לפני דמי משלוח. הסכום הסופי לפי השקילה.</p>
      )}

      {!readOnly && (
        // One short row pinned to the bottom: the estimate and the save button.
        // The "applies from" date is in the box at the top, the weighing note
        // under the list. The accessibility button moves above it (useBottomBarSpace).
        <div className="sticky bottom-0 -mx-4 flex items-center gap-3 sm:justify-between border-t border-gray-200 bg-white/95 px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:pb-3 sm:pt-3">
          <div className="shrink-0 leading-tight">
            {lines.length > 0 && (
              <>
                <p className="text-[11px] text-gray-600">הערכה למשלוח</p>
                <p className="text-lg font-bold text-gray-900">₪{estimate.toFixed(2)}</p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={!changed || lines.length === 0 || saving}
            aria-label="שמירת הסל הקבוע"
            className="min-w-0 flex-1 whitespace-nowrap rounded-lg bg-emerald-700 px-3 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-300 sm:flex-none sm:px-5 sm:py-2.5"
          >
            <span className="min-[360px]:hidden">שמירה</span>
            <span className="hidden min-[360px]:inline">שמירת הסל הקבוע</span>
          </button>
        </div>
      )}

      <SubscriptionBusyOverlay action={saving ? 'recurring_basket' : (applying ? 'apply_to_delivery' : '')} />
    </div>
  );
};

export default RecurringBasketEditor;
