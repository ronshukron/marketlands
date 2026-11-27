import {
  addRecurringLine,
  diffRecurringLines,
  priceRecurringLines,
  isInRecurringLines,
  withRecurringLine,
  hasRealOptions,
  normalizeOptionKey,
  estimateRecurringLines,
  getQuantityDiscount,
  getRecurringUnitPricing,
  initialRecurringLines,
  isRecurringBasketChanged,
  quantityStep,
  recurringLineKey,
  setRecurringLineQuantity,
  toProductInfo,
  toRecurringPayload,
} from './recurringBasket';

const template = {
  componentLines: [
    { productId: 'cucumber', businessId: 'f1', quantity: 1, productName: 'מלפפון' },
    { productId: 'broken', businessId: 'f1', quantity: 0 },
  ],
};

test('starts from the admin basket until the customer saves their own', () => {
  const fromTemplate = initialRecurringLines({}, template);
  expect(fromTemplate.personal).toBe(false);
  expect(fromTemplate.lines).toEqual([expect.objectContaining({ productId: 'cucumber', quantity: 1, selectedOption: '' })]);

  const personal = initialRecurringLines({ recurringLines: [{ productId: 'cucumber', quantity: 2, selectedOption: 'None' }] }, template);
  expect(personal.personal).toBe(true);
  expect(personal.lines[0].quantity).toBe(2);
  expect(template.componentLines[0].quantity).toBe(1);
});

test('adding, changing and removing lines', () => {
  let lines = initialRecurringLines({}, template).lines;
  lines = addRecurringLine(lines, { productId: 'broccoli', measurementType: 'unit', productName: 'ברוקולי' });
  expect(lines.map((line) => [line.productId, line.quantity])).toEqual([['cucumber', 1], ['broccoli', 1]]);

  lines = addRecurringLine(lines, { productId: 'broccoli', measurementType: 'unit' });
  expect(lines.find((line) => line.productId === 'broccoli').quantity).toBe(2);

  lines = addRecurringLine(lines, { productId: 'eggs', measurementType: 'package' }, 'L');
  expect(recurringLineKey(lines[2])).toBe('eggs|L');

  lines = setRecurringLineQuantity(lines, 'cucumber|', 2);
  lines = setRecurringLineQuantity(lines, 'broccoli|', 0);
  expect(toRecurringPayload(lines)).toEqual([
    { productId: 'cucumber', quantity: 2, selectedOption: '' },
    { productId: 'eggs', quantity: 1, selectedOption: 'L' },
  ]);
});

test('steps follow the product unit', () => {
  expect(quantityStep('kg', 0.25)).toBe(0.25);
  expect(quantityStep('kg', 0)).toBe(0.5);
  expect(quantityStep('unit', 3)).toBe(1);
  expect(quantityStep('package')).toBe(1);
});

test('the save button lights up only for real changes', () => {
  const start = initialRecurringLines({}, template).lines;
  expect(isRecurringBasketChanged(start, [...start])).toBe(false);
  expect(isRecurringBasketChanged(start, setRecurringLineQuantity(start, 'cucumber|', 1.5))).toBe(true);
});

test('an empty admin basket starts the signup page with no lines', () => {
  expect(initialRecurringLines(null, { componentLines: [] }).lines).toEqual([]);
  expect(isRecurringBasketChanged([], [])).toBe(false);
  const built = addRecurringLine([], { productId: 'tomato', measurementType: 'kg', unitSize: 0.5 });
  expect(isRecurringBasketChanged([], built)).toBe(true);
});

test('product info and the per-delivery estimate', () => {
  const info = {
    tomato: toProductInfo({ name: 'עגבנייה', images: ['t.jpg'], price: 10, measurementType: 'kg' }),
    broccoli: toProductInfo({ productName: 'ברוקולי', image: 'b.jpg', priceSnapshot: 12, measurementType: 'unit', averageWeightKg: 0.5 }),
  };
  expect(info.tomato).toEqual(expect.objectContaining({ productName: 'עגבנייה', image: 't.jpg', price: 10 }));
  expect(info.broccoli).toEqual(expect.objectContaining({ productName: 'ברוקולי', image: 'b.jpg', price: 12 }));
  const lines = [
    { productId: 'tomato', quantity: 1.5, measurementType: 'kg' },
    { productId: 'broccoli', quantity: 2, measurementType: 'unit' },
    { productId: 'unknown', quantity: 3 },
  ];
  // 1.5 kg x 10 + 2 units x 0.5 kg x 12; a product with no price adds nothing.
  expect(estimateRecurringLines(lines, info)).toBeCloseTo(27);
});

