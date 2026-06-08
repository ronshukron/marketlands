import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const CONFIG_PATH = 'settings/referralConfig';

export async function getReferralConfig() {
  const snap = await getDoc(doc(db, CONFIG_PATH));
  if (!snap.exists()) {
    return { mode: 'community', personalRewardPercent: 5, personalRewardFixed: 0 };
  }
  return snap.data();
}

export async function saveReferralConfig(config) {
  await setDoc(doc(db, CONFIG_PATH), {
    ...config,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

function generateCode(uid) {
  return String(uid || '').slice(0, 6).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export async function getOrCreateReferralCode(uid) {
  if (!uid) return null;
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists() && userSnap.data()?.referralCode) {
    return userSnap.data().referralCode;
  }
  const code = generateCode(uid);
  await setDoc(userRef, { referralCode: code }, { merge: true });
  await setDoc(doc(db, 'referrals', code), {
    ownerUid: uid,
    createdAt: new Date().toISOString(),
    uses: [],
  }, { merge: true });
  return code;
}

export async function resolveReferralOwner(refCode) {
  if (!refCode) return null;
  const snap = await getDoc(doc(db, 'referrals', refCode));
  if (!snap.exists()) return null;
  return snap.data();
}

export async function recordReferralUse({ refCode, orderId, buyerUid, rewardAmount = 0 }) {
  if (!refCode || !orderId) return;
  const ref = doc(db, 'referrals', refCode);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const uses = Array.isArray(data.uses) ? data.uses : [];
  if (uses.some((u) => u.orderId === orderId)) return;
  await updateDoc(ref, {
    uses: [...uses, { orderId, buyerUid, rewardAmount, usedAt: new Date().toISOString() }],
  });
  if (data.ownerUid && rewardAmount > 0) {
    const creditRef = doc(db, 'referralCredits', data.ownerUid);
    const creditSnap = await getDoc(creditRef);
    const balance = Number(creditSnap.data()?.balance || 0) + rewardAmount;
    await setDoc(creditRef, { balance, updatedAt: new Date().toISOString() }, { merge: true });
  }
}

export async function getReferralCreditBalance(uid) {
  if (!uid) return 0;
  const snap = await getDoc(doc(db, 'referralCredits', uid));
  return Number(snap.data()?.balance || 0);
}

export function persistReferralCodeFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) localStorage.setItem('referralCode', ref.trim());
  } catch {
    // ignore
  }
}

export function getStoredReferralCode() {
  try {
    return localStorage.getItem('referralCode') || '';
  } catch {
    return '';
  }
}

export async function findUserByReferralCode(code) {
  const q = query(collection(db, 'users'), where('referralCode', '==', code));
  const snap = await getDocs(q);
  return snap.docs[0]?.data() || null;
}
