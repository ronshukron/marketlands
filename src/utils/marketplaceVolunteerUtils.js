import { resolveMarketplaceCommunityName } from './marketplaceCommunityIdentity';

export const MARKETPLACE_VOLUNTEER_STATUS_ACTIVE = 'active';
export const MARKETPLACE_VOLUNTEER_STATUS_CANCELLED = 'cancelled';

export const FULFILLMENT_METHOD_VOLUNTEER_PICKUP = 'volunteer_pickup';

export const FULFILLMENT_LABEL_BUSINESS_PICKUP = 'איסוף עצמי מהבסטה';
export const FULFILLMENT_LABEL_VOLUNTEER_PICKUP = 'איסוף מנקודת מתנדב';
export const FULFILLMENT_LABEL_DELIVERY = 'משלוח לקהילה';

export const getFulfillmentMethodLabel = (method, fallback = '') => {
  if (method === 'pickup') return FULFILLMENT_LABEL_BUSINESS_PICKUP;
  if (method === FULFILLMENT_METHOD_VOLUNTEER_PICKUP) return FULFILLMENT_LABEL_VOLUNTEER_PICKUP;
  if (method === 'delivery') return FULFILLMENT_LABEL_DELIVERY;
  return fallback || '';
};

export const isMarketplaceVolunteerActive = (volunteer, atIso = new Date().toISOString()) => {
  if (!volunteer || volunteer.cancelled === true) return false;
  if (volunteer.status && volunteer.status !== MARKETPLACE_VOLUNTEER_STATUS_ACTIVE) return false;
  const start = volunteer.commitment?.startAt;
  const end = volunteer.commitment?.endAt;
  if (!start || !end) return false;
  return start <= atIso && end >= atIso;
};

export const buildMarketplaceVolunteerCommitment = ({
  startsAt,
  endsAt,
  deliveryDate,
  now = new Date(),
}) => {
  const startDate = startsAt ? new Date(startsAt) : now;
  const endCandidates = [endsAt, deliveryDate]
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
  const endDate =
    endCandidates.length > 0
      ? new Date(Math.max(...endCandidates.map((date) => date.getTime())))
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (endDate < now) {
    endDate.setTime(now.getTime() + 24 * 60 * 60 * 1000);
  }

  return {
    type: 'promotion_window',
    startAt: (startDate < now ? now : startDate).toISOString(),
    endAt: endDate.toISOString(),
  };
};

export const normalizeMarketplaceVolunteerCommunity = (community) =>
  resolveMarketplaceCommunityName(community);

export const pickActiveVolunteerForCommunity = (volunteers = [], community, atIso) => {
  const canonical = normalizeMarketplaceVolunteerCommunity(community);
  if (!canonical) return null;
  return (
    volunteers.find(
      (volunteer) =>
        normalizeMarketplaceVolunteerCommunity(volunteer.community) === canonical &&
        isMarketplaceVolunteerActive(volunteer, atIso)
    ) || null
  );
};

export const summarizeVolunteerPickupPoint = (volunteer) => {
  if (!volunteer) return '';
  const parts = [
    volunteer.fullName,
    volunteer.community,
    volunteer.address,
    volunteer.locationInstructions,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return parts.join(' · ');
};
