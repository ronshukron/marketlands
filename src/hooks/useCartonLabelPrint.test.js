import { act, renderHook, waitFor } from '@testing-library/react';
import { resetPrintLockForTests, useBrotherLabelPrinter } from './useBrotherLabelPrinter';
import { useCartonLabelPrint, useCrateCounterField } from './useCartonLabelPrint';
import { readCrateLabel, readPendingCartonSyncs } from '../utils/crateLabelStorage';
import { readPrintAttempts } from '../utils/printAttemptLog';

// The station as the screens build it: the real printer hook talking to a fake
// window.electron.printer, the shared print flow, and the carton field.

const t = {
  printOk: (n) => `printed ${n}`,
  packedCartonSyncFailed: 'count not saved',
  printerError: (code) => `error ${code}`,
  printerBrowserHint: 'desktop only',
};

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};

let fakePrinter;
let unsubscribeError;

function useStation({ orderId = 'o1', draftCrateLabel = null, packedCartonCount = 0, deps }) {
  const printer = useBrotherLabelPrinter();
  const carton = useCartonLabelPrint({
    printImage: printer.printImage,
    hasPrinterSupport: printer.hasPrinterSupport,
    saveTimeoutMs: 40,
    t,
    ...deps,
  });
  const counter = useCrateCounterField({
    orderId,
    draftCrateLabel,
    printedCount: carton.getPrintedCartonCount(orderId ? { id: orderId, packedCartonCount } : null),
    saveDraftCrateLabel: deps.saveDraftCrateLabel,
  });
  return { printer, carton, counter };
}

const makeDeps = () => ({
  syncPackedCount: jest.fn(async ({ printedIndex }) => ({ ok: true, packedCartonCount: printedIndex })),
  saveDraftCrateLabel: jest.fn(async () => {}),
  onPackedCount: jest.fn(),
  confirmLabelOut: jest.fn(async () => true),
  notify: jest.fn(),
});

const mount = (props) => renderHook((current) => useStation(current), { initialProps: props });

// What the screen's print button does.
const pressPrint = (result) => result.current.carton.printCarton({
  orderId: 'o1',
  carton: result.current.counter.commitInput(),
  buildImage: (n) => ({ width: 1, height: 1, data: [n] }),
  onAdvanced: ({ orderId, next }) => result.current.counter.setAfterPrint(orderId, next),
});

beforeEach(() => {
  localStorage.clear();
  resetPrintLockForTests();
  unsubscribeError = jest.fn();
  fakePrinter = {
    getStatus: jest.fn(async () => ({ connected: true })),
    print: jest.fn(async () => ({ ok: true, dataSent: true })),
    onError: jest.fn(() => unsubscribeError),
  };
  window.electron = { printer: fakePrinter };
});

afterEach(() => {
  delete window.electron;
});

test('success: one label, counter moves on, count saved, attempt logged', async () => {
  const deps = makeDeps();
  const { result } = mount({ deps });
  await waitFor(() => expect(fakePrinter.getStatus).toHaveBeenCalled());
  expect(result.current.counter.crateIndex).toBe(1);

  let outcome;
  await act(async () => { outcome = await pressPrint(result); });

  expect(outcome).toEqual(expect.objectContaining({ ok: true, printed: 1, next: 2, countSaved: true }));
  expect(fakePrinter.print).toHaveBeenCalledTimes(1);
  expect(fakePrinter.print.mock.calls[0][0].data).toEqual([1]);
  expect(result.current.counter.crateIndex).toBe(2);
  expect(deps.syncPackedCount).toHaveBeenCalledWith({ orderId: 'o1', printedIndex: 1, loadingOrder: null });
  expect(deps.saveDraftCrateLabel).toHaveBeenCalledWith('o1', { index: 2 });
  expect(deps.onPackedCount).toHaveBeenCalledWith('o1', 1);
  expect(deps.notify).toHaveBeenCalledWith('printed 1', 2500);
  expect(readCrateLabel('o1')).toEqual({ index: 2, lastPrinted: 1 });
  expect(readPrintAttempts()[0]).toEqual(expect.objectContaining({ orderId: 'o1', carton: 1, code: 'ok', sync: 'saved' }));
  expect(result.current.carton.busy).toBe(false);
});

test('failure: the number is not used up and the worker sees why', async () => {
  fakePrinter.print.mockImplementation(async () => ({ ok: false, code: 'no_media', dataSent: false }));
  const deps = makeDeps();
  const { result } = mount({ deps });

  await act(async () => { await pressPrint(result); });

  expect(result.current.counter.crateIndex).toBe(1);
  expect(deps.syncPackedCount).not.toHaveBeenCalled();
  expect(deps.notify).toHaveBeenCalledWith('error no_media', 8000);
  expect(readPrintAttempts()[0]).toEqual(expect.objectContaining({ carton: 1, code: 'no_media' }));
});

