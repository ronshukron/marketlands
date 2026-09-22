import {
  clearCommunityOrderForScope,
  readCommunityOrderForScope,
  saveCommunityOrderForScope,
} from './localStorageSafeV7';

const STORAGE_KEY = 'deliveryV7::communityOrderByScope';

describe('community order by scope', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('reads empty when nothing is stored', () => {
    expect(readCommunityOrderForScope('week-a')).toEqual([]);
  });

  test('saves and reads a per-scope override', () => {
    saveCommunityOrderForScope('week-a', ['Nitzanim', 'Ashkelon']);
    expect(readCommunityOrderForScope('week-a')).toEqual(['Nitzanim', 'Ashkelon']);
    expect(readCommunityOrderForScope('week-b')).toEqual([]);
  });

  test('clears only the requested scope', () => {
    saveCommunityOrderForScope('week-a', ['A']);
    saveCommunityOrderForScope('week-b', ['B']);
    clearCommunityOrderForScope('week-a');
    expect(readCommunityOrderForScope('week-a')).toEqual([]);
    expect(readCommunityOrderForScope('week-b')).toEqual(['B']);
  });

  test('keeps the 5 most recently saved scopes', () => {
    saveCommunityOrderForScope('s1', ['1']);
    saveCommunityOrderForScope('s2', ['2']);
    saveCommunityOrderForScope('s3', ['3']);
    saveCommunityOrderForScope('s4', ['4']);
    saveCommunityOrderForScope('s5', ['5']);
    saveCommunityOrderForScope('s6', ['6']);

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(Object.keys(stored)).toHaveLength(5);
    expect(readCommunityOrderForScope('s6')).toEqual(['6']);
    expect(readCommunityOrderForScope('s1')).toEqual([]);
  });
});
