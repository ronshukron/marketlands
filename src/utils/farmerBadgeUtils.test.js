import {
  collectFarmerBadgeBusinessIds,
  enrichProductsWithFarmerBadge,
  expandFarmerBadgeSelection,
  farmerBadgeGroupIsSelected,
  farmerBadgeNameKeys,
  groupBusinessesForFarmerBadge,
  normalizeFarmerBadgeBusinessIds,
  normalizeFarmerBadgeBusinessName,
  resolveFarmerBadgeSelection,
  toggleFarmerBadgeGroupIds,
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

  test('matches Owner_ID when businessId is missing or different', () => {
    const products = [
      { id: 'product-1', Owner_ID: 'business-1' },
      { id: 'product-2', businessId: 'other-id', Owner_ID: 'business-1' },
      { id: 'product-3', ownerId: 'business-1' },
    ];

    expect(enrichProductsWithFarmerBadge(products, ['business-1']).map(({ hasFarmerBadge }) => (
      hasFarmerBadge
    ))).toEqual([true, true, true]);
  });

  test('matches selected business names when IDs come from a duplicate business document', () => {
    const products = [
      { id: 'product-1', businessId: 'real-id', businessName: 'חקלאי גרנות' },
      { id: 'product-2', businessId: 'other-id', businessName: 'מוג\'ו' },
    ];

    expect(enrichProductsWithFarmerBadge(
      products,
      ['stale-duplicate-id'],
      ['חקלאי גרנות', 'עסק אחר']
    ).map(({ hasFarmerBadge }) => hasFarmerBadge)).toEqual([true, false]);
  });

  test('treats Hebrew geresh, ASCII apostrophes and a משק prefix as the same farm name', () => {
    expect(normalizeFarmerBadgeBusinessName('מוג׳ו')).toBe(normalizeFarmerBadgeBusinessName("מוג'ו"));
    expect(farmerBadgeNameKeys('משק בילנסקי')).toEqual(expect.arrayContaining(['משק בילנסקי', 'בילנסקי']));

    expect(enrichProductsWithFarmerBadge(
      [
        { id: 'mojo', businessId: 'real-mojo', businessName: 'מוג׳ו' },
        { id: 'bilensky', businessId: 'real-bilensky', businessName: 'משק בילנסקי' },
      ],
      [],
      ["מוג'ו", 'בילנסקי']
    ).map(({ hasFarmerBadge }) => hasFarmerBadge)).toEqual([true, true]);
  });

  test('expands a selected farm to every business document that shares its name', () => {
    expect(expandFarmerBadgeSelection({
      selectedIds: ['stale-mojo'],
      selectedNames: [],
      businesses: [
        { id: 'stale-mojo', businessName: "מוג'ו" },
        { id: 'real-mojo', businessName: 'מוג׳ו' },
        { id: 'bilensky', businessName: 'משק בילנסקי' },
      ],
    })).toEqual({
      ids: ['stale-mojo', 'real-mojo'],
      names: ["מוג'ו", 'מוג׳ו'],
    });
  });

  test('uses a global farmer list for every community and falls back to a union of older per-spot lists', () => {
    expect(resolveFarmerBadgeSelection({
      globalDoc: { farmerBadgeBusinessIds: ['farm-1'] },
      communitySchedules: [{ farmerBadgeBusinessIds: ['farm-2'] }],
    })).toEqual({ ids: ['farm-1'], names: [] });

    expect(resolveFarmerBadgeSelection({
      globalDoc: { farmerBadgeBusinessIds: [] },
      communitySchedules: [{ farmerBadgeBusinessIds: ['farm-2'] }],
    })).toEqual({ ids: [], names: [] });

    expect(resolveFarmerBadgeSelection({
      communitySchedules: [
        { farmerBadgeBusinessIds: ['farm-or-haner'] },
        { farmerBadgeBusinessIds: ['farm-or-haner', 'farm-other'] },
        { farmerBadgeBusinessIds: undefined },
      ],
    })).toEqual({ ids: ['farm-or-haner', 'farm-other'], names: [] });

    expect(collectFarmerBadgeBusinessIds(undefined)).toEqual([]);
  });

  test('groups duplicate farm documents so picking a name selects every copy', () => {
    const groups = groupBusinessesForFarmerBadge([
      { id: 'stale-mojo', businessName: "מוג'ו" },
      { id: 'real-mojo', businessName: 'מוג׳ו' },
      { id: 'bilensky', businessName: 'משק בילנסקי' },
    ]);

    const mojo = groups.find((group) => group.ids.includes('real-mojo'));
    expect(mojo.ids).toEqual(['stale-mojo', 'real-mojo']);
    expect(farmerBadgeGroupIsSelected(mojo, ['stale-mojo'])).toBe(true);
    expect(toggleFarmerBadgeGroupIds(['stale-mojo'], mojo)).toEqual([]);
    expect(toggleFarmerBadgeGroupIds([], mojo)).toEqual(['stale-mojo', 'real-mojo']);
  });
});