describe('timeout from the printer', () => {
  test('after all data was sent: ask the worker; "yes" counts as printed', async () => {
    fakePrinter.print.mockImplementation(async () => ({ ok: false, code: 'timeout', dataSent: true }));
    const deps = makeDeps();
    const { result } = mount({ deps });

    await act(async () => { await pressPrint(result); });

    expect(deps.confirmLabelOut).toHaveBeenCalledWith({ orderId: 'o1', carton: 1 });
    expect(result.current.counter.crateIndex).toBe(2);
    expect(deps.syncPackedCount).toHaveBeenCalledWith(expect.objectContaining({ printedIndex: 1 }));
    expect(readPrintAttempts()[0].code).toBe('ok_confirmed');
  });

  test('"no": nothing advances and the same number prints next time', async () => {
    fakePrinter.print.mockImplementation(async () => ({ ok: false, code: 'timeout', dataSent: true }));
    const deps = makeDeps();
    deps.confirmLabelOut.mockImplementation(async () => false);
    const { result } = mount({ deps });

    await act(async () => { await pressPrint(result); });

    expect(result.current.counter.crateIndex).toBe(1);
    expect(deps.notify).toHaveBeenCalledWith('error timeout', 8000);
    expect(deps.syncPackedCount).not.toHaveBeenCalled();
  });

  test('before the data was sent: no question, just the error', async () => {
    fakePrinter.print.mockImplementation(async () => ({ ok: false, code: 'timeout', dataSent: false }));
    const deps = makeDeps();
    const { result } = mount({ deps });

    await act(async () => { await pressPrint(result); });

    expect(deps.confirmLabelOut).not.toHaveBeenCalled();
    expect(result.current.counter.crateIndex).toBe(1);
  });
});

test('double press: five fast taps print one label with one number', async () => {
  const gate = deferred();
  fakePrinter.print.mockImplementation(() => gate.promise);
  const deps = makeDeps();
  const { result } = mount({ deps });

  let outcomes;
  await act(async () => {
    const taps = [1, 2, 3, 4, 5].map(() => pressPrint(result));
    gate.resolve({ ok: true, dataSent: true });
    outcomes = await Promise.all(taps);
  });

  expect(fakePrinter.print).toHaveBeenCalledTimes(1);
  expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
  expect(outcomes.filter((outcome) => outcome.ignored)).toHaveLength(4);
  expect(result.current.counter.crateIndex).toBe(2);
  expect(deps.syncPackedCount).toHaveBeenCalledTimes(1);
});

test('a test print from the printer panel in flight: the carton print is ignored, not queued', async () => {
  const gate = deferred();
  fakePrinter.print.mockImplementation(() => gate.promise);
  const deps = makeDeps();
  const { result } = mount({ deps });

  let panelPrint;
  let outcome;
  await act(async () => {
    panelPrint = result.current.printer.printImage({ width: 1, height: 1, data: [0] });
    outcome = await pressPrint(result);
    gate.resolve({ ok: true });
    await panelPrint;
  });

  expect(outcome).toEqual(expect.objectContaining({ ok: false, ignored: true }));
  expect(fakePrinter.print).toHaveBeenCalledTimes(1);
  expect(deps.notify).not.toHaveBeenCalled();
  expect(result.current.counter.crateIndex).toBe(1);
});

test('slow saves: the worker is told at once, the button stays locked until the saves end or time out', async () => {
  const deps = { ...makeDeps(), saveTimeoutMs: 600 };
  deps.syncPackedCount.mockImplementation(() => new Promise(() => {}));
  deps.saveDraftCrateLabel.mockImplementation(() => new Promise(() => {}));
  const { result } = mount({ deps });

  let printing;
  act(() => { printing = pressPrint(result); });
  await waitFor(() => expect(deps.notify).toHaveBeenCalledWith('printed 1', 2500));
  expect(result.current.counter.crateIndex).toBe(2);
  expect(result.current.carton.phase).toBe('saving');
  expect(result.current.carton.busy).toBe(true);

  // A tap while saving does nothing.
  let extra;
  await act(async () => { extra = await pressPrint(result); });
  expect(extra).toEqual(expect.objectContaining({ ignored: true }));
  expect(fakePrinter.print).toHaveBeenCalledTimes(1);

  let outcome;
  await act(async () => { outcome = await printing; });
  expect(outcome).toEqual(expect.objectContaining({ ok: true, countSaved: false }));
  expect(result.current.carton.busy).toBe(false);
  expect(readPendingCartonSyncs().o1).toEqual(expect.objectContaining({ printedIndex: 1 }));
  expect(deps.notify).toHaveBeenLastCalledWith('printed 1. count not saved', 6000);
});