test('quantity discount follows the server rule (getUnitPricing)', () => {
  const product = { price: 20, quantityDiscountThreshold: 3, quantityDiscountPrice: 15 };
  expect(getRecurringUnitPricing(product, 2)).toEqual(expect.objectContaining({ basePrice: 20, unitPrice: 20, applied: false }));
  expect(getRecurringUnitPricing(product, 3)).toEqual(expect.objectContaining({ basePrice: 20, unitPrice: 15, applied: true }));
  expect(getRecurringUnitPricing({ price: 20, quantityDiscountThreshold: 3, quantityDiscountPrice: 25 }, 5).unitPrice).toBe(20);
  expect(getQuantityDiscount({ price: 20 })).toBeNull();
  expect(getQuantityDiscount({ price: 20, quantityDiscountThreshold: '', quantityDiscountPrice: '' })).toBeNull();
  expect(getQuantityDiscount(product).label).toBe('3+ ב-₪15.00 ליחידת מחיר');
  expect(getQuantityDiscount({ ...product, quantityDiscountLabel: '3 ק"ג ב-45' }).label).toBe('3 ק"ג ב-45');
});

test('the estimate uses the discounted price once the quantity reaches it', () => {
  const info = { tomato: toProductInfo({ name: 'עגבנייה', price: 10, measurementType: 'kg', quantityDiscountThreshold: 2, quantityDiscountPrice: 8 }) };
  expect(estimateRecurringLines([{ productId: 'tomato', quantity: 1.5, measurementType: 'kg' }], info)).toBeCloseTo(15);
  expect(estimateRecurringLines([{ productId: 'tomato', quantity: 2, measurementType: 'kg' }], info)).toBeCloseTo(16);
});

test('"ללא אופציות" is no option at all', () => {
  expect(normalizeOptionKey('ללא אופציות')).toBe('');
  expect(normalizeOptionKey('None')).toBe('');
  expect(normalizeOptionKey(' L ')).toBe('L');
  expect(hasRealOptions(['ללא אופציות'])).toBe(false);
  expect(hasRealOptions(['ללא אופציות', 'מארז'])).toBe(true);
  expect(hasRealOptions(undefined)).toBe(false);
  expect(recurringLineKey({ productId: 'eggs', selectedOption: 'ללא אופציות' })).toBe(recurringLineKey({ productId: 'eggs' }));
});

describe('diffRecurringLines', () => {
  const before = [
    { productId: 'cucumber', quantity: 1, selectedOption: '', productName: 'מלפפון', formId: 'f1' },
    { productId: 'tomato', quantity: 2, selectedOption: 'None', productName: 'עגבנייה', formId: 'f1' },
    { productId: 'onion', quantity: 1, selectedOption: '', productName: 'בצל', formId: 'f2' },
  ];

  test('lists added, changed and removed products with the quantity the delivery should hold', () => {
    const after = [
      { productId: 'cucumber', quantity: 1.5, selectedOption: '', productName: 'מלפפון', formId: 'f1' },
      { productId: 'tomato', quantity: 2, selectedOption: '' },
      { productId: 'broccoli', quantity: 1, selectedOption: '', productName: 'ברוקולי', formId: 'f3' },
    ];
    const changes = diffRecurringLines(before, after);
    const byId = Object.fromEntries(changes.map((change) => [change.productId, change]));
    expect(Object.keys(byId).sort()).toEqual(['broccoli', 'cucumber', 'onion']);
    expect(byId.cucumber).toEqual(expect.objectContaining({ change: 'changed', before: 1, quantity: 1.5, formId: 'f1' }));
    expect(byId.broccoli).toEqual(expect.objectContaining({ change: 'added', before: 0, quantity: 1, formId: 'f3', productName: 'ברוקולי' }));
    expect(byId.onion).toEqual(expect.objectContaining({ change: 'removed', before: 1, quantity: 0, productName: 'בצל' }));
  });

  test('an unchanged basket gives no changes ("None" equals no option)', () => {
    const same = before.map((line) => ({ ...line, selectedOption: line.selectedOption === 'None' ? '' : line.selectedOption }));
    expect(diffRecurringLines(before, same)).toEqual([]);
  });

  test('options are separate products', () => {
    const changes = diffRecurringLines(
      [{ productId: 'pepper', quantity: 1, selectedOption: 'אדום' }],
      [{ productId: 'pepper', quantity: 1, selectedOption: 'צהוב' }],
    );
    expect(changes.map((change) => [change.selectedOption, change.change, change.quantity])).toEqual([
      ['צהוב', 'added', 1],
      ['אדום', 'removed', 0],
    ]);
  });

  test('form ids come from recurringLines.orderId and from the catalog', () => {
    expect(initialRecurringLines({ recurringLines: [{ productId: 'a', quantity: 1, orderId: 'form-a' }] }, null).lines[0].formId).toBe('form-a');
    expect(toProductInfo({ name: 'x', formId: 'form-x' }).formId).toBe('form-x');
    expect(addRecurringLine([], { productId: 'b', formId: 'form-b', measurementType: 'unit' })[0].formId).toBe('form-b');
  });
});

