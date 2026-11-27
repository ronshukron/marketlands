import {
  cartonLabelText,
  commitCrateInput,
  crateIndexAfterRemoteChange,
  initialCrateIndex,
  printedCartonCount,
  remoteCrateState,
  sanitizeCrateInput,
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

describe('initialCrateIndex: where the counter starts when an order is opened', () => {
  test('a new order starts at 1', () => {
    expect(initialCrateIndex({})).toBe(1);
  });

  test('starts after the cartons already printed for the order, on any station', () => {
    // Another station printed 3; this station never saw the order.
    expect(initialCrateIndex({ local: null, draft: null, packedCartonCount: 3 })).toBe(4);
    // Order reopened after charge: the draft was cleared, the stored count remains.
    expect(initialCrateIndex({ local: null, draft: null, packedCartonCount: 2 })).toBe(3);
  });

  test('takes the highest of this station, the draft and the stored count', () => {
    expect(initialCrateIndex({ local: { index: 5 }, draft: { index: 2 }, packedCartonCount: 1 })).toBe(5);
    expect(initialCrateIndex({ local: { index: 2 }, draft: { index: 4 }, packedCartonCount: 1 })).toBe(4);
    expect(initialCrateIndex({ local: { index: 2 }, draft: null, packedCartonCount: 6 })).toBe(7);
  });
});

describe('crateIndexAfterRemoteChange: late updates move the counter forward only', () => {
  const state = (draftIndex, packed) => remoteCrateState({ draft: { index: draftIndex }, packedCartonCount: packed });

  test('another station printed: the counter moves past it', () => {
    expect(crateIndexAfterRemoteChange({ current: 2, previous: state(2, 1), next: state(2, 3) })).toBe(4);
    expect(crateIndexAfterRemoteChange({ current: 2, previous: state(2, 1), next: state(5, 1) })).toBe(5);
  });

  test('a late, older snapshot never rewinds the counter', () => {
    expect(crateIndexAfterRemoteChange({ current: 4, previous: state(4, 3), next: state(2, 3) })).toBe(4);
    expect(crateIndexAfterRemoteChange({ current: 4, previous: state(4, 3), next: state(4, 3) })).toBe(4);
  });

  test('a worker who lowered the counter to reprint keeps it until something new is printed elsewhere', () => {
    // Printed 1..5 here; the worker sets 2 to reprint a torn label. Nothing remote increased.
    expect(crateIndexAfterRemoteChange({ current: 2, previous: state(6, 5), next: state(2, 5) })).toBe(2);
    // Then another station prints carton 6.
    expect(crateIndexAfterRemoteChange({ current: 2, previous: state(2, 5), next: state(2, 6) })).toBe(7);
  });
});

describe('printedCartonCount', () => {
  test('the highest known: stored, last printed here, or waiting to be saved', () => {
    expect(printedCartonCount({})).toBe(0);
    expect(printedCartonCount({ packedCartonCount: 2, rawPackedCartonCount: 1 })).toBe(2);
    expect(printedCartonCount({ packedCartonCount: 2, lastPrinted: 3 })).toBe(3);
    expect(printedCartonCount({ packedCartonCount: 2, pendingIndex: 4 })).toBe(4);
  });
});

describe('carton field input', () => {
  test('keeps digits only while typing and allows an empty field', () => {
    expect(sanitizeCrateInput('')).toBe('');
    expect(sanitizeCrateInput('1a2')).toBe('12');
    expect(sanitizeCrateInput('-3')).toBe('3');
    expect(sanitizeCrateInput('12345')).toBe('123');
  });

  test('committing empty or zero keeps the previous number', () => {
    expect(commitCrateInput('', 4)).toBe(4);
    expect(commitCrateInput('0', 4)).toBe(4);
    expect(commitCrateInput('7', 4)).toBe(7);
  });
});
