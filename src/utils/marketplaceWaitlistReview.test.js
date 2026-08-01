import {
  filterMarketplaceWaitlistEntries,
  normalizeMarketplaceWaitlistStatus,
  validateMarketplaceWaitlistReview,
} from './marketplaceWaitlistReview';

test('normalizes legacy statuses and filters review queues', () => {
  const entries = [
    { id: '1' },
    { id: '2', status: 'approved' },
    { id: '3', status: 'rejected' },
  ];
  expect(normalizeMarketplaceWaitlistStatus(undefined)).toBe('new');
  expect(filterMarketplaceWaitlistEntries(entries, 'new').map((entry) => entry.id)).toEqual(['1']);
  expect(filterMarketplaceWaitlistEntries(entries, 'approved').map((entry) => entry.id)).toEqual(['2']);
});

test('requires a final review status and authenticated reviewer', () => {
  expect(validateMarketplaceWaitlistReview({ status: 'new', reviewerId: 'admin' }).valid).toBe(false);
  expect(validateMarketplaceWaitlistReview({ status: 'approved', reviewerId: '' }).valid).toBe(false);
  expect(validateMarketplaceWaitlistReview({ status: 'rejected', reviewerId: 'admin' }).valid).toBe(true);
});
