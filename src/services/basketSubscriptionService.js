import axios from 'axios';
import { getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { functionsEndpoint } from '../utils/functionsClient';
import { getDeliveryScheduleDocumentKeys } from '../utils/deliveryScheduleUtils';
import { initialRecurringLines, toRecurringPayload, withRecurringLine } from '../utils/recurringBasket';

export const BASKET_SUBSCRIPTIONS_COLLECTION = 'basketSubscriptions';

export const SUBSCRIPTION_STATUS_LABELS = {
  pending_card: 'ממתין לשמירת כרטיס',
  active: 'פעיל',
  paused: 'מושהה',
  payment_failed: 'החיוב נכשל - יש לעדכן כרטיס',
  canceled: 'בוטל',
};

export const FREQUENCY_LABELS = {
  weekly: 'כל שבוע',
  biweekly: 'כל שבועיים',
};

// Must match CARD_CONSENT_VERSION / CARD_CONSENT_TEXT in functions/utils/subscriptionConsent.js.
// The server also accepts the previous version, so deploy functions before hosting.
export const CARD_CONSENT_VERSION = '2026-11-21.2';
export const CARD_CONSENT_TEXT =
  'אני מאשר/ת שפרטי כרטיס האשראי שלי יישמרו אצל חברת הסליקה Grow לצורך חיובים עתידיים, '
  + 'ושבסטה בסקט תחייב את הכרטיס בכל משלוח של המנוי לפי המוצרים שנשקלו בפועל ודמי המשלוח, עד שאבטל את המנוי.';

export const cardConsentPayload = () => ({
  cardSaveConsent: true,
  cardSaveConsentVersion: CARD_CONSENT_VERSION,
});

const ERROR_MESSAGES = {
  UNAUTHENTICATED: 'יש להתחבר כדי להמשיך',
  CARD_CONSENT_REQUIRED: 'יש לאשר את שמירת פרטי הכרטיס לחיובים עתידיים',
  PHONE_NOT_VERIFIED: 'יש לאמת את מספר הטלפון לפני ההרשמה לסל שבועי',
  SUBSCRIPTIONS_NOT_OPEN: 'ההרשמה לסל שבועי עוד לא נפתחה. נעדכן ממש בקרוב',
  CUSTOMER_DETAILS_REQUIRED: 'יש למלא שם וטלפון',
  BASKET_UNAVAILABLE: 'הסל אינו זמין כרגע',
  COMMUNITY_UNAVAILABLE: 'היישוב אינו זמין',
  BASKET_NOT_IN_COMMUNITY: 'הסל אינו זמין ביישוב שנבחר',
  INVALID_REQUEST: 'הבקשה אינה תקינה',
  DELIVERY_OPTION_UNAVAILABLE: 'אפשרות המשלוח אינה זמינה ביישוב',
  ADDRESS_REQUIRED: 'יש למלא כתובת למשלוח עד הבית',
  NO_DELIVERY_SCHEDULE: 'אין ליישוב לוח משלוחים קבוע',
  DELIVERY_DATE_UNAVAILABLE: 'תאריך המשלוח כבר לא זמין, בחרו תאריך אחר',
  ALREADY_SUBSCRIBED: 'כבר נרשמת לסל הזה',
  PAYMENT_PAGE_FAILED: 'פתיחת עמוד התשלום נכשלה, נסו שוב',
  PAYMENT_PROVIDER_UNAVAILABLE: 'ספק התשלום אינו זמין כרגע, נסו שוב בעוד כמה דקות',
  NOT_ACTIVE: 'הסל השבועי אינו פעיל',
  NOT_PAUSED: 'הסל השבועי אינו מושהה',
  DELIVERY_OPTION_UNAVAILABLE: 'דרך הקבלה הזו לא זמינה ביישוב של הסל השבועי',
  ADDRESS_REQUIRED: 'כדי לקבל משלוח עד הבית צריך למלא כתובת',
  NO_CARD: 'אין כרטיס שמור לסל השבועי',
  NO_DELIVERY_DATE: 'לא נמצא תאריך משלוח פנוי',
  INVALID_DATE: 'תאריך לא תקין',
  TOO_LATE_TO_SKIP: 'מועד העריכה של משלוח זה עבר',
  TOO_LATE_TO_RESTORE: 'מועד העריכה של משלוח זה עבר, ולכן אי אפשר להחזיר אותו',
  CANNOT_RESTORE: 'את המשלוח הזה אי אפשר להחזיר',
  ITEMS_SOLD_OUT: 'כל המוצרים של המשלוח הזה אזלו בינתיים, ולכן אי אפשר להחזיר אותו',
  CANCELED: 'ההרשמה לסל השבועי בוטלה',
  ORDER_LOCKED: 'ההזמנה כבר בטיפול ולא ניתן לערוך אותה',
  FORM_CLOSED: 'ההזמנה מהחקלאי נסגרה, אי אפשר להוסיף את המוצר',
  OUT_OF_STOCK: 'אין מספיק מלאי',
  PRODUCT_MISSING: 'המוצר לא נמצא',
  NO_ITEMS: 'לא נבחרו מוצרים',
  NOT_FOUND: 'לא נמצא',
  INVALID_QUANTITY: 'הכמות אינה תקינה',
  ORDER_CHANGED: 'ההזמנה התעדכנה בינתיים, נסו שוב',
  EMPTY_BASKET: 'הסל צריך לכלול לפחות מוצר אחד',
  TOO_MANY_LINES: 'יש יותר מדי מוצרים בסל הקבוע',
  DUPLICATE_LINE: 'מוצר מופיע פעמיים בסל',
  NO_UPCOMING_ORDER: 'הסל למשלוח הקרוב עוד לא נפתח לעריכה',
  DELIVERY_SKIPPED: 'דילגתם על המשלוח הזה',
  ORDER_CLOSED: 'המשלוח הקרוב כבר נסגר לעריכה',
  CUSTOMER_ONLY: 'רק הלקוח יכול לשמור או להחליף כרטיס, כי זה דורש את האישור שלו',
  UNKNOWN_ACTION: 'פעולה לא מוכרת',
  BAD_PHONE: 'מספר הטלפון בסל השבועי אינו מספר נייד ישראלי, ולכן אי אפשר לשלוח אליו וואטסאפ',
  NO_ADMIN_PHONE: 'בחשבון האדמין אין מספר נייד, ולכן אין לאן לשלוח הודעת בדיקה',
};

export const describeSubscriptionError = (error) => {
  const code = error?.response?.data?.error || error?.code || '';
  return ERROR_MESSAGES[code] || error?.message || 'הפעולה נכשלה';
};

async function postAuthed(name, payload) {
  const user = getAuth().currentUser;
  if (!user) {
    const error = new Error(ERROR_MESSAGES.UNAUTHENTICATED);
    error.code = 'UNAUTHENTICATED';
    throw error;
  }
  const token = await user.getIdToken();
  const { data } = await axios.post(functionsEndpoint(name), payload, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 45000,
  });
  return data;
}

