import { buildGrowInvoiceItem } from './growInvoiceUtils';

describe('buildGrowInvoiceItem', () => {
  test('sends a fractional kg amount as one Grow line and keeps the weight in its description', () => {
    expect(buildGrowInvoiceItem({
      name: 'עגבניות אשכולות',
      quantity: 0.5,
      measurementType: 'kg',
    })).toEqual({
      quantity: 1,
      description: 'עגבניות אשכולות - 0.5 ק"ג',
    });
  });

  test('preserves whole quantities while describing the ordered kg amount', () => {
    expect(buildGrowInvoiceItem({
      name: 'פלפל אדום',
      quantity: 2,
      measurementType: 'kg',
    })).toEqual({
      quantity: 2,
      description: 'פלפל אדום - 2 ק"ג',
    });
  });

  test('does not add a kg label to packaged products', () => {
    expect(buildGrowInvoiceItem({
      name: 'מארז ירקות',
      quantity: 1,
      measurementType: 'package',
    })).toEqual({
      quantity: 1,
      description: 'מארז ירקות',
    });
  });
});
