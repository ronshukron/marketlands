import React from 'react';
import { Link } from 'react-router-dom';
import { FiCalendar, FiCheckCircle, FiClock, FiLock, FiShoppingBag, FiSkipForward } from 'react-icons/fi';
import { useSubscriber } from '../../contexts/SubscriberContext';
import { getEstimatedLineTotal } from '../../utils/pricing';
import {
  SUBSCRIBER_STATES,
  describeDeliveryPlace,
  formatDeadline,
  formatDeliveryDay,
  getWeighedAmount,
} from '../../utils/subscriberStorefront';

// Top of the storefront in subscriber mode: which delivery the customer is
// shopping for, until when, and that changes here are for this delivery only.
const SubscriberStoreBanner = ({ justActivated = false }) => {
  const subscriber = useSubscriber();
  if (!subscriber?.active) return null;

  const { delivery, cutoffAt, opensAt, order, requestCartOpen, items } = subscriber;
  const subscription = delivery.subscription || {};
  const place = describeDeliveryPlace(subscription);
  const lineCount = items.length;
  const cartTotal = items.reduce((sum, item) => sum + getEstimatedLineTotal(item), 0);

  let icon = FiShoppingBag;
  let title = '';
  const details = [];
  if (delivery.state === SUBSCRIBER_STATES.OPEN) {
    title = `הסל שלי ל${formatDeliveryDay(delivery.deliveryDate)} · ${place}`;
    if (cutoffAt) details.push({ icon: FiClock, text: `אפשר לערוך עד ${formatDeadline(cutoffAt)}` });
    details.push({ text: 'השינויים כאן חלים על המשלוח הזה בלבד' });
  } else if (delivery.state === SUBSCRIBER_STATES.AWAITING) {
    icon = FiCalendar;
    title = `המשלוח הבא: ${formatDeliveryDay(delivery.deliveryDate)} · ${place}`;
    details.push({
      icon: FiClock,
      text: opensAt ? `הסל ייפתח לעריכה ב${formatDeadline(opensAt)} בערך` : 'הסל ייפתח לעריכה כמה ימים לפני המשלוח',
    });
    details.push({ text: 'כשהסל ייפתח, אפשר יהיה להוסיף אליו מוצרים מהחנות' });
  } else if (delivery.state === SUBSCRIBER_STATES.SKIPPED) {
    icon = FiSkipForward;
    title = `דילגתם על המשלוח של ${formatDeliveryDay(delivery.skippedDate)}`;
    if (delivery.nextDeliveryDate) details.push({ icon: FiCalendar, text: `המשלוח הבא: ${formatDeliveryDay(delivery.nextDeliveryDate)} · ${place}` });
  } else {
    icon = FiLock;
    const weighed = getWeighedAmount(order);
    const charged = order?.paymentStatus === 'completed';
    if (charged) {
      title = `הסל ל${formatDeliveryDay(delivery.deliveryDate)} נשקל וחויב`;
      details.push({ text: `חויבו ₪${(weighed || 0).toFixed(2)} בכרטיס השמור במנוי` });
    } else if (weighed !== null) {
      title = `הסל ל${formatDeliveryDay(delivery.deliveryDate)} נשקל`;
      details.push({ text: `הסכום הסופי: ₪${weighed.toFixed(2)}. החיוב יתבצע בכרטיס השמור במנוי.` });
    } else {
      title = `הסל ל${formatDeliveryDay(delivery.deliveryDate)} נסגר לעריכה`;
      details.push({ text: 'המשלוח בהכנה. החיוב יתבצע אחרי השקילה.' });
    }
  }
  const TitleIcon = icon;
  const canOpenCart = delivery.state === SUBSCRIBER_STATES.OPEN || delivery.state === SUBSCRIBER_STATES.CLOSED;

  return (
    <section className="mx-1 mb-4 mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4" dir="rtl" aria-label="המשלוח הקרוב שלי">
      {justActivated && (
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
          <FiCheckCircle className="h-4 w-4" aria-hidden="true" />
          המנוי הופעל. מכאן אפשר להתאים את הסל למשלוח הקרוב.
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-start gap-2 text-base font-bold text-emerald-950 sm:text-lg">
            <TitleIcon className="mt-1 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>{title}</span>
          </h2>
          <ul className="mt-1 space-y-0.5 pr-7 text-sm text-emerald-900">
            {details.map(({ icon: DetailIcon, text }) => (
              <li key={text} className="flex items-center gap-1.5">
                {DetailIcon && <DetailIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2 pr-7 sm:pr-0">
          {canOpenCart && (
            <button
              type="button"
              onClick={requestCartOpen}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              {delivery.state === SUBSCRIBER_STATES.OPEN
                ? `הסל למשלוח הקרוב · ${lineCount} מוצרים · כ-₪${cartTotal.toFixed(0)}`
                : 'צפייה בסל'}
            </button>
          )}
          {delivery.state === SUBSCRIBER_STATES.SKIPPED && (
            <Link
              to="/my-subscriptions"
              className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              ניהול המנוי
            </Link>
          )}
        </div>
      </div>
      {delivery.state === SUBSCRIBER_STATES.OPEN && (
        <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm text-emerald-950">
          <p className="font-semibold">איך מוסיפים לסל של השבוע?</p>
          <p className="mt-0.5">
            {lineCount === 0 ? 'הסל ריק כרגע. ' : ''}
            בוחרים מוצר בחנות למטה ולוחצים "הוסף לסל". המוצר נכנס ישר להזמנה, ובסוף לוחצים "אישור ההזמנה".
          </p>
        </div>
      )}
    </section>
  );
};

export default SubscriberStoreBanner;