export const createBasketSubscription = (payload) => postAuthed('createBasketSubscription', {
  ...payload,
  returnOrigin: window.location.origin,
});

export const confirmBasketSubscriptionCard = (subscriptionId) => postAuthed(
  'confirmBasketSubscriptionCard',
  { subscriptionId },
);

export const updateBasketSubscription = (subscriptionId, action, extra = {}) => postAuthed(
  'updateBasketSubscription',
  { subscriptionId, action, returnOrigin: window.location.origin, ...extra },
);

export const listSubscriptionAddableProducts = (orderId) => postAuthed(
  'listSubscriptionAddableProducts',
  { orderId },
);

export const addSubscriptionOrderItems = (orderId, items) => postAuthed(
  'addSubscriptionOrderItems',
  { orderId, items },
);

// Sets how much of one product the upcoming delivery holds (0 removes it).
export const setSubscriptionOrderItem = ({ orderId, productId, formId = '', selectedOption = '', quantity }) => postAuthed(
  'setSubscriptionOrderItem',
  { orderId, productId, formId, selectedOption, quantity },
);

// Saves the customer's own recurring basket; only orders created later use it.
export const updateRecurringBasket = (subscriptionId, lines) => postAuthed(
  'updateRecurringBasket',
  { subscriptionId, lines },
);

// Asks the server to rebuild this customer's subscriberStatus record.
export const syncMySubscriberStatus = () => postAuthed('syncMySubscriberStatus', {});

export const listRecurringBasketProducts = (subscriptionId) => postAuthed(
  'listRecurringBasketProducts',
  { subscriptionId },
);

// The same list on the signup page, before the subscription exists.
export const listSignupBasketProducts = ({ basketId, community, firstDeliveryDate = '' }) => postAuthed(
  'listRecurringBasketProducts',
  { basketId, community, firstDeliveryDate },
);

