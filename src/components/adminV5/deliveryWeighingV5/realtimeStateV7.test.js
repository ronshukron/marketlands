jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  deleteDoc: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  onSnapshot: jest.fn(),
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
}));

jest.mock('../../../firebase/firebase', () => ({ db: {} }));

import {
  buildSessionIdV7,
  buildStationAuditV7,
  getOrCreateStationIdV7,
} from './realtimeStateV7';

describe('V7 station and session identity contracts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('reuses the immutable delivery V7 station ID from localStorage', () => {
    localStorage.setItem('deliveryV7::stationId', 'station-existing');

    expect(getOrCreateStationIdV7()).toBe('station-existing');
    expect(localStorage.getItem('deliveryV7::stationId')).toBe('station-existing');
  });

  test('creates one station ID and then reuses it', () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.123456789);

    const first = getOrCreateStationIdV7();
    const second = getOrCreateStationIdV7();

    expect(first).toMatch(/^station-[a-z0-9]{1,6}$/);
    expect(second).toBe(first);
    expect(localStorage.getItem('deliveryV7::stationId')).toBe(first);
    expect(randomSpy).toHaveBeenCalledTimes(1);
    randomSpy.mockRestore();
  });

  test('builds the established user and station session identity', () => {
    expect(buildSessionIdV7({ userId: 'user-1', stationId: 'station-1' }))
      .toBe('user-1::station-1');
    expect(buildSessionIdV7({})).toBe('guest::station');
  });

  test('builds optional audit metadata without changing identity values', () => {
    expect(buildStationAuditV7({
      userId: 'user-1',
      userName: 'Admin',
      stationId: 'station-1',
      sessionId: 'user-1::station-1',
    }, '2026-07-24T12:00:00.000Z')).toEqual({
      stationId: 'station-1',
      sessionId: 'user-1::station-1',
      userId: 'user-1',
      userName: 'Admin',
      updatedAtIso: '2026-07-24T12:00:00.000Z',
    });
  });
});
