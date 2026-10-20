import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const COLLECTION = 'customerProfiles';

// Firestore document ids cannot contain '/'. Phone numbers are safe, but
// emails are also safe here since they never contain a slash. We still trim
// to keep keys stable across surfaces (V7 and the admin CRM).
export function getCustomerKey({ phone, email } = {}) {
  const p = (phone || '').trim();
  const e = (email || '').trim();
  return p || e || '';
}

const EMPTY_PROFILE = {
  isVip: false,
  noteHebrew: '',
  noteThai: '',
  winBackSentAt: '',
  winBackFirstSentAt: '',
  winBackSendCount: 0,
  winBackOfferSummary: '',
};

// Profiles written before the counter existed only have winBackSentAt.
function readWinBackSendCount(data) {
  const count = Number(data?.winBackSendCount);
  if (Number.isFinite(count) && count > 0) return Math.floor(count);
  return data?.winBackSentAt ? 1 : 0;
}

function normalizeProfile(data) {
  if (!data) return { ...EMPTY_PROFILE };
  return {
    isVip: data.isVip === true,
    noteHebrew: data.noteHebrew || '',
    noteThai: data.noteThai || '',
    winBackSentAt: data.winBackSentAt || '',
    winBackFirstSentAt: data.winBackFirstSentAt || data.winBackSentAt || '',
    winBackSendCount: readWinBackSendCount(data),
    winBackOfferSummary: data.winBackOfferSummary || '',
  };
}

/**
 * Fetch a single customer profile by key (phone || email).
 * Returns a normalized profile object (never null).
 */
export async function getCustomerProfile(key) {
  const id = (key || '').trim();
  if (!id) return { ...EMPTY_PROFILE };
  try {
    const snap = await getDoc(doc(db, COLLECTION, id));
    return snap.exists() ? normalizeProfile(snap.data()) : { ...EMPTY_PROFILE };
  } catch (error) {
    console.error('Failed to fetch customer profile:', error);
    return { ...EMPTY_PROFILE };
  }
}

/**
 * Batch-fetch customer profiles for a list of keys (phone || email).
 * Returns a map of key -> normalized profile. Only keys that have a stored
 * profile are included in the map.
 */
export async function getCustomerProfiles(keys = []) {
  const uniqueKeys = Array.from(new Set((keys || []).map((k) => (k || '').trim()).filter(Boolean)));
  const map = {};
  if (uniqueKeys.length === 0) return map;
  await Promise.all(uniqueKeys.map(async (id) => {
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (snap.exists()) map[id] = normalizeProfile(snap.data());
    } catch (error) {
      console.error('Failed to fetch customer profile for', id, error);
    }
  }));
  return map;
}

/**
 * Create or update a customer profile.
 * Keyed by phone || email so it lines up with how V7 identifies customers.
 */
export async function setCustomerProfile(key, { isVip, noteHebrew, noteThai } = {}) {
  const id = (key || '').trim();
  if (!id) throw new Error('Missing customer key');
  await setDoc(
    doc(db, COLLECTION, id),
    {
      isVip: isVip === true,
      noteHebrew: noteHebrew || '',
      noteThai: noteThai || '',
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  return {
    isVip: isVip === true,
    noteHebrew: noteHebrew || '',
    noteThai: noteThai || '',
  };
}

/**
 * Record a win-back WhatsApp outreach without touching VIP or notes.
 * Merge-only so an existing profile is not replaced.
 */
export async function markCustomerWinBackSent(key, { offerSummary = '', sentAt } = {}) {
  const id = (key || '').trim();
  if (!id) throw new Error('Missing customer key');
  const winBackSentAt = sentAt || new Date().toISOString();
  const winBackOfferSummary = String(offerSummary || '').trim();
  const ref = doc(db, COLLECTION, id);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const existing = snap.exists() ? snap.data() : null;
    const winBackSendCount = readWinBackSendCount(existing) + 1;
    const winBackFirstSentAt = existing?.winBackFirstSentAt || existing?.winBackSentAt || winBackSentAt;
    transaction.set(
      ref,
      {
        winBackSentAt,
        winBackFirstSentAt,
        winBackSendCount,
        winBackOfferSummary,
        updatedAt: winBackSentAt,
      },
      { merge: true }
    );
    return { winBackSentAt, winBackFirstSentAt, winBackSendCount, winBackOfferSummary };
  });
}
