import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FiCheck, FiCheckCircle, FiClock, FiLock, FiMinus, FiPlus, FiRepeat, FiTrash2, FiX } from 'react-icons/fi';
import { useSubscriber } from '../../contexts/SubscriberContext';
import { useConfirmSubscriberOrder } from './SubscriberOrderBar';
import { getEffectiveUnitPrice, getEstimatedChargeableQuantity, getEstimatedLineTotal } from '../../utils/pricing';
import {
  SUBSCRIBER_STATES,
  describeDeliveryPlace,
  formatDeadline,
  formatDeliveryDay,
  formatShortDeadline,
  getWeighedAmount,
} from '../../utils/subscriberStorefront';
import { isInRecurringLines } from '../../utils/recurringBasket';
import { addProductToRecurringBasket, describeSubscriptionError } from '../../services/basketSubscriptionService';
import {
  ADD_LINE_TO_RECURRING,
  ADD_TO_NEXT_DELIVERY,
  CHARGED_ON_SAVED_CARD,
  DELIVERY_TONE,
  EDIT_RECURRING,
  LINE_ALSO_IN_RECURRING,
  LINE_FROM_RECURRING,
  LINE_THIS_DELIVERY_ONLY,
  MY_WEEKLY_BASKET,
  NEXT_DELIVERY,
  ONE_TIME,
  RECURRING_TONE,
  THIS_DELIVERY_ONLY,
  deliveryName,
  recurringAppliesFrom,
} from './copy';

// The cart drawer in subscriber mode: the upcoming subscription delivery.
// Every change is saved to that order at once; "אישור ההזמנה" waits for the
// saves and confirms what the order holds. The card on file is charged once
// after weighing.

const formatQuantity = (qty, measurementType) => {
  const value = Number(qty) || 0;
  if (measurementType === 'kg') return `${value % 1 === 0 ? value : Math.round(value * 100) / 100} ק"ג`;
  if (measurementType === 'unit') return `${Math.round(value)} יח'`;
  return `${Math.round(value)} מארז`;
};

const priceUnit = (measurementType) => (measurementType === 'package' ? '/מארז' : '/ק"ג');

