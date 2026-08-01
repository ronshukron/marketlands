import {
  buildCopiedProductPayload,
  fetchNextCatalogNumber,
  getBusinessLabel,
} from './copyProductUtils';

describe('getBusinessLabel', () => {
  it('prefers businessName then name then email then id', () => {
    expect(getBusinessLabel({ businessName: 'חווה', name: 'א', email: 'a@b.c', id: '1' })).toBe('חווה');
    expect(getBusinessLabel({ name: 'א', email: 'a@b.c', id: '1' })).toBe('א');
    expect(getBusinessLabel({ email: 'a@b.c', id: '1' })).toBe('a@b.c');
    expect(getBusinessLabel({ id: '1' })).toBe('1');
  });
});

describe('buildCopiedProductPayload', () => {
  const target = { id: 'biz-dest', email: 'dest@example.com', businessName: 'יעד' };

  const source = {
    id: 'src-1',
    name: 'עגבניות',
    price: 12.5,
    description: 'טריות',
    options: ['גדול', 'קטן'],
    images: ['https://example.com/a.jpg', ''],
    stockAmount: 40,
    Owner_ID: 'biz-src',
    Owner_Email: 'src@example.com',
    createdAt: new Date('2020-01-01'),
    catalogNumber: 100,
    vatType: 2,
    measurementType: 'kg',
    unitSize: 0.5,
    averageWeightKg: 9,
    merchantPrice: 8,
    thaiName: 'มะเขือเทศ',
    category: 'ירקות',
    showInAllCategory: true,
    verified: false,
    rejected: true,
    isSample: false,
    isOrganic: true,
    isRecommended: true,
    tags: ['קיץ'],
    quantityDiscountThreshold: 10,
    quantityDiscountPrice: 10,
  };

  it('creates a new product payload bound to the destination business', () => {
    const payload = buildCopiedProductPayload(source, target, 555);

    expect(payload).not.toHaveProperty('id');
    expect(payload.Owner_ID).toBe('biz-dest');
    expect(payload.Owner_Email).toBe('dest@example.com');
    expect(payload.catalogNumber).toBe(555);
    expect(payload.createdAt).toBeInstanceOf(Date);
    expect(payload.verified).toBe(true);
    expect(payload.rejected).toBe(false);
    expect(payload.name).toBe('עגבניות');
    expect(payload.price).toBe(12.5);
    expect(payload.images).toEqual(['https://example.com/a.jpg']);
    expect(payload.options).toEqual(['גדול', 'קטן']);
    expect(payload.unitSize).toBe(0.5);
    expect(payload.averageWeightKg).toBe(1);
    expect(payload.merchantPrice).toBe(8);
    expect(payload.thaiName).toBe('มะเขือเทศ');
    expect(payload.category).toBe('ירקות');
    expect(payload.showInAllCategory).toBe(false);
    expect(payload.isOrganic).toBe(true);
    expect(payload.isRecommended).toBe(true);
    expect(payload.tags).toEqual(['קיץ']);
    expect(payload.quantityDiscountThreshold).toBe(10);
    expect(payload.quantityDiscountPrice).toBe(10);
  });

  it('keeps nursery showInAllCategory only for משתלה', () => {
    const payload = buildCopiedProductPayload(
      { ...source, category: 'משתלה', showInAllCategory: true },
      target,
      1,
    );
    expect(payload.showInAllCategory).toBe(true);
  });

  it('defaults options and measurement fields safely', () => {
    const payload = buildCopiedProductPayload(
      { name: 'בננה', measurementType: 'unit', averageWeightKg: 0.25 },
      target,
      2,
    );
    expect(payload.options).toEqual(['ללא אופציות']);
    expect(payload.unitSize).toBe(1);
    expect(payload.averageWeightKg).toBe(0.25);
    expect(payload.vatType).toBe(3);
    expect(payload.isSample).toBe(true);
  });

  it('requires destination identity and catalog number', () => {
    expect(() => buildCopiedProductPayload(source, { email: 'x' }, 1)).toThrow(/id/i);
    expect(() => buildCopiedProductPayload(source, { id: 'x' }, 1)).toThrow(/email/i);
    expect(() => buildCopiedProductPayload(source, target, null)).toThrow(/catalogNumber/i);
  });
});

describe('fetchNextCatalogNumber', () => {
  it('returns catalogNumber from a successful response', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, catalogNumber: 901 }),
    });
    await expect(fetchNextCatalogNumber(fetcher)).resolves.toBe(901);
    expect(fetcher).toHaveBeenCalled();
  });

  it('throws when the response is invalid', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    });
    await expect(fetchNextCatalogNumber(fetcher)).rejects.toThrow(/invalid/i);
  });
});
