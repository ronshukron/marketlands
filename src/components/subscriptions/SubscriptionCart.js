import React from 'react';
import { Link } from 'react-router-dom';
import { FiCheck, FiCheckCircle, FiClock, FiLock, FiMinus, FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import { useSubscriber } from '../../contexts/SubscriberContext';
import { useConfirmSubscriberOrder } from './SubscriberOrderBar';
import { getEstimatedChargeableQuantity, getEstimatedLineTotal } from '../../utils/pricing';
import {
  SUBSCRIBER_STATES,
  describeDeliveryPlace,
  formatDeadline,
  formatDeliveryDay,
  getWeighedAmount,
} from '../../utils/subscriberStorefront';

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

const ConfirmOrderButton = ({ saveStatus, unconfirmedCount, onConfirmed }) => {
  const { confirm, confirming } = useConfirmSubscriberOrder();
  const saving = saveStatus === 'saving';
  if (!saving && !confirming && unconfirmedCount === 0 && saveStatus !== 'error') {
    return (
      <p className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-3 text-sm font-semibold text-emerald-800" role="status">
        <FiCheck className="h-4 w-4" aria-hidden="true" />
        ההזמנה שמורה ומעודכנת
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={async () => {
          if (await confirm()) onConfirmed();
        }}
        disabled={confirming}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3.5 text-base font-bold text-white shadow-md hover:bg-emerald-800 disabled:cursor-wait disabled:bg-emerald-600"
      >
        {confirming || saving ? (
          <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <FiCheckCircle className="h-5 w-5" aria-hidden="true" />
        )}
        {confirming ? 'מאשרים…' : 'אישור ההזמנה'}
      </button>
      <p className="text-center text-xs text-gray-600" role="status" aria-live="polite">
        {saving && 'שומרים את השינוי בהזמנה…'}
        {!saving && saveStatus === 'error' && <span className="text-red-600">השינוי האחרון לא נשמר. בדקו את הסל.</span>}
        {!saving && saveStatus !== 'error' && 'השינויים כבר בהזמנה. האישור מוודא שהכול נשמר.'}
      </p>
    </div>
  );
};

const ItemRow = ({ item, editable, onChange }) => {
  const measurementType = item.measurementType || 'kg';
  const step = measurementType === 'kg' ? (Number(item.unitSize) || 0.5) : 1;
  const next = (delta) => Math.max(0, Math.round((item.quantity + delta) * 1000) / 1000);
  const canIncrease = editable && !item.locked;
  return (
    <li className="flex items-start gap-3 py-3">
      {item.images?.[0] ? (
        <img src={item.images[0]} alt="" className="h-12 w-12 shrink-0 rounded-md border border-gray-100 object-cover" />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-md bg-gray-100" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
        {item.selectedOption && <p className="truncate text-[11px] text-gray-500">{item.selectedOption}</p>}
        <p className="text-[11px] text-gray-500">
          ₪{Number(item.price || 0).toFixed(2)}{priceUnit(measurementType)}
          {measurementType === 'unit' && ` · כ-${getEstimatedChargeableQuantity(item).toFixed(2)} ק"ג`}
        </p>
        {item.locked && editable && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
            <FiLock className="h-3 w-3 shrink-0" aria-hidden="true" />
            ההזמנה מהחקלאי נסגרה. אפשר להפחית או להסיר עד השקילה.
          </p>
        )}
        {editable ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-gray-200">
              <button
                type="button"
                onClick={() => onChange(item, next(-step))}
                className="flex h-8 w-8 items-center justify-center text-gray-700 hover:bg-gray-50"
                aria-label={`הפחתת ${item.name}`}
              >
                <FiMinus className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="min-w-[4.5rem] text-center text-sm font-semibold text-gray-900" aria-live="polite">
                {formatQuantity(item.quantity, measurementType)}
              </span>
              <button
                type="button"
                onClick={() => onChange(item, next(step))}
                disabled={!canIncrease}
                className="flex h-8 w-8 items-center justify-center text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                aria-label={`הוספת ${item.name}`}
              >
                <FiPlus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => onChange(item, 0)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
              aria-label={`הסרת ${item.name}`}
            >
              <FiTrash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <p className="mt-1 text-sm font-semibold text-gray-800">{formatQuantity(item.quantity, measurementType)}</p>
        )}
      </div>
      <p className="shrink-0 text-sm font-semibold text-gray-900">₪{getEstimatedLineTotal(item).toFixed(2)}</p>
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

  return (
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
        dir="rtl"
        aria-label="הסל למשלוח הקרוב"
      >
        <header className="flex items-start justify-between gap-2 border-b border-gray-100 p-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">הסל למשלוח הקרוב</h2>
            {delivery.deliveryDate && (
              <p className="mt-0.5 text-sm text-gray-600">
                {formatDeliveryDay(delivery.state === SUBSCRIBER_STATES.SKIPPED ? delivery.skippedDate : delivery.deliveryDate)}
                {' · '}
                {describeDeliveryPlace(subscription)}
              </p>
            )}
            {isOpenState && cutoffAt && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <FiClock className="h-3.5 w-3.5" aria-hidden="true" />
                אפשר לערוך עד {formatDeadline(cutoffAt)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
            aria-label="סגירת הסל"
          >
            <FiX className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4">
          {isOpenState && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              השינויים כאן חלים על המשלוח הזה בלבד. כדי להוסיף מוצר, בוחרים אותו בחנות ולוחצים "הוסף לסל".
            </p>
          )}
          {isClosed && (
            <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700">
              {order?.paymentStatus === 'completed'
                ? `המשלוח נשקל וחויב: ₪${(weighedAmount || 0).toFixed(2)} בכרטיס השמור במנוי.`
                : weighedAmount !== null
                  ? `המשלוח נשקל. הסכום הסופי: ₪${weighedAmount.toFixed(2)}`
                  : 'המשלוח נסגר לעריכה ונמצא בהכנה. החיוב יתבצע אחרי השקילה.'}
            </p>
          )}
          {delivery.state === SUBSCRIBER_STATES.AWAITING && (
            <div className="py-10 text-center text-sm text-gray-600">
              <p className="font-semibold text-gray-800">הסל למשלוח הזה עוד לא נפתח לעריכה</p>
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
                <Link to="/my-subscriptions" onClick={onClose} className="font-semibold text-emerald-700 underline">לניהול המנוי</Link>
              </p>
            </div>
          )}
          {(isOpenState || isClosed) && (
            items.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500">אין מוצרים במשלוח הזה</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((item) => (
                  <ItemRow key={item.key} item={item} editable={isOpenState} onChange={setItemQuantity} />
                ))}
              </ul>
            )
          )}
        </div>

        {(isOpenState || isClosed) && (
          <footer className="space-y-2 border-t border-gray-100 bg-gray-50 p-4">
            {deliveryFee > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>משלוח</span>
                <span>₪{deliveryFee.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900">
              <span>סה"כ משוער</span>
              <span>₪{(cartTotal + deliveryFee).toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-600">החיוב הסופי יתבצע אחרי השקילה, בכרטיס השמור במנוי.</p>
            {isOpenState && (
              <ConfirmOrderButton saveStatus={saveStatus} unconfirmedCount={unconfirmedCount} onConfirmed={onClose} />
            )}
          </footer>
        )}
      </aside>
    </div>
  );
};

export default SubscriptionCart;
