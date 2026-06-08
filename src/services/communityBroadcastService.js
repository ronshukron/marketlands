import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { DEFAULT_BROADCAST_TEMPLATE } from '../utils/communityBroadcastMessage';

const CONFIG_PATH = 'settings/communityBroadcast';

export async function loadCommunityBroadcastTemplate() {
  try {
    const snap = await getDoc(doc(db, CONFIG_PATH));
    if (!snap.exists()) {
      return { ...DEFAULT_BROADCAST_TEMPLATE };
    }
    return {
      ...DEFAULT_BROADCAST_TEMPLATE,
      ...snap.data(),
    };
  } catch (error) {
    console.error('Failed to load community broadcast template:', error);
    return { ...DEFAULT_BROADCAST_TEMPLATE };
  }
}

export async function saveCommunityBroadcastTemplate(template) {
  await setDoc(doc(db, CONFIG_PATH), {
    intro: String(template.intro || '').trim(),
    productsBody: String(template.productsBody || '').trim(),
    linkLabel: String(template.linkLabel || DEFAULT_BROADCAST_TEMPLATE.linkLabel).trim(),
    siteBaseUrl: String(template.siteBaseUrl || DEFAULT_BROADCAST_TEMPLATE.siteBaseUrl).trim(),
    category: String(template.category || DEFAULT_BROADCAST_TEMPLATE.category).trim(),
    defaultDeliveryNote: String(template.defaultDeliveryNote || '').trim(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}
