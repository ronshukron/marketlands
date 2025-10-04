import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase/firebase';

function nowIso() {
  return new Date().toISOString();
}

function isActive(vol, atIso, requiredEndIso) {
  if (!vol || vol.cancelled === true) return false;
  const start = vol.commitment?.startAt;
  const end = vol.commitment?.endAt;
  if (!start || !end) return false;
  const endCheck = requiredEndIso || atIso;
  return start <= atIso && end >= endCheck;
}

export async function isVolunteerAvailableForCommunity({ businessId, community, atIso = nowIso(), orderId, orderEndingIso }) {
  try {
    if (!businessId || !community) return false;

    const endCheckIso = orderEndingIso || atIso;
    // Primary: business-level commitments for this community
    const q1 = query(
      collection(db, 'volunteers'),
      where('businessId', '==', businessId),
      where('community', '==', community),
      where('commitment.startAt', '<=', atIso),
      where('commitment.endAt', '>=', endCheckIso),
      limit(5)
    );
    const snap1 = await getDocs(q1);
    for (const d of snap1.docs) {
      const v = d.data();
      if (isActive(v, atIso, endCheckIso)) return true;
    }


  } catch (e) {
    console.warn('isVolunteerAvailableForCommunity error', e);
  }
  return false;
}

export async function isAnyVolunteerAvailable({ businessId, atIso = nowIso(), requiredEndIso }) {
  try {
    if (!businessId) return false;
    const endCheckIso = requiredEndIso || atIso;
    const q = query(
      collection(db, 'volunteers'),
      where('businessId', '==', businessId),
      where('commitment.startAt', '<=', atIso),
      where('commitment.endAt', '>=', endCheckIso),
      limit(1)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const v = d.data();
      if (isActive(v, atIso, endCheckIso)) return true;
    }
  } catch (e) {
    console.warn('isAnyVolunteerAvailable error', e);
  }
  return false;
}
