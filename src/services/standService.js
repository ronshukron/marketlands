import axios from 'axios';
import { getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { functionsEndpoint } from '../utils/functionsClient';

// The leftovers stand ("בסטה ליד הבית"): the public page /stand/{standId} and
// the admin page /admin/stands. Server side: functions/handlers/standOrders.js.

export const STAND_ERROR_MESSAGES = {
  STAND_CLOSED: 'הבסטה סגורה כרגע.',
  BAD_NAME: 'צריך שם מלא (לפחות 2 אותיות).',
  BAD_PHONE: 'צריך מספר נייד ישראלי (05...).',
  BAD_EMAIL: 'כתובת האימייל לא תקינה.',
  EMPTY: 'עוד לא בחרתם מוצרים.',
  UNKNOWN_PRODUCT: 'אחד המוצרים כבר לא בבסטה. רעננו את הדף.',
  DUPLICATE_LINE: 'מוצר מופיע פעמיים.',
  BAD_QUANTITY: 'אחת הכמויות לא תקינה.',
  TOTAL_TOO_LOW: 'הסכום נמוך מדי לתשלום בכרטיס.',
  TOTAL_TOO_HIGH: 'הסכום גבוה מדי. פנו אלינו.',
  PAYMENT_PAGE_FAILED: 'לא הצלחנו לפתוח את דף התשלום. נסו שוב.',
  NOT_HELD: 'ההזמנה לא ממתינה לחיוב.',
  NOT_CANCELABLE: 'אי אפשר לבטל את ההזמנה הזו.',
  AMOUNT_OUT_OF_RANGE: 'הסכום חייב להיות גדול מאפס ולא יותר מהסכום שאושר בכרטיס.',
  NO_TRANSACTION: 'אין אישור מחברת האשראי להזמנה הזו.',
  CHARGE_FAILED: 'החיוב נכשל. ההזמנה חזרה להמתנה.',
  ADMIN_ONLY: 'רק אדמין.',
};

export const describeStandError = (error) => {
  const code = error?.response?.data?.error;
  return STAND_ERROR_MESSAGES[code] || error?.message || 'הפעולה נכשלה';
};

export const STAND_STATUS_LABELS = {
  pending_payment: 'לא השלים תשלום',
  held: 'ממתין לאישור וחיוב',
  settling: 'בחיוב…',
  completed: 'חויב',
  canceled: 'בוטל',
  failed: 'נכשל',
};

const post = async (name, body, { authed = false } = {}) => {
  const headers = {};
  if (authed) {
    const user = getAuth().currentUser;
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }
  const { data } = await axios.post(functionsEndpoint(name), body, { headers, timeout: 30000 });
  return data;
};

export const listStandProducts = (standId) => post('listStandProducts', { standId });

export const createStandCheckout = ({ standId, items, customer }) => post('createStandCheckout', {
  standId,
  items,
  customer,
  returnOrigin: window.location.origin,
});

export const getStandOrderStatus = (orderId) => post('getStandOrderStatus', { orderId });

export const settleStandOrder = (orderId, action, amount = null) => post(
  'settleStandOrder',
  { orderId, action, ...(amount != null ? { amount } : {}) },
  { authed: true },
);

export const DEFAULT_STAND_SLUG = 'home';

/** The stand's address in the link: lowercase English letters, digits and dashes. */
export const normalizeStandSlug = (value) => {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(slug) ? slug : '';
};

export const standLink = (standId) => `${window.location.origin}/stand/${encodeURIComponent(standId)}`;

export async function listStands() {
  const snap = await getDocs(collection(db, 'stands'));
  return snap.docs.map((standDoc) => ({ id: standDoc.id, ...standDoc.data() }));
}

export async function saveStand(stand) {
  const data = {
    name: String(stand.name || '').trim().slice(0, 80) || 'בסטה ליד הבית',
    community: String(stand.community || '').trim(),
    discountPercent: Math.min(90, Math.max(0, Math.round(Number(stand.discountPercent) || 0))),
    active: stand.active === true,
    note: String(stand.note || '').trim().slice(0, 300),
    updatedAt: serverTimestamp(),
  };
  if (stand.id) {
    await setDoc(doc(db, 'stands', stand.id), data, { merge: true });
    return stand.id;
  }
  // A new stand gets the address the owner chose (bastabasket.com/stand/home),
  // so the QR sign can be printed before the stand exists.
  const slug = normalizeStandSlug(stand.slug);
  if (!slug) throw new Error('הכתובת יכולה להכיל רק אותיות באנגלית, ספרות ומקף (2–40 תווים).');
  const ref = doc(db, 'stands', slug);
  if ((await getDoc(ref)).exists()) throw new Error('יש כבר בסטה בכתובת הזו.');
  await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  return slug;
}

/** Live list of the latest stand orders (admin). Returns unsubscribe. */
export const watchStandOrders = (onChange, onError) => onSnapshot(
  query(collection(db, 'standOrders'), orderBy('createdAt', 'desc'), limit(100)),
  (snap) => onChange(snap.docs.map((orderDoc) => ({ id: orderDoc.id, ...orderDoc.data() }))),
  onError,
);
