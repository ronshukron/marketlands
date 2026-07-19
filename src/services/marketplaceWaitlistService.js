import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

export const MARKETPLACE_WAITLIST_COLLECTION = 'marketplaceWaitlist';

const MAX_FIELD_LENGTH = 200;

const cleanField = (value) => String(value || '').trim().slice(0, MAX_FIELD_LENGTH);

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
};

/**
 * Public pilot signup — no auth required. Stores a single document per submission.
 */
export const submitMarketplaceWaitlistEntry = async ({
  name = '',
  phone = '',
  email = '',
  businessKind = '',
  community = '',
} = {}) => {
  const payload = {
    name: cleanField(name),
    phone: cleanField(phone),
    email: cleanField(email).toLowerCase(),
    businessKind: cleanField(businessKind),
    community: cleanField(community),
    status: 'new',
    createdAt: serverTimestamp(),
  };

  if (!payload.name || !payload.phone) {
    throw new Error('חובה למלא שם וטלפון');
  }

  const created = await addDoc(
    collection(db, MARKETPLACE_WAITLIST_COLLECTION),
    payload
  );
  return { id: created.id, ...payload };
};

/** Admin-only listing (enforced by Firestore rules). */
export const getMarketplaceWaitlistEntries = async () => {
  const snap = await getDocs(collection(db, MARKETPLACE_WAITLIST_COLLECTION));
  return snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .sort(
      (a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)
    );
};