// Kept short so the list above it has room on a phone: the button, and a
// status line only while saving or after an error. The standing explanation
// ("השינויים כבר בהזמנה…") is in the list, under the products.
const ConfirmOrderButton = ({ saveStatus, unconfirmedCount, onConfirmed }) => {
  const { confirm, confirming } = useConfirmSubscriberOrder();
  const saving = saveStatus === 'saving';
  if (!saving && !confirming && unconfirmedCount === 0 && saveStatus !== 'error') {
    return (
      <p className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-2 py-2.5 text-center text-sm font-semibold leading-tight text-emerald-800" role="status">
        <FiCheck className="h-4 w-4" aria-hidden="true" />
        ההזמנה שמורה ומעודכנת
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={async () => {
          if (await confirm()) onConfirmed();
        }}
        disabled={confirming}
        className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-700 px-3 py-3 text-base font-bold text-white shadow-md hover:bg-emerald-800 disabled:cursor-wait disabled:bg-emerald-600"
      >
        {confirming || saving ? (
          <span className="h-4 w-4 shrink-0 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <FiCheckCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
        )}
        {confirming ? 'מאשרים…' : 'אישור ההזמנה'}
      </button>
      <p className="text-center text-xs text-gray-600" role="status" aria-live="polite">
        {saving && 'שומרים את השינוי בהזמנה…'}
        {!saving && saveStatus === 'error' && <span className="text-red-600">השינוי האחרון לא נשמר. בדקו את הסל.</span>}
      </p>
    </div>
  );
};

const ADD_TO_RECURRING_ERRORS = {
  TOO_MANY_LINES: 'בסל הקבוע יש כבר את מספר המוצרים המרבי. כדי להוסיף, הסירו מוצר אחר בעריכת הסל הקבוע.',
  DUPLICATE_LINE: 'המוצר כבר נמצא בסל הקבוע.',
};

// Where a line came from: the recurring basket, or this delivery only (with a
// way to keep it in the recurring basket too).
const LineSource = ({ item, subscription, editable }) => {
  const [adding, setAdding] = useState(false);
  if (item.source === 'basket') {
    return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${RECURRING_TONE.chip}`}>{LINE_FROM_RECURRING}</span>;
  }
  if (isInRecurringLines(subscription, item.id, item.selectedOption)) {
    return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${RECURRING_TONE.chip}`}>{LINE_ALSO_IN_RECURRING}</span>;
  }
  const addToRecurring = async () => {
    const answer = await Swal.fire({
      title: 'להוסיף גם לסל הקבוע?',
      text: `${item.name} יגיע בכל משלוח, בכמות הזו. ${recurringAppliesFrom(subscription.nextDeliveryDate)}.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'כן, להוסיף לסל הקבוע',
      cancelButtonText: 'לא',
      confirmButtonColor: '#047857',
    });
    if (!answer.isConfirmed) return;
    setAdding(true);
    try {
      const result = await addProductToRecurringBasket(subscription, {
        productId: item.id,
        selectedOption: item.selectedOption,
        quantity: item.quantity,
        productName: item.name,
        measurementType: item.measurementType,
        unitSize: item.unitSize,
        formId: item.orderId,
      });
      Swal.fire({
        title: result.alreadyThere ? 'כבר בסל הקבוע' : 'נוסף לסל הקבוע',
        text: result.alreadyThere ? `${item.name} כבר נמצא בסל הקבוע.` : `${item.name} יגיע מעכשיו בכל משלוח.`,
        icon: 'success',
        timer: 2200,
        showConfirmButton: false,
      });
    } catch (error) {
      const code = error?.response?.data?.error || '';
      Swal.fire('לא נוסף לסל הקבוע', ADD_TO_RECURRING_ERRORS[code] || describeSubscriptionError(error), 'warning');
    } finally {
      setAdding(false);
    }
  };
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${DELIVERY_TONE.chip}`}>{LINE_THIS_DELIVERY_ONLY}</span>
      {editable && !item.saving && subscription?.id && (
        <button
          type="button"
          onClick={addToRecurring}
          disabled={adding}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 underline disabled:cursor-wait disabled:opacity-60"
        >
          <FiRepeat className="h-3 w-3" aria-hidden="true" />
          {adding ? 'מוסיפים…' : ADD_LINE_TO_RECURRING}
        </button>
      )}
    </span>
  );
};

// One product: name, price and source on top; the quantity controls on their
// own full-width row, so + and − keep their size on the narrowest phones.
const ItemRow = ({ item, editable, onChange, subscription }) => {
  const measurementType = item.measurementType || 'kg';
  const step = measurementType === 'kg' ? (Number(item.unitSize) || 0.5) : 1;
  const next = (delta) => Math.max(0, Math.round((item.quantity + delta) * 1000) / 1000);
  const canIncrease = editable && !item.locked;
  return (
    <li className="py-2.5">
      <div className="flex items-start gap-2.5">
        {item.images?.[0] ? (
          <img src={item.images[0]} alt="" className="h-11 w-11 shrink-0 rounded-md border border-gray-100 object-cover" />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded-md bg-gray-100" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-gray-900">{item.name}</p>
          {item.selectedOption && <p className="truncate text-[11px] text-gray-500">{item.selectedOption}</p>}
          <p className="text-[11px] text-gray-500">
            ₪{getEffectiveUnitPrice(item).toFixed(2)}{priceUnit(measurementType)}
            {item.groupPromotionApplied && (
              <span className="ms-1 rounded bg-emerald-100 px-1 font-semibold text-emerald-800">מבצע משותף</span>
            )}
            {measurementType === 'unit' && ` · כ-${getEstimatedChargeableQuantity(item).toFixed(2)} ק"ג`}
          </p>
          <div className="mt-0.5">
            <LineSource item={item} subscription={subscription} editable={editable} />
          </div>
        </div>
        <p className="shrink-0 text-sm font-semibold text-gray-900">₪{getEstimatedLineTotal(item).toFixed(2)}</p>
      </div>
      {item.locked && editable && (
        <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
          <FiLock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          ההזמנה מהחקלאי נסגרה. אפשר להפחית או להסיר עד השקילה.
        </p>
      )}
      {editable ? (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="flex h-10 min-w-0 max-w-[12rem] flex-1 items-center rounded-lg border border-gray-300">
            <button
              type="button"
              onClick={() => onChange(item, next(-step))}
              className="flex h-full w-9 shrink-0 items-center justify-center rounded-r-lg text-gray-800 hover:bg-gray-50 sm:w-10"
              aria-label={`הפחתת ${item.name}`}
            >
              <FiMinus className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-[2.5rem] flex-1 whitespace-nowrap text-center text-sm font-semibold text-gray-900" aria-live="polite">
              {formatQuantity(item.quantity, measurementType)}
            </span>
            <button
              type="button"
              onClick={() => onChange(item, next(step))}
              disabled={!canIncrease}
              className="flex h-full w-9 shrink-0 items-center justify-center rounded-l-lg text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 sm:w-10"
              aria-label={`הוספת ${item.name}`}
            >
              <FiPlus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => onChange(item, 0)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
            aria-label={`הסרת ${item.name}`}
          >
            <FiTrash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <p className="mt-1 text-sm font-semibold text-gray-800">{formatQuantity(item.quantity, measurementType)}</p>
      )}
    </li>
  );
};

const SubscriptionCart = ({ isOpen, onClose }) => {
  const subscriber = useSubscriber();
  if (!isOpen || !subscriber?.active) return null;

  const {
    delivery, order, items, cutoffAt, opensAt, saveStatus, setItemQuantity, unconfirmedCount,
  } = subscriber;
  const cartTotal = items.reduce((sum, item) => sum + getEstimatedLineTotal(item), 0);
  const subscription = delivery.subscription || {};
  const isOpenState = delivery.state === SUBSCRIBER_STATES.OPEN;
  const isClosed = delivery.state === SUBSCRIBER_STATES.CLOSED;
  const deliveryFee = Number(order?.customerDetails?.deliveryDetails?.deliveryFee) || 0;
  const weighedAmount = isClosed ? getWeighedAmount(order) : null;
  const basketLink = subscription.id ? `/my-subscriptions/${subscription.id}/basket` : '/my-subscriptions';
  const shownDate = delivery.state === SUBSCRIBER_STATES.SKIPPED ? delivery.skippedDate : delivery.deliveryDate;

  // Phones: a one-line header and a footer with just the total and the
  // button, so the products get most of the screen; the notes and the link to
  // the recurring basket scroll with the products. z-50 keeps the drawer above
  // the floating accessibility button.
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="fixed inset-y-0 right-0 flex w-full max-w-sm flex-col bg-white text-right shadow-xl [&_p]:mb-0"
        onClick={(event) => event.stopPropagation()}
        dir="rtl"
        aria-label={NEXT_DELIVERY}
      >
        <header className={`flex shrink-0 items-center gap-2 border-b px-3 py-2 sm:px-4 ${isOpenState ? 'border-amber-200 bg-amber-50' : 'border-gray-100'}`}>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-x-2 text-sm font-bold leading-tight text-gray-900 sm:text-base">
              {shownDate ? deliveryName(shownDate) : NEXT_DELIVERY}
              {(isOpenState || isClosed) && (
                <span className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline-block ${DELIVERY_TONE.chip}`}>{ONE_TIME}</span>
              )}
            </h2>
            {isOpenState && cutoffAt && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-600">
                <FiClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="sm:hidden">עריכה עד {formatShortDeadline(cutoffAt)}</span>
                <span className="hidden sm:inline">אפשר לערוך עד {formatDeadline(cutoffAt)}</span>
              </p>
            )}
            {delivery.deliveryDate && (
              <p className="mt-0.5 hidden text-xs text-gray-600 sm:block">{describeDeliveryPlace(subscription)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
            aria-label="סגירת הסל"
          >
            <FiX className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 sm:px-4">
          {isClosed && (
            <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700">
              {order?.paymentStatus === 'completed'
                ? `המשלוח נשקל וחויב: ₪${(weighedAmount || 0).toFixed(2)} ${CHARGED_ON_SAVED_CARD}.`
                : weighedAmount !== null
                  ? `המשלוח נשקל. הסכום הסופי: ₪${weighedAmount.toFixed(2)}`
                  : 'המשלוח נסגר לעריכה ונמצא בהכנה. החיוב יתבצע אחרי השקילה.'}
            </p>
          )}
          {delivery.state === SUBSCRIBER_STATES.AWAITING && (
            <div className="py-10 text-center text-sm text-gray-600">
              <p className="font-semibold text-gray-800">המשלוח הזה עוד לא נפתח לעריכה</p>
              {opensAt && <p className="mt-1">הוא ייפתח ב{formatDeadline(opensAt)} בערך.</p>}
              <p className="mt-3">
                <Link to={basketLink} onClick={onClose} className="font-semibold text-emerald-700 underline">עריכת הסל הקבוע</Link>
              </p>
            </div>
          )}
          {delivery.state === SUBSCRIBER_STATES.SKIPPED && (
            <div className="py-10 text-center text-sm text-gray-600">
              <p className="font-semibold text-gray-800">דילגתם על המשלוח של {formatDeliveryDay(delivery.skippedDate)}</p>
              {delivery.nextDeliveryDate && <p className="mt-1">המשלוח הבא: {formatDeliveryDay(delivery.nextDeliveryDate)}</p>}
              <p className="mt-3">
                <Link to="/my-subscriptions" onClick={onClose} className="font-semibold text-emerald-700 underline">{MY_WEEKLY_BASKET}</Link>
              </p>
            </div>
          )}
          {(isOpenState || isClosed) && (
            items.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500">אין מוצרים במשלוח הזה</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((item) => (
                  <ItemRow key={item.key} item={item} editable={isOpenState} onChange={setItemQuantity} subscription={subscription} />
                ))}
              </ul>
            )
          )}
          {(isOpenState || isClosed) && (
            <div className="mt-2 space-y-3 border-t border-gray-100 pt-3">
              {isOpenState && (
                <p className={`rounded-lg border px-3 py-2 text-xs ${DELIVERY_TONE.box}`}>
                  <strong>{THIS_DELIVERY_ONLY}.</strong> כדי להוסיף מוצר, בוחרים אותו בחנות ולוחצים "{ADD_TO_NEXT_DELIVERY}".
                </p>
              )}
              {deliveryFee > 0 && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>משלוח</span>
                  <span>₪{deliveryFee.toFixed(2)}</span>
                </div>
              )}
              <p className="text-xs text-gray-600">
                החיוב הסופי יתבצע אחרי השקילה, {CHARGED_ON_SAVED_CARD}.
                {isOpenState && ' השינויים כבר בהזמנה. האישור מוודא שהכול נשמר.'}
              </p>
              <Link
                to={basketLink}
                onClick={onClose}
                className={`flex items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-2.5 text-sm font-semibold ${RECURRING_TONE.box} hover:bg-emerald-100`}
              >
                <FiRepeat className="h-4 w-4 shrink-0" aria-hidden="true" />
                {EDIT_RECURRING}
                <span className="text-xs font-normal">(לכל המשלוחים)</span>
              </Link>
            </div>
          )}
        </div>

        {(isOpenState || isClosed) && (
          <footer className="shrink-0 border-t border-gray-200 bg-white px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:px-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0 leading-tight">
                <p className="text-[11px] text-gray-600">סה"כ משוער{deliveryFee > 0 ? ' כולל משלוח' : ''}</p>
                <p className="text-lg font-bold text-gray-900">₪{(cartTotal + deliveryFee).toFixed(2)}</p>
              </div>
              {isOpenState && (
                <div className="min-w-0 flex-1">
                  <ConfirmOrderButton saveStatus={saveStatus} unconfirmedCount={unconfirmedCount} onConfirmed={onClose} />
                </div>
              )}
            </div>
          </footer>
        )}
      </aside>
    </div>
  );
};

export default SubscriptionCart;
