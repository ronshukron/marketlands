import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { normalizeCampaignCode, safeCampaignTarget } from '../utils/campaignAttribution';

// Flyer / QR campaign links (campaignLinks/{code}): the admin adds them in
// /admin/campaigns; bastabasket.com/q/{code} credits the visitor and opens the
// link's target page.

export const CAMPAIGN_COLLECTION = 'campaignLinks';

export const campaignLink = (code) => `${window.location.origin}/q/${encodeURIComponent(code)}`;

export async function getCampaignLink(code) {
  const normalized = normalizeCampaignCode(code);
  if (!normalized) return null;
  const snap = await getDoc(doc(db, CAMPAIGN_COLLECTION, normalized));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listCampaignLinks() {
  const snap = await getDocs(collection(db, CAMPAIGN_COLLECTION));
  return snap.docs
    .map((linkDoc) => ({ id: linkDoc.id, ...linkDoc.data() }))
    .sort((a, b) => String(b.createdAtIso || '').localeCompare(String(a.createdAtIso || '')));
}

/**
 * Create (isNew) or update a campaign link. The code is the document id, so it
 * cannot change once printed on a flyer.
 */
export async function saveCampaignLink({ code, name, target, active, isNew }) {
  const normalized = normalizeCampaignCode(code);
  if (!normalized) throw new Error('הקוד יכול להכיל רק אותיות באנגלית, ספרות ומקף (2–40 תווים).');
  const ref = doc(db, CAMPAIGN_COLLECTION, normalized);
  if (isNew && (await getDoc(ref)).exists()) throw new Error('כבר יש קישור עם הקוד הזה.');
  const data = {
    name: String(name || '').trim().slice(0, 80) || normalized,
    target: safeCampaignTarget(target),
    active: active !== false,
    updatedAt: serverTimestamp(),
    ...(isNew ? { createdAt: serverTimestamp(), createdAtIso: new Date().toISOString() } : {}),
  };
  await setDoc(ref, data, { merge: true });
  return normalized;
}
