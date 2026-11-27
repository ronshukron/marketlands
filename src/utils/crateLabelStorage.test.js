import {
  addPendingCartonSync,
  readCrateLabel,
  readPendingCartonSyncs,
  removePendingCartonSync,
  writeCrateLabel,
} from './crateLabelStorage';

beforeEach(() => localStorage.clear());

describe('station carton counter', () => {
  test('saves the next number; the last printed carton only grows', () => {
    writeCrateLabel('o1', { index: 2, lastPrinted: 1 });
    expect(readCrateLabel('o1')).toEqual({ index: 2, lastPrinted: 1 });
    // A manual edit down to 1 (reprint) keeps what was printed.
    writeCrateLabel('o1', { index: 1 });
    expect(readCrateLabel('o1')).toEqual({ index: 1, lastPrinted: 1 });
    writeCrateLabel('o1', { index: 4, lastPrinted: 3 });
    writeCrateLabel('o1', { index: 3, lastPrinted: 2 });
    expect(readCrateLabel('o1')).toEqual({ index: 3, lastPrinted: 3 });
  });

  test('entries written before lastPrinted existed still read', () => {
    localStorage.setItem('deliveryV7::crateLabel', JSON.stringify({ old: { index: 3 } }));
    expect(readCrateLabel('old')).toEqual({ index: 3 });
    expect(readCrateLabel('missing')).toBeNull();
  });
});

describe('carton counts waiting to be saved', () => {
  test('keeps the highest printed carton per order', () => {
    addPendingCartonSync('o1', { printedIndex: 2, loadingOrder: 7 });
    addPendingCartonSync('o1', { printedIndex: 1 });
    expect(readPendingCartonSyncs().o1).toEqual(expect.objectContaining({ printedIndex: 2, loadingOrder: 7 }));
  });

  test('is removed only once a count at least as high was saved', () => {
    addPendingCartonSync('o1', { printedIndex: 3 });
    removePendingCartonSync('o1', 2);
    expect(readPendingCartonSyncs().o1).toBeDefined();
    removePendingCartonSync('o1', 3);
    expect(readPendingCartonSyncs().o1).toBeUndefined();
  });

  test('ignores empty input', () => {
    addPendingCartonSync('', { printedIndex: 1 });
    addPendingCartonSync('o2', { printedIndex: 0 });
    expect(readPendingCartonSyncs()).toEqual({});
  });
});
