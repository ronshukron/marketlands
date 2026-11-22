import {
  addRecurringLine,
  initialRecurringLines,
  isRecurringBasketChanged,
  quantityStep,
  recurringLineKey,
  setRecurringLineQuantity,
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
