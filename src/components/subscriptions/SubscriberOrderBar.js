import React, { useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FiCheckCircle, FiShoppingBag } from 'react-icons/fi';
import { useSubscriber } from '../../contexts/SubscriberContext';
import { getEstimatedLineTotal } from '../../utils/pricing';
import { SUBSCRIBER_STATES, formatDeadline } from '../../utils/subscriberStorefront';
import { CHARGED_ON_SAVED_CARD, deliveryName } from './copy';

// Subscriber mode: every change to the upcoming delivery is saved to the order
// at once. "אישור ההזמנה" waits until all of them reached the server and then
// tells the customer plainly what their order now holds.

const Spinner = ({ className = '' }) => (
  <span
    className={`inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin ${className}`}
    aria-hidden="true"
  />
);

export const useConfirmSubscriberOrder = () => {
  const subscriber = useSubscriber();
  const [confirming, setConfirming] = useState(false);

  const confirm = useCallback(async () => {
    if (!subscriber?.confirmOrder) return false;
    setConfirming(true);
    try {
      const result = await subscriber.confirmOrder();
      if (!result.ok) {
        await Swal.fire({
          title: 'לא כל השינויים נשמרו',
          text: `${result.error} בדקו את הסל לפני שתמשיכו.`,
          icon: 'warning',
          confirmButtonText: 'לבדיקת הסל',
        });
        subscriber.requestCartOpen();
        return false;
      }
      const { delivery, items, cutoffAt, order } = subscriber;
      const total = items.reduce((sum, item) => sum + getEstimatedLineTotal(item), 0)
        + (Number(order?.customerDetails?.deliveryDetails?.deliveryFee) || 0);
      const lines = [
        `<p style="margin:0 0 6px"><strong>${items.length} מוצרים</strong> · כ-₪${total.toFixed(2)}</p>`,
        `<p style="margin:0 0 6px">${deliveryName(delivery.deliveryDate)}</p>`,
        cutoffAt ? `<p style="margin:0 0 6px">אפשר להמשיך לשנות עד ${formatDeadline(cutoffAt)}</p>` : '',
        '<p style="margin:0 0 6px;padding:6px 8px;border-radius:6px;background:#fffbeb;color:#78350f">'
          + 'השינויים חלים על המשלוח הזה בלבד. הסל הקבוע לא השתנה.</p>',
        `<p style="margin:0;color:#4b5563;font-size:13px">החיוב יתבצע אחרי השקילה, ${CHARGED_ON_SAVED_CARD}.</p>`,
      ].join('');
      await Swal.fire({
        title: 'ההזמנה שלך מעודכנת',
        html: `<div dir="rtl" style="font-size:15px">${lines}</div>`,
        icon: 'success',
        confirmButtonText: 'מעולה',
        confirmButtonColor: '#047857',
      });
      return true;
    } finally {
      setConfirming(false);
    }
  }, [subscriber]);

  return { confirm, confirming };
};

const HIDDEN_PATH_PREFIXES = ['/admin', '/business', '/my-subscriptions', '/subscribe', '/subscription-success', '/login', '/signup'];

const SubscriberOrderBar = () => {
  const subscriber = useSubscriber();
  const { pathname } = useLocation();
  const { confirm, confirming } = useConfirmSubscriberOrder();

  if (!subscriber?.active || subscriber.delivery?.state !== SUBSCRIBER_STATES.OPEN) return null;
  if (HIDDEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  const { saveStatus, unconfirmedCount, items, delivery, requestCartOpen } = subscriber;
  const saving = saveStatus === 'saving';
  if (!saving && !confirming && unconfirmedCount === 0) return null;

  const total = items.reduce((sum, item) => sum + getEstimatedLineTotal(item), 0);

  return (
    // Phones: full width, just above the accessibility button. Wider screens: a centered card.
    <div
      className="fixed bottom-[4.25rem] left-2 right-2 z-30 sm:bottom-4 sm:left-1/2 sm:right-auto sm:w-[34rem] sm:-translate-x-1/2"
      dir="rtl"
      role="region"
      aria-label="אישור ההזמנה למשלוח הקרוב"
    >
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white p-2 shadow-2xl ring-1 ring-black/5 sm:gap-3 sm:p-3">
        <button
          type="button"
          onClick={requestCartOpen}
          className="flex min-w-0 flex-1 items-center gap-2 text-right"
          aria-label="צפייה בסל למשלוח הקרוב"
        >
          <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 sm:flex">
            <FiShoppingBag className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-gray-900">
              <span className="hidden sm:inline">{deliveryName(delivery.deliveryDate)} · </span>
              {items.length} מוצרים · כ-₪{total.toFixed(0)}
            </span>
            <span className="block truncate text-xs text-gray-600" role="status" aria-live="polite">
              {saving ? 'שומרים בהזמנה…' : 'נשמר בהזמנה · לחצו לאישור'}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={confirming}
          className="relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-800 disabled:cursor-wait disabled:bg-emerald-600 sm:gap-2 sm:px-4 sm:py-3"
        >
          {!confirming && !saving && (
            <span className="absolute inset-0 rounded-xl ring-4 ring-emerald-400/60 motion-safe:animate-pulse" aria-hidden="true" />
          )}
          {confirming || saving ? <Spinner /> : <FiCheckCircle className="h-4 w-4" aria-hidden="true" />}
          {confirming ? 'מאשרים…' : 'אישור ההזמנה'}
        </button>
      </div>
    </div>
  );
};

export default SubscriberOrderBar;