test('offline count save: shown locally, kept on the station, saved when back online', async () => {
  const deps = makeDeps();
  deps.syncPackedCount.mockImplementation(async () => { throw new Error('unavailable'); });
  const { result } = mount({ deps });

  await act(async () => { await pressPrint(result); });
  expect(deps.onPackedCount).toHaveBeenCalledWith('o1', 1);
  expect(readPendingCartonSyncs().o1.printedIndex).toBe(1);
  expect(readPrintAttempts()[0].sync).toBe('pending');
  // The charge reads the printed count from the station meanwhile.
  expect(result.current.carton.getPrintedCartonCount({ id: 'o1', packedCartonCount: 0 })).toBe(1);

  deps.syncPackedCount.mockImplementation(async ({ printedIndex }) => ({ ok: true, packedCartonCount: printedIndex }));
  deps.onPackedCount.mockClear();
  await act(async () => { window.dispatchEvent(new Event('online')); });

  await waitFor(() => expect(readPendingCartonSyncs().o1).toBeUndefined());
  expect(deps.syncPackedCount).toHaveBeenLastCalledWith({ orderId: 'o1', printedIndex: 1, loadingOrder: null });
  expect(deps.onPackedCount).toHaveBeenCalledWith('o1', 1);
  expect(readPrintAttempts()[0].sync).toBe('saved');
});

describe('the carton field', () => {
  test('a second station printed: the counter starts after it and follows it forward', async () => {
    const deps = makeDeps();
    const { result, rerender } = mount({ deps, packedCartonCount: 3 });
    expect(result.current.counter.crateIndex).toBe(4);

    rerender({ deps, packedCartonCount: 5 });
    expect(result.current.counter.crateIndex).toBe(6);

    await act(async () => { await pressPrint(result); });
    expect(fakePrinter.print.mock.calls[0][0].data).toEqual([6]);
  });

  test('a late, older draft does not rewind it', () => {
    const deps = makeDeps();
    const { result, rerender } = mount({ deps, draftCrateLabel: { index: 4 } });
    expect(result.current.counter.crateIndex).toBe(4);
    rerender({ deps, draftCrateLabel: { index: 2 } });
    expect(result.current.counter.crateIndex).toBe(4);
  });

  test('typing keeps the raw text; the number is applied on commit and saved to the draft', () => {
    const deps = makeDeps();
    const { result, rerender } = mount({ deps, packedCartonCount: 5 });
    expect(result.current.counter.crateIndex).toBe(6);

    act(() => result.current.counter.onInputChange(''));
    expect(result.current.counter.inputValue).toBe('');
    expect(result.current.counter.crateIndex).toBe(6);

    // Reprint a torn label: carton 2.
    act(() => result.current.counter.onInputChange('2'));
    act(() => { result.current.counter.commitInput(); });
    expect(result.current.counter.crateIndex).toBe(2);
    expect(deps.saveDraftCrateLabel).toHaveBeenCalledWith('o1', { index: 2 });
    expect(readCrateLabel('o1').index).toBe(2);

    // Its own draft coming back does not push it up again.
    rerender({ deps, packedCartonCount: 5, draftCrateLabel: { index: 2 } });
    expect(result.current.counter.crateIndex).toBe(2);
  });

  test('an empty field committed keeps the previous number', () => {
    const deps = makeDeps();
    const { result } = mount({ deps });
    act(() => result.current.counter.onInputChange(''));
    let used;
    act(() => { used = result.current.counter.commitInput(); });
    expect(used).toBe(1);
    expect(result.current.counter.inputValue).toBe('1');
    expect(deps.saveDraftCrateLabel).not.toHaveBeenCalled();
  });

  test('a print that ends after the worker opened another order does not touch the new order', async () => {
    const gate = deferred();
    fakePrinter.print.mockImplementation(() => gate.promise);
    const deps = makeDeps();
    const { result, rerender } = mount({ deps, orderId: 'o1' });

    let printing;
    act(() => { printing = pressPrint(result); });
    rerender({ deps, orderId: 'o2' });
    await act(async () => {
      gate.resolve({ ok: true, dataSent: true });
      await printing;
    });

    expect(result.current.counter.crateIndex).toBe(1);
    expect(readCrateLabel('o1')).toEqual({ index: 2, lastPrinted: 1 });
  });
});

test('the printer error listener is removed when the screen closes', () => {
  const { unmount } = mount({ deps: makeDeps() });
  expect(fakePrinter.onError).toHaveBeenCalled();
  unmount();
  expect(unsubscribeError).toHaveBeenCalled();
});
