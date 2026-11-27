// Customer-facing words for the weekly basket, in one place so the next
// wording change is one edit. Staff screens (admin, V7/V8) keep the old word.
//
// Two things the customer can edit, each with a fixed name and colour:
// - הסל הקבוע (emerald): what every new delivery starts from.
// - המשלוח של יום ..., d.m (amber): one delivery only.
import { formatDeliveryDay } from '../../utils/subscriberStorefront';

export const WEEKLY_BASKET = 'סל שבועי';
export const MY_WEEKLY_BASKET = 'הסל השבועי שלי';
export const SUBSCRIBE_CTA = 'להירשם לסל שבועי';
export const SIGNUP_DONE = 'ההרשמה לסל השבועי הושלמה';
export const CHARGED_ON_SAVED_CARD = 'בכרטיס השמור';

export const RECURRING_BASKET = 'הסל הקבוע';
export const RECURRING_SCOPE = 'לכל המשלוחים הבאים';
export const EDIT_RECURRING = 'עריכת הסל הקבוע';
export const EDIT_RECURRING_LINK = 'לעריכת הסל הקבוע (לכל המשלוחים)';

export const ONE_TIME = 'חד-פעמי';
export const ONE_DELIVERY_SCOPE = 'חד-פעמי, למשלוח הזה בלבד';
export const THIS_DELIVERY_ONLY = 'השינויים כאן חלים על המשלוח הזה בלבד';
export const EDIT_THIS_DELIVERY = 'עריכת המשלוח הזה בלבד';
export const ADD_TO_NEXT_DELIVERY = 'הוסף למשלוח הקרוב';
export const NEXT_DELIVERY = 'המשלוח הקרוב';

export const LINE_FROM_RECURRING = 'מהסל הקבוע';

// WhatsApp reminder before orders close (functions/handlers/whatsappReminders.js).
export const WHATSAPP_OPT_IN_LABEL = 'שלחו לי תזכורת בוואטסאפ כמה שעות לפני סגירת ההזמנות';
export const WHATSAPP_OPT_IN_HINT = 'הודעה אחת לפני כל משלוח, עם קישור לעריכת הסל. אפשר להפסיק בכל רגע, גם בתשובה "הסר".';
export const WHATSAPP_ROW_LABEL = 'תזכורת בוואטסאפ לפני סגירת ההזמנות';
export const LINE_THIS_DELIVERY_ONLY = 'נוסף למשלוח הזה בלבד';
export const LINE_ALSO_IN_RECURRING = 'נוסף גם לסל הקבוע';
export const ADD_LINE_TO_RECURRING = 'להוסיף גם לסל הקבוע';

/** "המשלוח של יום רביעי, 25.11" */
export const deliveryName = (dateKey) => {
  const day = formatDeliveryDay(dateKey);
  return day ? `המשלוח של ${day}` : 'המשלוח הקרוב';
};

/** "השינוי יחול על כל המשלוחים מיום רביעי, 25.11 והלאה" */
export const recurringAppliesFrom = (dateKey) => {
  const day = formatDeliveryDay(dateKey);
  return day ? `השינוי יחול על כל המשלוחים מ${day} והלאה` : 'השינוי יחול על כל המשלוחים הבאים';
};

// Tailwind classes per target, so every screen shows the same colour for the same thing.
export const RECURRING_TONE = {
  box: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  chip: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  button: 'bg-emerald-700 text-white hover:bg-emerald-800',
  link: 'text-emerald-700',
};

export const DELIVERY_TONE = {
  box: 'border-amber-300 bg-amber-50 text-amber-950',
  chip: 'bg-amber-100 text-amber-900 border border-amber-200',
  button: 'bg-amber-600 text-white hover:bg-amber-700',
  link: 'text-amber-800',
};

// ---- Pause and resume: what happened to the delivery that was already open ----
// The server cancels a generated delivery that is still before its cutoff when
// the weekly basket is paused (so it is not picked or charged), and brings it
// back on resume while still before the cutoff. A delivery past the cutoff stays.

