const mockBatch = { set: jest.fn(), commit: jest.fn(async () => {}) };

jest.mock('firebase/firestore', () => ({
  doc: (_db, collection, id) => ({ collection, id }),
  writeBatch: () => mockBatch,
}));
jest.mock('../../../../firebase/firebase', () => ({ db: {} }));
jest.mock('../../../../services/pickupSpotsService', () => ({
  resolveCommunityName: (name) => (name === 'alias-X' ? 'X' : name),
}));
jest.mock('sweetalert2', () => ({ fire: jest.fn() }));

import { saveDeliveryGroupForCommunitiesV8 } from './communityGroupsV8';

beforeEach(() => {
  mockBatch.set.mockClear();
  mockBatch.commit.mockClear();
});

test('writes nothing when the selection is empty or blank', async () => {
  expect(await saveDeliveryGroupForCommunitiesV8([], 'משלוח ראשון')).toBe(0);
  expect(await saveDeliveryGroupForCommunitiesV8(['', '  ', null], 'משלוח ראשון')).toBe(0);
  expect(mockBatch.commit).not.toHaveBeenCalled();
});

test('dedupes aliases and trims the group name', async () => {
  const count = await saveDeliveryGroupForCommunitiesV8(['X', 'alias-X', ' Y '], '  משלוח ראשון  ');
  expect(count).toBe(2);
  expect(mockBatch.set).toHaveBeenCalledTimes(2);
  expect(mockBatch.set.mock.calls.map((call) => call[0].id).sort()).toEqual(['X', 'Y']);
  expect(mockBatch.set.mock.calls[0][1]).toEqual(expect.objectContaining({ deliveryGroup: 'משלוח ראשון' }));
  expect(mockBatch.commit).toHaveBeenCalledTimes(1);
});
