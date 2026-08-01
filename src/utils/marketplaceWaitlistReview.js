export const MARKETPLACE_WAITLIST_STATUSES = ['new', 'approved', 'rejected'];

export const MARKETPLACE_WAITLIST_STATUS_LABELS = {
  new: 'חדש',
  approved: 'אושר',
  rejected: 'נדחה',
};

export const normalizeMarketplaceWaitlistStatus = (status) =>
  MARKETPLACE_WAITLIST_STATUSES.includes(status) ? status : 'new';

export const filterMarketplaceWaitlistEntries = (entries = [], status = 'all') => {
  if (status === 'all') return entries;
  return entries.filter(
    (entry) => normalizeMarketplaceWaitlistStatus(entry.status) === status
  );
};

export const validateMarketplaceWaitlistReview = ({ status, reviewerId } = {}) => {
  if (!MARKETPLACE_WAITLIST_STATUSES.includes(status) || status === 'new') {
    return { valid: false, message: 'יש לבחור אישור או דחייה' };
  }
  if (!String(reviewerId || '').trim()) {
    return { valid: false, message: 'חסר מזהה מנהל לביצוע הבדיקה' };
  }
  return { valid: true, message: '' };
};
