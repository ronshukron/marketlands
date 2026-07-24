import {
  enrichProductsWithFarmerBadge,
  normalizeFarmerBadgeBusinessIds,
} from './farmerBadgeUtils';

describe('farmer badge helpers', () => {
  test('treats a missing schedule field as an empty selection', () => {
    expect(normalizeFarmerBadgeBusinessIds(undefined)).toEqual([]);
    expect(enrichProductsWithFarmerBadge([{ businessId: 'business-1' }], undefined))
      .toEqual([{ businessId: 'business-1', hasFarmerBadge: false }]);
  });

  test('normalizes duplicate business IDs and ignores invalid values', () => {
    expect(normalizeFarmerBadgeBusinessIds([
      ' business-1 ',
      'business-1',
      '',
      null,
      'business-2',
    ])).toEqual(['business-1', 'business-2']);
  });

  test('marks every product belonging to a selected business without mutating it', () => {
    const products = [
      { id: 'product-1', businessId: 'business-1' },
      { id: 'product-2', businessId: 'business-1' },
      { id: 'product-3', businessId: 'business-2' },
    ];

    const enriched = enrichProductsWithFarmerBadge(products, ['business-1']);

    expect(enriched.map(({ hasFarmerBadge }) => hasFarmerBadge)).toEqual([true, true, false]);
    expect(products).toEqual([
      { id: 'product-1', businessId: 'business-1' },
      { id: 'product-2', businessId: 'business-1' },
      { id: 'product-3', businessId: 'business-2' },
    ]);
  });
});
