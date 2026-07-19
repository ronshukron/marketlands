import {
  calculateMarginPreservingPrice,
  compareSupplierReports,
  normalizeSupplierLabel,
  parseSupplierTextLines,
  scoreSupplierProductMatch,
} from './supplierPriceMatching';

describe('supplier price matching', () => {
  test('normalizes Hebrew punctuation and spacing', () => {
    expect(normalizeSupplierLabel('  אבוקדו  ק״ג - מובחר ')).toBe('אבוקדו קג מובחר');
  });

  test('parses kg, unit, notes and P-code rows', () => {
    const { rows, duplicateCodes } = parseSupplierTextLines([
      { page: 1, text: '2010301 אבוקדו ריד ק"ג 11.80' },
      { page: 1, text: "2230201 לימון ליים ג'ק 14.90 מלאי מוגבל" },
      { page: 2, text: "P008 ארגז ליקוט ירק גדול 'יח 30.00" },
      { page: 2, text: '-- 2 of 4 --' },
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ supplierCode: '2010301', unit: 'kg', cost: 11.8 });
    expect(rows[1]).toMatchObject({ notes: 'מלאי מוגבל', cost: 14.9 });
    expect(rows[2]).toMatchObject({ supplierCode: 'P008', unit: 'unit', cost: 30 });
    expect(duplicateCodes).toEqual([]);
  });

  test('reports duplicate supplier codes', () => {
    const result = parseSupplierTextLines([
      '2010301 אבוקדו ק"ג 11.80',
      '2010301 אבוקדו ק"ג 12.80',
    ]);
    expect(result.duplicateCodes).toEqual(['2010301']);
  });

  test('compares reports including new and removed items', () => {
    const result = compareSupplierReports(
      [
        { supplierCode: '1', cost: 12 },
        { supplierCode: '3', cost: 8 },
      ],
      [
        { supplierCode: '1', cost: 10 },
        { supplierCode: '2', cost: 5 },
      ]
    );
    expect(result.compared[0]).toMatchObject({ costDelta: 2, changePercent: 20, changeType: 'increased' });
    expect(result.compared[1].changeType).toBe('new');
    expect(result.removed[0]).toMatchObject({ supplierCode: '2', changeType: 'removed' });
  });

  test('preserves gross margin and rejects a missing baseline', () => {
    expect(calculateMarginPreservingPrice({
      currentPrice: 20,
      previousCost: 10,
      newCost: 12,
    })).toMatchObject({ valid: true, margin: 0.5, suggestedPrice: 24 });

    expect(calculateMarginPreservingPrice({
      currentPrice: 20,
      previousCost: null,
      newCost: 12,
    }).valid).toBe(false);
  });

  test('matches names after supplier noise is removed', () => {
    expect(scoreSupplierProductMatch('בננה איכות מעולה', 'בננה')).toBeGreaterThanOrEqual(75);
  });
});
