import { assertBlogSlugUnchanged, normalizeBlogSlug } from './blogPostService';

describe('normalizeBlogSlug', () => {
  test('creates a stable Hebrew slug', () => {
    expect(normalizeBlogSlug('  התובנות של רון!  ')).toBe('התובנות-של-רון');
  });

  test('normalizes repeated separators and casing', () => {
    expect(normalizeBlogSlug('Fresh  FOOD -- Today')).toBe('fresh-food-today');
  });

  test('removes slash characters so the slug stays one path segment', () => {
    expect(normalizeBlogSlug('/אביב/חדש/')).toBe('אביב-חדש');
  });
});

describe('blog slug updates', () => {
  test('allows content updates at the existing normalized slug', () => {
    expect(assertBlogSlugUnchanged('Fresh Food', 'fresh-food')).toBe('fresh-food');
  });

  test('requires a new post for a different slug', () => {
    expect(() => assertBlogSlugUnchanged('old-post', 'new-post')).toThrow(/לא ניתן לשנות/);
  });
});