describe('withRecurringLine', () => {
  const lines = [{ productId: 'cucumber', quantity: 1, selectedOption: '' }];

  test('adds the product at the delivery quantity', () => {
    const result = withRecurringLine(lines, { productId: 'broccoli', quantity: 2, productName: 'ברוקולי', measurementType: 'unit', formId: 'f9' });
    expect(result.alreadyThere).toBe(false);
    expect(toRecurringPayload(result.lines)).toEqual([
      { productId: 'cucumber', quantity: 1, selectedOption: '' },
      { productId: 'broccoli', quantity: 2, selectedOption: '' },
    ]);
  });

  test('a product already in the basket is left as it is', () => {
    const result = withRecurringLine(lines, { productId: 'cucumber', quantity: 3, selectedOption: 'None' });
    expect(result.alreadyThere).toBe(true);
    expect(result.lines).toBe(lines);
  });

  test('isInRecurringLines reads the customer own lines only', () => {
    const subscription = { recurringLines: [{ productId: 'pepper', selectedOption: 'אדום', quantity: 1 }] };
    expect(isInRecurringLines(subscription, 'pepper', 'אדום')).toBe(true);
    expect(isInRecurringLines(subscription, 'pepper', '')).toBe(false);
    expect(isInRecurringLines({}, 'pepper')).toBe(false);
  });
});

describe('shared promotions in the recurring basket estimate', () => {
  const raspberryInfo = (name) => toProductInfo({
    name, price: 22.5, measurementType: 'package', businessId: 'farm1', quantityDiscountThreshold: 2, quantityDiscountPrice: 20,
  });
  const productInfo = { red: raspberryInfo('פטל אדום'), black: raspberryInfo('פטל שחור') };
  const promotions = {
    farm1: [{ id: 'pair', active: true, productIds: ['red', 'black'], threshold: 2, pricingBasis: 'package', bundleTotalPrice: 40 }],
  };
  const line = (productId, quantity) => ({ productId, quantity, selectedOption: '', measurementType: 'package' });

  test('one red plus one black: ₪20 each, ₪40, the same as the delivery', () => {
    const lines = [line('red', 1), line('black', 1)];
    const pricing = priceRecurringLines(lines, productInfo, promotions);
    expect(pricing['red|'].unitPrice).toBe(20);
    expect(pricing['black|'].group).toEqual(expect.objectContaining({ applied: true, threshold: 2, label: '2 ב-₪40.00' }));
    expect(estimateRecurringLines(lines, productInfo, promotions)).toBe(40);
  });

  test('one alone: ₪22.5, and how many more are needed', () => {
    const pricing = priceRecurringLines([line('red', 1)], productInfo, promotions);
    expect(pricing['red|'].unitPrice).toBe(22.5);
    expect(pricing['red|'].group).toEqual(expect.objectContaining({ applied: false, missing: 1 }));
    expect(estimateRecurringLines([line('red', 1)], productInfo, promotions)).toBe(22.5);
  });

  test('without the farmer promotions the estimate is as before', () => {
    expect(estimateRecurringLines([line('red', 1), line('black', 1)], productInfo)).toBe(45);
    expect(priceRecurringLines([line('red', 1)], productInfo)['red|'].group).toBeNull();
  });

  test('Products docs give the farmer through Owner_ID', () => {
    expect(toProductInfo({ name: 'x', Owner_ID: 'farm9' }).businessId).toBe('farm9');
  });
});
