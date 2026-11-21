import axios from 'axios';
import { getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { functionsEndpoint } from '../utils/functionsClient';

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
  SUBSCRIPTIONS_NOT_OPEN: 'ההרשמה למנויים עוד לא נפתחה. נעדכן ממש בקרוב',
  CUSTOMER_DETAILS_REQUIRED: 'יש למלא שם וטלפון',
  BASKET_UNAVAILABLE: 'הסל אינו זמין כרגע',
  COMMUNITY_UNAVAILABLE: 'היישוב אינו זמין',
  BASKET_NOT_IN_COMMUNITY: 'הסל אינו זמין ביישוב שנבחר',
  DELIVERY_OPTION_UNAVAILABLE: 'אפשרות המשלוח אינה זמינה ביישוב',
  ADDRESS_REQUIRED: 'יש למלא כתובת למשלוח עד הבית',
  NO_DELIVERY_SCHEDULE: 'אין ליישוב לוח משלוחים קבוע',
  DELIVERY_DATE_UNAVAILABLE: 'תאריך המשלוח כבר לא זמין, בחרו תאריך אחר',
  ALREADY_SUBSCRIBED: 'כבר יש לך מנוי לסל הזה',
  PAYMENT_PAGE_FAILED: 'פתיחת עמוד התשלום נכשלה, נסו שוב',
  PAYMENT_PROVIDER_UNAVAILABLE: 'ספק התשלום אינו זמין כרגע, נסו שוב בעוד כמה דקות',
  NOT_ACTIVE: 'המנוי אינו פעיל',
  NOT_PAUSED: 'המנוי אינו מושהה',
  NO_CARD: 'אין כרטיס שמור למנוי',
  NO_DELIVERY_DATE: 'לא נמצא תאריך משלוח פנוי',
  INVALID_DATE: 'תאריך לא תקין',
  TOO_LATE_TO_SKIP: 'מועד העריכה של משלוח זה עבר',
  CANCELED: 'המנוי בוטל',
  ORDER_LOCKED: 'ההזמנה כבר בטיפול ולא ניתן לערוך אותה',
  FORM_CLOSED: 'ההזמנה מהחקלאי נסגרה, אי אפשר להוסיף את המוצר',
  OUT_OF_STOCK: 'אין מספיק מלאי',
  PRODUCT_MISSING: 'המוצר לא נמצא',
  NO_ITEMS: 'לא נבחרו מוצרים',
  NOT_FOUND: 'לא נמצא',
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
