import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import {
  FARMER_BADGE_SETTINGS_DOC_ID,
  expandFarmerBadgeSelection,
  normalizeFarmerBadgeBusinessIds,
  normalizeFarmerBadgeBusinessNames,
  resolveFarmerBadgeSelection,
} from '../utils/farmerBadgeUtils';

const farmerBadgeSettingsRef = () => doc(db, 'deliverySchedules', FARMER_BADGE_SETTINGS_DOC_ID);

export const loadFarmerBadgeSelection = async () => {
  const globalSnap = await getDoc(farmerBadgeSettingsRef());
  const globalDoc = globalSnap.exists() ? globalSnap.data() : null;

  // Saves from the admin screen store the already-expanded ids and names, so the
  // store does not need to scan every business and schedule per visitor.
  if (globalDoc?.expandedAt) {
    return {
      ids: normalizeFarmerBadgeBusinessIds(globalDoc.farmerBadgeBusinessIds),
      names: normalizeFarmerBadgeBusinessNames(globalDoc.farmerBadgeBusinessNames),
    };
  }

  const [schedulesSnap, businessesSnap] = await Promise.all([
    getDocs(collection(db, 'deliverySchedules')),
    getDocs(collection(db, 'businesses')),
  ]);

  const resolved = resolveFarmerBadgeSelection({
    globalDoc,
    communitySchedules: schedulesSnap.docs
      .filter((scheduleDoc) => scheduleDoc.id !== FARMER_BADGE_SETTINGS_DOC_ID)
      .map((scheduleDoc) => scheduleDoc.data() || {}),
  });

  return expandFarmerBadgeSelection({
    selectedIds: resolved.ids,
    selectedNames: resolved.names,
    businesses: businessesSnap.docs.map((businessDoc) => ({
      id: businessDoc.id,
      ...(businessDoc.data() || {}),
    })),
  });
};

export const loadFarmerBadgeBusinessIds = async () => {
  const selection = await loadFarmerBadgeSelection();
  return selection.ids;
};

export const saveFarmerBadgeBusinessIds = async (businessIds, businessNames = []) => {
  const farmerBadgeBusinessIds = normalizeFarmerBadgeBusinessIds(businessIds);
  const farmerBadgeBusinessNames = normalizeFarmerBadgeBusinessNames(businessNames);
  await setDoc(farmerBadgeSettingsRef(), {
    farmerBadgeBusinessIds,
    farmerBadgeBusinessNames,
    expandedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return { ids: farmerBadgeBusinessIds, names: farmerBadgeBusinessNames };
};
