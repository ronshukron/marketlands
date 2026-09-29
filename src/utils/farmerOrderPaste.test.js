import {
  allLinesReadyToSave,
  buildAliasKey,
  buildCropTokens,
  formatFarmerQuantity,
  matchPastedOrder,
  normalizeHebrewLabel,
  parseFarmerOrderLine,
  parseFarmerOrderText,
  scorePasteName,
} from './farmerOrderPaste';

const products = [
  { id: 'lalik', name: 'חסה לאליק', measurementType: 'kg' },
  { id: 'solanova', name: 'חסה סולנובה', measurementType: 'kg' },
  { id: 'tomato', name: 'עגבניות שרי', measurementType: 'unit' },
];

describe('farmer order paste', () => {
  test('normalizes Hebrew quotes, nikud and spacing', () => {
    expect(normalizeHebrewLabel('  חִסָּה  ״לאליק״ ')).toBe('חסה לאליק');
  });

  test('parses dashed, spaced, leading quantity and trailing unit', () => {
    expect(parseFarmerOrderLine('חסה לאליק - 20')).toMatchObject({
      name: 'חסה לאליק',
      quantity: 20,
    });
    expect(parseFarmerOrderLine('חסה סולנובה – 10')).toMatchObject({
      name: 'חסה סולנובה',
      quantity: 10,
    });
    expect(parseFarmerOrderLine('חסה לאליק 20')).toMatchObject({
      name: 'חסה לאליק',
      quantity: 20,
    });
    expect(parseFarmerOrderLine('חסה לאליק - 2.5 ק"ג')).toMatchObject({
      name: 'חסה לאליק',
      quantity: 2.5,
      unitHint: 'kg',
    });
    expect(parseFarmerOrderLine('עגבניות שרי 12 יח')).toMatchObject({
      name: 'עגבניות שרי',
      quantity: 12,
      unitHint: 'unit',
    });
    expect(parseFarmerOrderLine('20 חסה לאליק')).toMatchObject({
      name: 'חסה לאליק',
      quantity: 20,
    });
  });

  test('skips empty lines and keeps a line without quantity for review', () => {
    const parsed = parseFarmerOrderText('חסה לאליק - 20\n\n  \nחסה סולנובה');
    expect(parsed).toHaveLength(2);
    expect(parsed[1].parseError).toBe('no_quantity');
  });

  test('treats the shared crop word as weak and matches a mistyped variety', () => {
    const cropTokens = buildCropTokens(products);
    expect(cropTokens.has('חסה')).toBe(true);

    const typoScore = scorePasteName('חסה לליק', 'חסה לאליק', cropTokens);
    const otherLettuce = scorePasteName('חסה לליק', 'חסה סולנובה', cropTokens);
    expect(typoScore).toBeGreaterThanOrEqual(70);
    expect(typoScore - otherLettuce).toBeGreaterThanOrEqual(18);
  });

  test('does not swap two lettuce varieties', () => {
    const matches = matchPastedOrder(
      'חסה לאליק - 20\nחסה סולנובה - 10',
      products
    );
    expect(matches[0]).toMatchObject({
      productId: 'lalik',
      quantity: 20,
      needsReview: false,
    });
    expect(matches[1]).toMatchObject({
      productId: 'solanova',
      quantity: 10,
      needsReview: false,
    });
  });

  test('auto-accepts a one-letter variety typo and reviews a crop-only line', () => {
    const matches = matchPastedOrder('חסה לליק - 20\nחסה - 5', products);
    expect(matches[0]).toMatchObject({
      productId: 'lalik',
      needsReview: false,
    });
    expect(matches[1].needsReview).toBe(true);
    expect(matches[1].productId).toBe('');
  });

  test('blocks save until every line has a product and quantity', () => {
    const matches = matchPastedOrder('חסה לליק - 20\nחסה - 5', products);
    expect(allLinesReadyToSave(null)).toBe(false);
    expect(allLinesReadyToSave(matches)).toBe(false);
    matches[1].productId = 'solanova';
    matches[1].quantity = 5;
    expect(allLinesReadyToSave(matches)).toBe(true);
  });

  test('formats quantity using the matched product unit', () => {
    expect(formatFarmerQuantity(20, 'kg')).toBe('20 ק״ג');
    expect(formatFarmerQuantity(12, 'unit')).toBe('12 יח׳');
  });
});

