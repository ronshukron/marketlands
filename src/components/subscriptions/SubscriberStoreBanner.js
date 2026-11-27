import React from 'react';
import { Link } from 'react-router-dom';
import { FiCalendar, FiCheckCircle, FiClock, FiLock, FiMapPin, FiRepeat, FiShoppingBag, FiSkipForward } from 'react-icons/fi';
import { useSubscriber } from '../../contexts/SubscriberContext';
import { getEstimatedLineTotal } from '../../utils/pricing';
import {
  SUBSCRIBER_STATES,
  describeDeliveryPlace,
  formatDeadline,
  formatDeliveryDay,
  getWeighedAmount,
} from '../../utils/subscriberStorefront';
import {
  ADD_TO_NEXT_DELIVERY,
  CHARGED_ON_SAVED_CARD,
  DELIVERY_TONE,
  EDIT_RECURRING,
  EDIT_RECURRING_LINK,
  MY_WEEKLY_BASKET,
  ONE_TIME,
  RECURRING_TONE,
  SIGNUP_DONE,
  THIS_DELIVERY_ONLY,
  deliveryName,
} from './copy';

// Top of the storefront in subscriber mode: which delivery the customer is
// shopping for, until when, and that changes here are for this delivery only.
// Kept short on phones (most customers): the place and deadline on one
// wrapping line, the two buttons side by side, and the "how to add" help
// folded unless the delivery is empty or the customer just signed up.
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
  const isOpenState = delivery.state === SUBSCRIBER_STATES.OPEN;
  if (isOpenState) {
    title = `עורכים עכשיו: ${deliveryName(delivery.deliveryDate)}`;
    if (place) details.push({ icon: FiMapPin, text: place });
    if (cutoffAt) details.push({ icon: FiClock, text: `אפשר לערוך עד ${formatDeadline(cutoffAt)}` });
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
      details.push({ text: `חויבו ₪${(weighed || 0).toFixed(2)} ${CHARGED_ON_SAVED_CARD}` });
    } else if (weighed !== null) {
      title = `הסל ל${formatDeliveryDay(delivery.deliveryDate)} נשקל`;
      details.push({ text: `הסכום הסופי: ₪${weighed.toFixed(2)}. החיוב יתבצע ${CHARGED_ON_SAVED_CARD}.` });
    } else {
      title = `הסל ל${formatDeliveryDay(delivery.deliveryDate)} נסגר לעריכה`;
      details.push({ text: 'המשלוח בהכנה. החיוב יתבצע אחרי השקילה.' });
    }
  }
  const TitleIcon = icon;
  const canOpenCart = isOpenState || delivery.state === SUBSCRIBER_STATES.CLOSED;
  const recurringPath = subscription.id ? `/my-subscriptions/${subscription.id}/basket` : '/my-subscriptions';
  // The open delivery is "this delivery only" (amber); the other states keep the emerald look.
  const tone = isOpenState
    ? { section: 'border-2 border-amber-300 bg-amber-50', title: 'text-amber-950', icon: 'text-amber-700', text: 'text-amber-900' }
    : { section: 'border border-emerald-200 bg-emerald-50', title: 'text-emerald-950', icon: 'text-emerald-700', text: 'text-emerald-900' };

  return (
    <section className={`mx-1 mb-4 mt-2 rounded-xl p-3 text-right sm:p-4 [&_p]:mb-0 ${tone.section}`} dir="rtl" aria-label="המשלוח הקרוב שלי">
      {justActivated && (
        <p className="mb-2 flex items-start gap-1.5 text-sm font-semibold text-emerald-800">
          <FiCheckCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{SIGNUP_DONE}. מכאן אפשר להתאים את המשלוח הקרוב.</span>
        </p>
      )}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h2 className={`flex items-start gap-2 text-base font-bold leading-snug sm:text-lg ${tone.title}`}>
            <TitleIcon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.icon}`} aria-hidden="true" />
            <span>
              {title}
              {isOpenState && (
                <span className={`mr-2 inline-block rounded-full px-2 py-0.5 align-middle text-xs font-semibold ${DELIVERY_TONE.chip}`}>{ONE_TIME}</span>
              )}
            </span>
          </h2>
          <ul className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pr-7 text-sm ${tone.text}`}>
            {details.map(({ icon: DetailIcon, text }) => (
              <li key={text} className="flex items-center gap-1.5">
                {DetailIcon && <DetailIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {canOpenCart && (
            <button
              type="button"
              onClick={requestCartOpen}
              className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold leading-tight ${isOpenState ? DELIVERY_TONE.button : 'bg-emerald-700 text-white hover:bg-emerald-800'}`}
            >
              {isOpenState ? (
                <>
                  <span className="sm:hidden">{`צפייה בסל · ${lineCount} מוצרים · כ-₪${cartTotal.toFixed(0)}`}</span>
                  <span className="hidden sm:inline">{`${deliveryName(delivery.deliveryDate)} · ${lineCount} מוצרים · כ-₪${cartTotal.toFixed(0)}`}</span>
                </>
              ) : 'צפייה בסל'}
            </button>
          )}
          {isOpenState && (
            <Link
              to={recurringPath}
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-semibold leading-tight ${RECURRING_TONE.box} hover:bg-emerald-100`}
            >
              <FiRepeat className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="sm:hidden">
                {EDIT_RECURRING} <span className="text-xs font-normal">(לכל המשלוחים)</span>
              </span>
              <span className="hidden sm:inline">{EDIT_RECURRING_LINK}</span>
            </Link>
          )}
          {delivery.state === SUBSCRIBER_STATES.SKIPPED && (
            <Link
              to="/my-subscriptions"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              {MY_WEEKLY_BASKET}
            </Link>
          )}
        </div>
      </div>
      {isOpenState && (
        <details open={lineCount === 0 || justActivated} className="mt-2.5 rounded-lg bg-white/70 px-3 py-2 text-sm text-amber-950">
          <summary className="cursor-pointer font-semibold">איך מוסיפים למשלוח הזה?</summary>
          <p className="mt-1">
            {lineCount === 0 ? 'המשלוח ריק כרגע. ' : ''}
            {THIS_DELIVERY_ONLY}. בוחרים מוצר בחנות למטה ולוחצים "{ADD_TO_NEXT_DELIVERY}". המוצר נכנס ישר להזמנה של המשלוח הזה, ובסוף לוחצים "אישור ההזמנה".
          </p>
        </details>
      )}
    </section>
  );
};

export default SubscriberStoreBanner;
