import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase/firebase';
import { MARKETPLACE_COLLECTIONS, toDate } from './marketplaceService';
import {
  MARKETPLACE_VOLUNTEER_STATUS_ACTIVE,
  MARKETPLACE_VOLUNTEER_STATUS_CANCELLED,
  buildMarketplaceVolunteerCommitment,
  isMarketplaceVolunteerActive,
  normalizeMarketplaceVolunteerCommunity,
  pickActiveVolunteerForCommunity,
} from '../utils/marketplaceVolunteerUtils';

const MAX_TEXT = 500;

const cleanText = (value, max = MAX_TEXT) => String(value || '').trim().slice(0, max);

const mapVolunteerDoc = (snap) => ({ id: snap.id, ...snap.data() });

export const listMarketplacePromotionVolunteers = async (
  promotionId,
  { activeOnly = false } = {}
) => {
  if (!promotionId) return [];
  const constraints = [where('promotionId', '==', promotionId)];
  if (activeOnly) {
    constraints.push(where('status', '==', MARKETPLACE_VOLUNTEER_STATUS_ACTIVE));
  }
  const snap = await getDocs(
    query(collection(db, MARKETPLACE_COLLECTIONS.futureVolunteers), ...constraints)
  );
  return snap.docs.map(mapVolunteerDoc);
};

export const listActiveMarketplaceVolunteersForPromotion = async (
  promotionId,
  atIso = new Date().toISOString()
) => {
  const volunteers = await listMarketplacePromotionVolunteers(promotionId, { activeOnly: true });
  return volunteers.filter((volunteer) => isMarketplaceVolunteerActive(volunteer, atIso));
};

export const findActiveMarketplaceVolunteerForCommunity = async ({
  promotionId,
  community,
  atIso = new Date().toISOString(),
}) => {
  const volunteers = await listActiveMarketplaceVolunteersForPromotion(promotionId, atIso);
  return pickActiveVolunteerForCommunity(volunteers, community, atIso);
};

export const createMarketplacePromotionVolunteer = async ({
  promotion,
  volunteerData = {},
}) => {
  if (!promotion?.id || !promotion.businessId) {
    throw new Error('Missing promotion details');
  }
  if (promotion.allowVolunteerPickup !== true) {
    throw new Error('העסק לא אישר נקודות איסוף של מתנדבים בהזמנה זו');
  }

  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('יש להתחבר כדי לפתוח נקודת איסוף');
  }

  const community = normalizeMarketplaceVolunteerCommunity(volunteerData.community);
  const fullName = cleanText(volunteerData.fullName, 120);
  const phone = cleanText(volunteerData.phone, 40);
  const address = cleanText(volunteerData.address, 240);
  const locationInstructions = cleanText(volunteerData.locationInstructions, 500);

  if (!fullName || !phone || !community || !address) {
    throw new Error('שם, טלפון, קהילה וכתובת הם שדות חובה');
  }

  const existing = await findActiveMarketplaceVolunteerForCommunity({
    promotionId: promotion.id,
    community,
  });
  if (existing) {
    throw new Error('כבר קיימת נקודת איסוף פעילה של מתנדב בקהילה זו להזמנה השבועית');
  }

  const commitment = buildMarketplaceVolunteerCommitment({
    startsAt: toDate(promotion.startsAt),
    endsAt: toDate(promotion.endsAt),
    deliveryDate: promotion.deliveryDate,
  });

  const payload = {
    promotionId: promotion.id,
    businessId: promotion.businessId,
    businessName: promotion.businessName || '',
    community,
    fullName,
    phone,
    address,
    locationInstructions,
    userId,
    status: MARKETPLACE_VOLUNTEER_STATUS_ACTIVE,
    cancelled: false,
    commitment,
    volunteeredAt: new Date().toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const created = await addDoc(
    collection(db, MARKETPLACE_COLLECTIONS.futureVolunteers),
    payload
  );
  return { id: created.id, ...payload };
};

export const cancelMarketplacePromotionVolunteer = async (volunteerId) => {
  if (!volunteerId) throw new Error('Missing volunteerId');
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Authentication required');

  await updateDoc(doc(db, MARKETPLACE_COLLECTIONS.futureVolunteers, volunteerId), {
    status: MARKETPLACE_VOLUNTEER_STATUS_CANCELLED,
    cancelled: true,
    cancelledAt: new Date().toISOString(),
    cancelledBy: userId,
    updatedAt: serverTimestamp(),
  });
};
