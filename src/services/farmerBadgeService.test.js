jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
}));
jest.mock('../firebase/firebase', () => ({ db: {} }));

import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { loadFarmerBadgeSelection, saveFarmerBadgeBusinessIds } from './farmerBadgeService';

const snap = (data) => ({
  exists: () => data != null,
  id: '_farmerBadges',
  data: () => data,
});

describe('farmer badge reads', () => {
  beforeEach(() => {
    collection.mockImplementation((db, name) => ({ path: name }));
    doc.mockImplementation((...parts) => ({
      path: parts.filter((part) => typeof part === 'string').join('/'),
    }));
    serverTimestamp.mockReturnValue('server-time');
    getDoc.mockReset();
    getDocs.mockReset();
    setDoc.mockReset();
  });

  test('an expanded settings doc is one read and does not scan businesses or schedules', async () => {
    getDoc.mockResolvedValue(snap({
      expandedAt: { seconds: 1 },
      farmerBadgeBusinessIds: [' farm-1 ', 'farm-1', ''],
      farmerBadgeBusinessNames: [' משק א '],
    }));

    await expect(loadFarmerBadgeSelection()).resolves.toEqual({
      ids: ['farm-1'],
      names: ['משק א'],
    });
    expect(getDocs).not.toHaveBeenCalled();
  });

  test('a settings doc saved before expansion still resolves badges from the collections', async () => {
    getDoc.mockResolvedValue(snap({
      farmerBadgeBusinessIds: ['farm-1'],
      farmerBadgeBusinessNames: [],
    }));
    getDocs.mockImplementation(async (ref) => {
      if (ref.path === 'deliverySchedules') {
        return { docs: [{ id: '_farmerBadges', data: () => ({}) }] };
      }
      return {
        docs: [{
          id: 'farm-2',
          data: () => ({ businessName: 'משק א' }),
        }, {
          id: 'farm-1',
          data: () => ({ businessName: 'משק א' }),
        }],
      };
    });

    const selection = await loadFarmerBadgeSelection();
    expect(getDocs).toHaveBeenCalledTimes(2);
    expect(selection.ids).toEqual(expect.arrayContaining(['farm-1', 'farm-2']));
  });

  test('saving stores the expanded selection and marks it expanded', async () => {
    await expect(saveFarmerBadgeBusinessIds([' farm-1 ', 'farm-1'], [' משק א '])).resolves.toEqual({
      ids: ['farm-1'],
      names: ['משק א'],
    });
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'deliverySchedules/_farmerBadges' }),
      {
        farmerBadgeBusinessIds: ['farm-1'],
        farmerBadgeBusinessNames: ['משק א'],
        expandedAt: 'server-time',
        updatedAt: 'server-time',
      },
      { merge: true },
    );
  });
});
