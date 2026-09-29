jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...args) => ({ type: 'collection', args })),
  deleteDoc: jest.fn(),
  doc: jest.fn((...args) => ({ type: 'doc', args })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(() => jest.fn()),
  query: jest.fn((...args) => ({ type: 'query', args })),
  setDoc: jest.fn(),
  where: jest.fn((...args) => ({ type: 'where', args })),
  writeBatch: jest.fn(),
}));

jest.mock('../firebase/firebase', () => ({
  db: { name: 'test-db' },
  auth: { currentUser: { uid: 'rfHOLhNoJOW8ByNypCtm3hlSNKs2' } },
}));

import { doc, getDoc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import {
  getPickupSpotsSync,
  invalidatePickupSpotsCache,
  loadPickupSpots,
  resolveCommunityName,
  subscribePickupSpots,
} from './pickupSpotsService';

const catalogCommunity = {
  id: 'אור הנר',
  name: 'אור הנר',
  region: 'עוטף',
  options: ['pickup'],
  deliveryFee: 0,
  color: '#059669',
  sortOrder: 1,
  active: true,
  aliases: [],
};

describe('pickup spots catalog loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidatePickupSpotsCache();
    doc.mockImplementation((...args) => ({ type: 'doc', args }));
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ communities: [catalogCommunity] }),
    });
    getDocs.mockResolvedValue({ empty: true, docs: [] });
    onSnapshot.mockImplementation((ref, next) => {
      if (typeof next === 'function' && ref && ref.type === 'doc') {
        next({
          exists: () => true,
          data: () => ({ communities: [catalogCommunity] }),
        });
      }
      return jest.fn();
    });
  });

  test('loads the slim catalog document instead of the communities collection', async () => {
    const snapshot = await loadPickupSpots({ force: true });

    expect(getDoc).toHaveBeenCalled();
    expect(doc).toHaveBeenCalledWith(expect.anything(), 'settings/communitiesCatalog');
    expect(getDocs).not.toHaveBeenCalled();
    expect(snapshot.pickupSpots).toEqual(['אור הנר']);
    expect(snapshot.source).toBe('catalog');
  });

  test('does not treat static community names as a loaded Firestore cache', () => {
    expect(getPickupSpotsSync().loaded).toBe(false);
    expect(resolveCommunityName('ניצנים ה')).toBe('ניצנים');
    expect(getPickupSpotsSync().loaded).toBe(false);
  });

  test('subscribes to the catalog document rather than the full communities collection', () => {
    const unsubscribe = subscribePickupSpots(jest.fn());

    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot.mock.calls[0][0]).toEqual(expect.objectContaining({
      type: 'doc',
      args: expect.arrayContaining(['settings/communitiesCatalog']),
    }));
    expect(getDocs).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('shows the static community list before Firestore returns', () => {
    const snapshot = getPickupSpotsSync();

    expect(snapshot.loaded).toBe(false);
    expect(snapshot.pickupSpots.length).toBeGreaterThan(0);
    expect(snapshot.pickupSpots).toEqual(expect.arrayContaining(['אור הנר', 'ניצנים']));
  });

  test('loads communities missing from the catalog when collection fallback is requested', async () => {
    const newCommunity = { ...catalogCommunity, id: 'יישוב חדש', name: 'יישוב חדש' };
    getDocs.mockResolvedValue({
      empty: false,
      docs: [
        { id: catalogCommunity.name, data: () => catalogCommunity },
        { id: newCommunity.name, data: () => newCommunity },
      ],
    });

    const snapshot = await loadPickupSpots({ force: true, allowCollectionFallback: true });

    expect(getDocs).toHaveBeenCalled();
    expect(snapshot.pickupSpots).toEqual(expect.arrayContaining(['אור הנר', 'יישוב חדש']));
    expect(snapshot.source).toBe('collection');
    expect(setDoc).toHaveBeenCalled();
    expect(doc).toHaveBeenCalledWith(expect.anything(), 'settings/communitiesCatalog');
  });

  test('does not publish the catalog for non-admin sessions', async () => {
    const { auth } = jest.requireMock('../firebase/firebase');
    const previousUser = auth.currentUser;
    auth.currentUser = { uid: 'business-owner' };
    getDocs.mockResolvedValue({
      empty: false,
      docs: [{ id: catalogCommunity.name, data: () => catalogCommunity }],
    });

    try {
      await loadPickupSpots({ force: true, allowCollectionFallback: true });
      expect(setDoc).not.toHaveBeenCalled();
    } finally {
      auth.currentUser = previousUser;
    }
  });

  test('does not let a slower catalog load overwrite collection fallback', async () => {
    const newCommunity = { ...catalogCommunity, id: 'יישוב חדש', name: 'יישוב חדש' };
    let releaseCatalog;
    getDoc.mockImplementation(() => new Promise((resolve) => {
      releaseCatalog = () => resolve({
        exists: () => true,
        data: () => ({
          communities: [catalogCommunity],
          updatedAt: new Date().toISOString(),
        }),
      });
    }));
    getDocs.mockResolvedValue({
      empty: false,
      docs: [
        { id: catalogCommunity.name, data: () => catalogCommunity },
        { id: newCommunity.name, data: () => newCommunity },
      ],
    });

    const catalogPromise = loadPickupSpots({ force: true });
    await loadPickupSpots({ force: true, allowCollectionFallback: true });
    releaseCatalog();
    await catalogPromise;

    expect(getPickupSpotsSync().pickupSpots).toEqual(expect.arrayContaining(['אור הנר', 'יישוב חדש']));
  });

  test('keeps collection communities when a stale catalog snapshot arrives', async () => {
    const newCommunity = { ...catalogCommunity, id: 'יישוב חדש', name: 'יישוב חדש' };
    getDocs.mockResolvedValue({
      empty: false,
      docs: [
        { id: catalogCommunity.name, data: () => catalogCommunity },
        { id: newCommunity.name, data: () => newCommunity },
      ],
    });

    await loadPickupSpots({ force: true, allowCollectionFallback: true });
    const unsubscribe = subscribePickupSpots(jest.fn());
    await loadPickupSpots();

    expect(getPickupSpotsSync().pickupSpots).toEqual(expect.arrayContaining(['אור הנר', 'יישוב חדש']));
    unsubscribe();
  });

  test('keeps collection communities when a newer catalog snapshot is missing them', async () => {
    const newCommunity = { ...catalogCommunity, id: 'יישוב חדש', name: 'יישוב חדש' };
    getDocs.mockResolvedValue({
      empty: false,
      docs: [
        { id: catalogCommunity.name, data: () => catalogCommunity },
        { id: newCommunity.name, data: () => newCommunity },
      ],
    });

    await loadPickupSpots({ force: true, allowCollectionFallback: true });
    const unsubscribe = subscribePickupSpots(jest.fn());
    const catalogHandler = onSnapshot.mock.calls.find((call) => typeof call[1] === 'function')?.[1];
    catalogHandler?.({
      exists: () => true,
      data: () => ({
        communities: [catalogCommunity],
        updatedAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
    unsubscribe();

    expect(getPickupSpotsSync().pickupSpots).toEqual(expect.arrayContaining(['אור הנר', 'יישוב חדש']));
  });

  test('does not download the communities collection when the catalog is missing', async () => {
    getDoc.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });

    const snapshot = await loadPickupSpots({ force: true });

    expect(getDocs).not.toHaveBeenCalled();
    expect(snapshot.loaded).toBe(false);
    expect(snapshot.pickupSpots.length).toBeGreaterThan(0);
  });
});