export const PAUSE_CONFIRM_TEXT = 'משלוח שכבר נפתח ועוד לא נסגר להזמנות יבוטל, ולא תחויבו עליו. אפשר לחדש בכל זמן.';
export const ADMIN_PAUSE_CONFIRM_TEXT = 'לא ייווצרו משלוחים חדשים עד החידוש. משלוח שכבר נוצר ועוד לא עבר את מועד הסגירה יבוטל והמלאי שלו יחזור; בחידוש לפני מועד הסגירה הוא יחזור. משלוח שכבר עבר את מועד הסגירה נשאר.';
export const ADMIN_RESUME_CONFIRM_TEXT = 'משלוח שבוטל בהשהיה יחזור אם עוד לא עבר מועד הסגירה. אחרת המשלוח הבא ייקבע לתאריך הפנוי הקרוב, וההזמנה שלו תיווצר כבר עכשיו.';

const namesOf = (orders) => (orders || []).map((order) => deliveryName(order.deliveryDate)).join(', ');

/**
 * The message after a pause, from the server's answer, or null when there was
 * no open delivery.
 * @param {Object} result {canceledOrderIds, keptOrders}
 * @param {Object} [options] {admin: boolean}
 * @return {{icon: string, title: string, text: string}|null}
 */
export const pauseOutcomeMessage = (result, { admin = false } = {}) => {
  const canceledCount = Array.isArray(result?.canceledOrderIds) ? result.canceledOrderIds.length : 0;
  const kept = Array.isArray(result?.keptOrders) ? result.keptOrders : [];
  if (kept.length > 0) {
    return {
      icon: 'warning',
      title: admin ? 'הושהה, אבל משלוח אחד נשאר' : 'הסל השבועי הושהה',
      text: admin
        ? `${namesOf(kept)} כבר עבר את מועד הסגירה ולא בוטל, ולכן הוא עדיין בסיכום השבועי ובליקוט. אם לא צריך אותו, בטלו אותו בדף ההזמנות השבועיות.`
        : `${namesOf(kept)} כבר נסגר להזמנות ויגיע כרגיל. ההשהיה תחול מהמשלוח שאחריו.`,
    };
  }
  if (canceledCount > 0) {
    return {
      icon: 'success',
      title: 'הסל השבועי הושהה',
      text: admin
        ? 'גם המשלוח הפתוח בוטל והמלאי שלו חזר. הוא לא יופיע בסיכום השבועי ובליקוט.'
        : 'גם המשלוח הקרוב בוטל, ולא תחויבו עליו. בחידוש לפני מועד הסגירה הוא יחזור.',
    };
  }
  return null;
};

/**
 * The message after a resume that brought a paused delivery back, or null.
 * @param {Object} result {restoredDeliveries}
 * @return {{icon: string, title: string, text: string}|null}
 */
export const resumeOutcomeMessage = (result) => {
  const restored = Array.isArray(result?.restoredDeliveries) ? result.restoredDeliveries : [];
  if (restored.length === 0) return null;
  const dropped = restored.flatMap((delivery) => delivery.droppedProductNames || []);
  return {
    icon: dropped.length > 0 ? 'info' : 'success',
    title: 'הסל השבועי חודש',
    text: `${namesOf(restored)} חזר.${dropped.length > 0 ? ` חלק מהמוצרים אזלו ולא נכנסו: ${dropped.join(', ')}.` : ''}`,
  };
};

/**
 * The message after switching between pickup and home delivery.
 * @param {Object} result {deliveryOption, updatedOrderIds}
 * @return {{icon: string, title: string, text: string}}
 */
export const deliveryOptionOutcomeMessage = (result) => {
  const home = result?.deliveryOption === 'homeDelivery';
  const updated = Array.isArray(result?.updatedOrderIds) && result.updatedOrderIds.length > 0;
  return {
    icon: 'success',
    title: home ? 'עברתם למשלוח עד הבית' : 'דרך הקבלה עודכנה',
    text: updated ? 'השינוי חל כבר על המשלוח הקרוב ועל כל המשלוחים הבאים.' : 'השינוי יחול מהמשלוח הבא.',
  };
};
