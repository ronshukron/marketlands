import {
  cartonLabelText,
  crateLabelAfterPrint,
  crateLabelForPrint,
  normalizeCrateLabel,
  packedCartonCountAfterPrint,
  packedCartonCustomerTitle,
} from './crateLabelCounter';

describe('normalizeCrateLabel', () => {
  test('defaults to 1', () => {
    expect(normalizeCrateLabel()).toEqual({ index: 1 });
    expect(normalizeCrateLabel({})).toEqual({ index: 1 });
  });

  test('clamps below 1 and non-numeric values', () => {
    expect(normalizeCrateLabel({ index: 0 })).toEqual({ index: 1 });
    expect(normalizeCrateLabel({ index: 'x' })).toEqual({ index: 1 });
  });

  test('ignores leftover total from older labels', () => {
    expect(normalizeCrateLabel({ index: 4, total: 2 })).toEqual({ index: 4 });
  });
});

describe('crateLabelAfterPrint', () => {
  test('prints 1 then becomes 2', () => {
    expect(crateLabelAfterPrint(1)).toEqual({
      printUses: { index: 1 },
      afterPrint: { index: 2 },
    });
  });

  test('prints an edited number then advances by one', () => {
    expect(crateLabelForPrint(3)).toEqual({ index: 3 });
    expect(crateLabelAfterPrint(3)).toEqual({
      printUses: { index: 3 },
      afterPrint: { index: 4 },
    });
  });
});

describe('cartonLabelText', () => {
  test('formats Hebrew carton number', () => {
    expect(cartonLabelText(1)).toBe('קרטון 1#');
    expect(cartonLabelText(2)).toBe('קרטון 2#');
  });
});

describe('packedCartonCountAfterPrint', () => {
  test('uses the printed carton number', () => {
    expect(packedCartonCountAfterPrint(0, 1)).toBe(1);
    expect(packedCartonCountAfterPrint(1, 2)).toBe(2);
    expect(packedCartonCountAfterPrint(2, 3)).toBe(3);
  });

  test('does not decrease when a lower carton is reprinted', () => {
    expect(packedCartonCountAfterPrint(3, 2)).toBe(3);
  });
});

describe('packedCartonCustomerTitle', () => {
  test('returns empty when there are no cartons yet', () => {
    expect(packedCartonCustomerTitle(0)).toBe('');
  });

  test('uses singular and plural Hebrew copy', () => {
    expect(packedCartonCustomerTitle(1)).toBe('יש לך קרטון אחד לאיסוף');
    expect(packedCartonCustomerTitle(3)).toBe('יש לך 3 קרטונים לאיסוף');
  });
});
