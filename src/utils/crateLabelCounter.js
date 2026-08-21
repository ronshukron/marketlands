export function normalizeCrateLabel(raw = {}) {
  const index = Math.max(1, Math.floor(Number(raw?.index) || 1));
  return { index };
}

export function crateLabelForPrint(current) {
  return normalizeCrateLabel({ index: current });
}

export function crateLabelAfterPrint(current) {
  const printUses = crateLabelForPrint(current);
  return {
    printUses,
    afterPrint: { index: printUses.index + 1 },
  };
}

export function cartonLabelText(index) {
  return `קרטון ${normalizeCrateLabel({ index }).index}#`;
}

export function normalizePackedCartonCount(raw) {
  const count = Math.floor(Number(raw) || 0);
  return count > 0 ? count : 0;
}

export function packedCartonCountAfterPrint(existingCount, printedIndex) {
  const printed = normalizeCrateLabel({ index: printedIndex }).index;
  return Math.max(normalizePackedCartonCount(existingCount), printed);
}

export function packedCartonCustomerTitle(count) {
  const n = normalizePackedCartonCount(count);
  if (n <= 0) return '';
  if (n === 1) return 'יש לך קרטון אחד לאיסוף';
  return `יש לך ${n} קרטונים לאיסוף`;
}
