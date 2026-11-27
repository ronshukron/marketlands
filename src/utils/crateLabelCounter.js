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

// ---- Where the carton counter starts, and when it may move on its own ----
// The counter on a station is the NEXT carton number to print. It must never
// print a number that was already printed for the order, on this station or
// another one, so it starts after the order's stored carton count.

const positiveIndex = (raw) => {
  const value = Math.floor(Number(raw && typeof raw === 'object' ? raw.index : raw) || 0);
  return value > 0 ? value : 0;
};

/**
 * The next carton number when an order is opened on a station.
 * @param {Object} params
 * @param {Object|number|null} params.local this station's saved counter ({index})
 * @param {Object|number|null} params.draft the realtime draft's counter ({index})
 * @param {number} params.packedCartonCount cartons already printed for the order (customerOrdersDelayed)
 * @return {number}
 */
export function initialCrateIndex({ local = null, draft = null, packedCartonCount = 0 } = {}) {
  return Math.max(1, positiveIndex(local), positiveIndex(draft), normalizePackedCartonCount(packedCartonCount) + 1);
}

/**
 * What the remote side says the next number is: the draft's counter and the
 * stored count + 1. Used to notice another station moving the order forward.
 */
export function remoteCrateState({ draft = null, packedCartonCount = 0 } = {}) {
  return {
    draftIndex: positiveIndex(draft),
    packedNext: normalizePackedCartonCount(packedCartonCount) + 1,
  };
}

/**
 * A late update moves the counter forward only. A value that went down (this
 * worker lowered the counter to reprint a label) or did not change is ignored,
 * so a slow snapshot can never rewind the counter and never undo a manual edit.
 * @param {Object} params
 * @param {number} params.current the counter shown now
 * @param {{draftIndex: number, packedNext: number}|null} params.previous last remote state seen
 * @param {{draftIndex: number, packedNext: number}} params.next remote state now
 * @return {number}
 */
export function crateIndexAfterRemoteChange({ current, previous, next }) {
  const shown = Math.max(1, positiveIndex(current));
  if (!next) return shown;
  const before = previous || { draftIndex: 0, packedNext: 1 };
  let candidate = 0;
  if (next.draftIndex > before.draftIndex) candidate = Math.max(candidate, next.draftIndex);
  if (next.packedNext > before.packedNext) candidate = Math.max(candidate, next.packedNext);
  return Math.max(shown, candidate);
}

/**
 * Cartons known to be printed for an order: the stored count, the last label
 * this station printed, and a count still waiting to be saved (offline).
 */
export function printedCartonCount({ packedCartonCount = 0, rawPackedCartonCount = 0, lastPrinted = 0, pendingIndex = 0 } = {}) {
  return Math.max(
    normalizePackedCartonCount(packedCartonCount),
    normalizePackedCartonCount(rawPackedCartonCount),
    normalizePackedCartonCount(lastPrinted),
    normalizePackedCartonCount(pendingIndex),
  );
}

/**
 * The carton field while the worker types: digits only, empty allowed.
 * Committing an empty or zero value keeps the previous number.
 */
export function sanitizeCrateInput(raw) {
  return String(raw === null || raw === undefined ? '' : raw).replace(/\D/g, '').slice(0, 3);
}

export function commitCrateInput(raw, previous) {
  const value = Math.floor(Number(sanitizeCrateInput(raw)) || 0);
  return value > 0 ? value : Math.max(1, positiveIndex(previous));
}