/** Name, picture and price of products, for the basket editors. */
export async function loadProductsInfo(productIds) {
  const ids = [...new Set((productIds || []).filter(Boolean))];
  const entries = await Promise.all(ids.map(async (productId) => {
    try {
      const snap = await getDoc(doc(db, 'Products', productId));
      return [productId, snap.exists() ? snap.data() : null];
    } catch {
      return [productId, null];
    }
  }));
  return Object.fromEntries(entries.filter(([, data]) => data).map(([productId, data]) => [productId, data]));
}

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export async function listMySubscriptions(userId) {
  if (!userId) return [];
  const snap = await getDocs(query(
    collection(db, BASKET_SUBSCRIPTIONS_COLLECTION),
    where('userId', '==', userId),
  ));
  return snap.docs
    .map((subDoc) => ({ id: subDoc.id, ...subDoc.data() }))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

/** Every subscription, newest first (admins only; Firestore rules enforce it). */
export async function listAllSubscriptions() {
  const snap = await getDocs(collection(db, BASKET_SUBSCRIPTIONS_COLLECTION));
  return snap.docs
    .map((subDoc) => ({ id: subDoc.id, ...subDoc.data() }))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function getMySubscription(subscriptionId) {
  if (!subscriptionId) return null;
  const snap = await getDoc(doc(db, BASKET_SUBSCRIPTIONS_COLLECTION, subscriptionId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Generated deliveries of a subscription that the customer can still see. */
export async function listSubscriptionOrders(subscription) {
  const orderIds = Array.isArray(subscription?.orderIds) ? subscription.orderIds.slice(-6) : [];
  const snaps = await Promise.all(orderIds.map((orderId) => (
    getDoc(doc(db, 'customerOrdersDelayed', orderId)).catch(() => null)
  )));
  return snaps
    .filter((snap) => snap?.exists())
    .map((snap) => ({ id: snap.id, ...snap.data() }))
    .sort((a, b) => String(b.deliveryDate || '').localeCompare(String(a.deliveryDate || '')));
}

/**
 * The community's delivery schedule (deliverySchedules doc), or null. Read only;
 * used to show editing deadlines. The server decides what is still editable.
 */
export async function loadCommunitySchedule(community) {
  if (!community) return null;
  for (const key of getDeliveryScheduleDocumentKeys(community)) {
    try {
      const snap = await getDoc(doc(db, 'deliverySchedules', key));
      if (snap.exists()) return snap.data();
    } catch {
      // Unreadable: the deadline is not shown.
    }
  }
  return null;
}

/**
 * Add one product of this week's delivery to the customer's recurring basket.
 * Starts from the current recurring lines (the customer's own, else the admin
 * basket's) so nothing else changes.
 * @return {Promise<{alreadyThere: boolean}>}
 */
export async function addProductToRecurringBasket(subscription, product) {
  const personal = Array.isArray(subscription?.recurringLines) ? subscription.recurringLines : [];
  let basket = null;
  if (personal.length === 0 && subscription?.basketId) {
    const snap = await getDoc(doc(db, 'subscriptionBaskets', subscription.basketId));
    basket = snap.exists() ? snap.data() : null;
  }
  const { lines } = initialRecurringLines(subscription, basket);
  const next = withRecurringLine(lines, product);
  if (next.alreadyThere) return { alreadyThere: true };
  await updateRecurringBasket(subscription.id, toRecurringPayload(next.lines));
  return { alreadyThere: false };
}

// ---- WhatsApp reminder before orders close (functions/handlers/whatsappReminders.js) ----

export const NOTIFICATION_CONFIG_DEFAULTS = Object.freeze({
  basketReminderEnabled: true,
  basketReminderHoursBeforeCutoff: 4,
  quietHoursStart: 21,
  quietHoursEnd: 8,
});

/** settings/notificationConfig, with the server's defaults for missing fields. */
export async function loadNotificationConfig() {
  const snap = await getDoc(doc(db, 'settings', 'notificationConfig'));
  return { ...NOTIFICATION_CONFIG_DEFAULTS, ...(snap.exists() ? snap.data() : {}) };
}

/** Admin only (rules): enabled and lead time. Quiet hours stay as they are. */
export async function saveNotificationConfig({ basketReminderEnabled, basketReminderHoursBeforeCutoff }) {
  const hours = Math.min(72, Math.max(1, Math.round(Number(basketReminderHoursBeforeCutoff) || 4)));
  await setDoc(doc(db, 'settings', 'notificationConfig'), {
    basketReminderEnabled: basketReminderEnabled === true,
    basketReminderHoursBeforeCutoff: hours,
  }, { merge: true });
  return hours;
}

/** Admin: sends the reminder template to the admin's own phone (or records a dry run). */
export const sendWhatsappTest = () => postAuthed('sendWhatsappTest', {});

/**
 * The reminder messages of a subscription's recent deliveries, newest first
 * (whatsappMessages/basket_reminder_{orderId}; admin read only).
 */
export async function listReminderMessages(subscription) {
  const orderIds = Array.isArray(subscription?.orderIds) ? subscription.orderIds.slice(-4) : [];
  const snaps = await Promise.all(orderIds.map((orderId) => (
    getDoc(doc(db, 'whatsappMessages', `basket_reminder_${orderId}`)).catch(() => null)
  )));
  return snaps
    .filter((snap) => snap?.exists())
    .map((snap) => ({ id: snap.id, ...snap.data() }))
    .sort((a, b) => String(b.orderId || '').localeCompare(String(a.orderId || '')));
}
