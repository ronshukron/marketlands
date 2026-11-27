import { DEFAULT_STAND_SLUG, normalizeStandSlug, standLink } from './standService';

jest.mock('../firebase/firebase', () => ({ db: {} }));

test('the stand address: English letters, digits and dashes, default "home"', () => {
  expect(DEFAULT_STAND_SLUG).toBe('home');
  expect(normalizeStandSlug(' Home ')).toBe('home');
  expect(normalizeStandSlug('or-haner-2')).toBe('or-haner-2');
  expect(normalizeStandSlug('בית')).toBe('');
  expect(normalizeStandSlug('a')).toBe('');
  expect(normalizeStandSlug('-home')).toBe('');
  expect(normalizeStandSlug('home/../x')).toBe('');
});

test('the link points at the stand page on this site', () => {
  expect(standLink('home')).toBe(`${window.location.origin}/stand/home`);
});