const CUSTOMER_SAMPLE = `צהריים טובים, הזמנה ל23.09.26:
הזמנה ארוז:
* חסה לבבות מארז מארז חסה - 42 יח'
* חסה לאליק מארז מארז לאליק - 25 יח'
* מלפפון מארז 1 ק"ג - 20 יח'
* בצל ירוק בצל ירוק - 22 יח'
* סלרי מארז - 24 יח'
* חסה סלנובה מארז - 15 יח'
* פטרוזיליה מארז - 39 יח'
* כוסברה מארז - 36 יח'
* מלפפון ארומטו מארז - 6 יח'
* תרד קופסא מארז תרד - 9 יח'
* חסה עגולה - 11 יח'
* רוקט - 7 יח'
* סלק עלים/מנגולד מארז - 12 יח'
* עלי בייבי - 5 יח'
* עירית קופסא מארז עירית - 7 יח'
* פלפל חריף ירוק 0.25 ק"ג - 15 יח'
* שמיר - 13 יח'
* נענע מארז - 8 יח'
* כרוב באק צ'וי - 2 יח'
* עלי קייל מארז מארז עלי קייל - 2 יח'
* בזיל קופסא מארז בזיל - 4 יח'
* חסה ערבית - 3 יח'
* אורגנו מארז - 1 יח'
* טימין מארז - 2 יח'`;

const sampleCatalog = [
  { id: 'hearts', name: 'חסה לבבות', measurementType: 'unit' },
  { id: 'lalik', name: 'חסה לאליק', measurementType: 'unit' },
  { id: 'cucumber', name: 'מלפפון', measurementType: 'unit' },
  { id: 'green-onion', name: 'בצל ירוק', measurementType: 'unit' },
  { id: 'celery', name: 'סלרי', measurementType: 'unit' },
  { id: 'solanova', name: 'חסה סלנובה', measurementType: 'unit' },
  { id: 'parsley', name: 'פטרוזיליה', measurementType: 'unit' },
  { id: 'cilantro', name: 'כוסברה', measurementType: 'unit' },
  { id: 'aromatic', name: 'מלפפון ארומטו', measurementType: 'unit' },
  { id: 'spinach', name: 'תרד', measurementType: 'unit' },
  { id: 'round', name: 'חסה עגולה', measurementType: 'unit' },
  { id: 'rocket', name: 'רוקט', measurementType: 'unit' },
  { id: 'chard', name: 'סלק עלים', measurementType: 'unit' },
  { id: 'baby', name: 'עלי בייבי', measurementType: 'unit' },
  { id: 'chives', name: 'עירית', measurementType: 'unit' },
  { id: 'hot-pepper', name: 'פלפל חריף ירוק', measurementType: 'unit' },
  { id: 'dill', name: 'שמיר', measurementType: 'unit' },
  { id: 'mint', name: 'נענע', measurementType: 'unit' },
  { id: 'bok-choy', name: "כרוב באק צ'וי", measurementType: 'unit' },
  { id: 'kale', name: 'עלי קייל', measurementType: 'unit' },
  { id: 'basil', name: 'בזיל', measurementType: 'unit' },
  { id: 'arabic', name: 'חסה ערבית', measurementType: 'unit' },
  { id: 'oregano', name: 'אורגנו', measurementType: 'unit' },
  { id: 'thyme', name: 'טימין', measurementType: 'unit' },
];

describe('customer paste sample', () => {
  test('skips headers, strips bullets and יח\', and keeps the date out of the quantity', () => {
    const parsed = parseFarmerOrderText(CUSTOMER_SAMPLE);
    const skipped = parsed.filter((line) => line.kind === 'skipped');
    const items = parsed.filter((line) => line.kind !== 'skipped');
    expect(skipped).toHaveLength(2);
    expect(items.map((line) => line.quantity)).toEqual([
      42, 25, 20, 22, 24, 15, 39, 36, 6, 9, 11, 7, 12, 5, 7, 15, 13, 8, 2, 2, 4, 3, 1, 2,
    ]);
    expect(items.some((line) => String(line.quantity).includes('23'))).toBe(false);
    expect(buildAliasKey('חסה לאליק מארז מארז לאליק')).toBe('חסה לאליק');
  });

  test('matches repeated lettuce names and cucumber packaging without swapping varieties', () => {
    const matches = matchPastedOrder(CUSTOMER_SAMPLE, sampleCatalog);
    const byRaw = (snippet) => matches.find((line) => line.rawLine.includes(snippet));
    expect(byRaw('חסה לאליק')).toMatchObject({
      productId: 'lalik',
      quantity: 25,
      needsReview: false,
    });
    expect(byRaw('חסה לבבות').productId).toBe('hearts');
    expect(byRaw('חסה סלנובה').productId).toBe('solanova');
    expect(byRaw('מלפפון מארז 1')).toMatchObject({
      productId: 'cucumber',
      quantity: 20,
      needsReview: false,
    });
  });

  test('uses a saved alias before scoring', () => {
    const matches = matchPastedOrder('ירק מוזר - 4 יח\'', sampleCatalog, {
      [buildAliasKey('ירק מוזר')]: { productId: 'rocket', productName: 'רוקט' },
    });
    expect(matches[0]).toMatchObject({
      productId: 'rocket',
      quantity: 4,
      score: 100,
      source: 'alias',
      needsReview: false,
    });
  });
});
