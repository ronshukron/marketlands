import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addPendingCartonSync,
  readCrateLabel,
  readPendingCartonSyncs,
  removePendingCartonSync,
  writeCrateLabel,
} from '../utils/crateLabelStorage';
import {
  commitCrateInput,
  crateIndexAfterRemoteChange,
  initialCrateIndex,
  printedCartonCount,
  remoteCrateState,
  sanitizeCrateInput,
} from '../utils/crateLabelCounter';
import { appendPrintAttempt, markPrintAttemptSync } from '../utils/printAttemptLog';

// Carton labels on the packing stations (V7, and V8's two print paths).
// One place for: the lock against double taps, the carton number a print uses,
// saving the count the customer sees, and retrying that save after a network drop.

export const DEFAULT_SAVE_TIMEOUT_MS = 8000;
const RETRY_INTERVAL_MS = 60 * 1000;
const PENDING_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function withTimeout(work, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('save_timeout');
      error.code = 'save_timeout';
      reject(error);
    }, ms);
    Promise.resolve()
      .then(work)
      .then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

/**
 * @param {Object} options
 * @param {Function} options.printImage from useBrotherLabelPrinter
 * @param {boolean} options.hasPrinterSupport
 * @param {Function} options.syncPackedCount ({orderId, printedIndex, loadingOrder}) => Promise<{packedCartonCount}>
 * @param {Function} [options.saveDraftCrateLabel] (orderId, {index}) => Promise, the realtime draft
 * @param {Function} [options.onPackedCount] (orderId, count) the screen's order state
 * @param {Function} [options.confirmLabelOut] ({orderId, carton}) => Promise<boolean>, asked after a timeout once all data was sent
 * @param {Function} options.notify (message, ms) toast
 * @param {Object} options.t printOk, packedCartonSyncFailed, printerError, printerBrowserHint
 * @param {number} [options.saveTimeoutMs]
 */
export function useCartonLabelPrint(options) {
  const latest = useRef(options);
  latest.current = options;
  const lockRef = useRef(false);
  const flushingRef = useRef(false);
  const [phase, setPhase] = useState('');

  const getPrintedCartonCount = useCallback((order) => {
    if (!order?.id) return 0;
    const local = readCrateLabel(order.id);
    const pending = readPendingCartonSyncs()[order.id];
    return printedCartonCount({
      packedCartonCount: order.packedCartonCount,
      rawPackedCartonCount: order.rawData?.packedCartonCount,
      lastPrinted: local?.lastPrinted,
      pendingIndex: pending?.printedIndex,
    });
  }, []);

  /** The next carton number for an order that is not open in the counter field. */
  const nextCartonFor = useCallback((order, draftCrateLabel = null) => initialCrateIndex({
    local: readCrateLabel(order?.id),
    draft: draftCrateLabel,
    packedCartonCount: getPrintedCartonCount(order),
  }), [getPrintedCartonCount]);

  const flushPendingCartonSyncs = useCallback(async () => {
    if (flushingRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const entries = Object.entries(readPendingCartonSyncs());
    if (entries.length === 0) return;
    flushingRef.current = true;
    const deps = latest.current;
    const timeoutMs = deps.saveTimeoutMs || DEFAULT_SAVE_TIMEOUT_MS;
    try {
      for (const [orderId, entry] of entries) {
        const age = Date.now() - Date.parse(entry.atIso || '');
        if (Number.isFinite(age) && age > PENDING_MAX_AGE_MS) {
          removePendingCartonSync(orderId, Number.MAX_SAFE_INTEGER);
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          const saved = await withTimeout(() => deps.syncPackedCount({
            orderId,
            printedIndex: entry.printedIndex,
            loadingOrder: entry.loadingOrder || null,
          }), timeoutMs);
          const count = Math.max(Number(entry.printedIndex) || 0, Number(saved?.packedCartonCount) || 0);
          removePendingCartonSync(orderId, count);
          markPrintAttemptSync(orderId, entry.printedIndex, 'saved');
          if (deps.onPackedCount) deps.onPackedCount(orderId, count);
        } catch (error) {
          // Still offline or the server is slow: try again on the next round.
          break;
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, []);

  useEffect(() => {
    flushPendingCartonSyncs();
    const onOnline = () => { flushPendingCartonSyncs(); };
    window.addEventListener('online', onOnline);
    const timer = setInterval(onOnline, RETRY_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, [flushPendingCartonSyncs]);

  /**
   * Print one carton label.
   * @param {Object} params
   * @param {string} params.orderId
   * @param {number} params.carton the number to print
   * @param {number|null} [params.loadingOrder]
   * @param {Function} params.buildImage (carton) => raster image
   * @param {Function} [params.onAdvanced] ({orderId, printed, next}) right after the printer confirmed
   * @return {Promise<Object>} {ok, printed, next} or {ok: false, code, ignored?}
   */
  const printCarton = useCallback(async ({ orderId, carton, loadingOrder = null, buildImage, onAdvanced }) => {
    const deps = latest.current;
    // Synchronous: a second tap in the same frame sees it before any re-render.
    if (lockRef.current) return { ok: false, code: 'already_printing', ignored: true };
    if (!deps.hasPrinterSupport) {
      deps.notify(deps.t.printerBrowserHint);
      return { ok: false, code: 'no_electron' };
    }
    lockRef.current = true;
    setPhase('printing');
    const printed = Math.max(1, Math.floor(Number(carton) || 1));
    const startedAt = Date.now();
    try {
      let result;
      try {
        result = await deps.printImage(buildImage(printed));
      } catch (error) {
        result = { ok: false, code: error?.code || 'print_failed', message: error?.message };
      }
      result = result || { ok: false, code: 'print_failed' };
      // The printer panel's test print is on its way: nothing was printed here.
      if (!result.ok && result.ignored) return result;

      let confirmedByWorker = false;
      if (!result.ok && result.code === 'timeout' && result.dataSent && deps.confirmLabelOut) {
        confirmedByWorker = (await deps.confirmLabelOut({ orderId, carton: printed })) === true;
      }
      const ok = result.ok === true || confirmedByWorker;
      let logCode = result.code || 'print_failed';
      if (result.ok) logCode = 'ok';
      else if (confirmedByWorker) logCode = 'ok_confirmed';
      appendPrintAttempt({ orderId, carton: printed, code: logCode, durationMs: Date.now() - startedAt });

      if (!ok) {
        deps.notify(deps.t.printerError(result.code || result.error, result.message), 8000);
        return { ok: false, code: result.code || 'print_failed' };
      }

      // The label is out: move the counter and tell the worker at once.
      const next = printed + 1;
      writeCrateLabel(orderId, { index: next, lastPrinted: printed });
      if (onAdvanced) onAdvanced({ orderId, printed, next });
      deps.notify(deps.t.printOk(printed), 2500);

      // Then save, without making the worker wait more than the timeout.
      setPhase('saving');
      const timeoutMs = deps.saveTimeoutMs || DEFAULT_SAVE_TIMEOUT_MS;
      const [draftSave, countSave] = await Promise.allSettled([
        withTimeout(() => (deps.saveDraftCrateLabel ? deps.saveDraftCrateLabel(orderId, { index: next }) : null), timeoutMs),
        withTimeout(() => deps.syncPackedCount({ orderId, printedIndex: printed, loadingOrder }), timeoutMs),
      ]);
      if (draftSave.status === 'rejected') {
        console.warn('[carton label] draft counter not saved', draftSave.reason?.message || draftSave.reason);
      }
      if (countSave.status === 'fulfilled') {
        const count = Math.max(printed, Number(countSave.value?.packedCartonCount) || 0);
        removePendingCartonSync(orderId, count);
        markPrintAttemptSync(orderId, printed, 'saved');
        if (deps.onPackedCount) deps.onPackedCount(orderId, count);
        return { ok: true, printed, next, countSaved: true };
      }
      // Offline or slow: keep the count on the station, show it locally, retry later.
      addPendingCartonSync(orderId, { printedIndex: printed, loadingOrder });
      markPrintAttemptSync(orderId, printed, 'pending');
      if (deps.onPackedCount) deps.onPackedCount(orderId, printed);
      deps.notify(`${deps.t.printOk(printed)}. ${deps.t.packedCartonSyncFailed}`, 6000);
      return { ok: true, printed, next, countSaved: false };
    } finally {
      lockRef.current = false;
      setPhase('');
    }
  }, []);

  return useMemo(() => ({
    printCarton,
    phase,
    busy: phase !== '',
    getPrintedCartonCount,
    nextCartonFor,
    flushPendingCartonSyncs,
  }), [flushPendingCartonSyncs, getPrintedCartonCount, nextCartonFor, phase, printCarton]);
}

/**
 * The carton number field of the order open on the station.
 * Starts after everything already printed for the order; moves forward when
 * another station prints; a worker's edit is kept as typed until Enter or
 * leaving the field, then saved on the station and in the draft.
 * @param {Object} params
 * @param {string|null} params.orderId
 * @param {Object|null} params.draftCrateLabel the realtime draft's crateLabel
 * @param {number} params.printedCount useCartonLabelPrint().getPrintedCartonCount(order)
 * @param {Function} [params.saveDraftCrateLabel] (orderId, {index}) => Promise
 */
export function useCrateCounterField({ orderId, draftCrateLabel = null, printedCount = 0, saveDraftCrateLabel }) {
  const [crateIndex, setCrateIndex] = useState(1);
  const [inputValue, setInputValue] = useState('1');
  const indexRef = useRef(1);
  const inputRef = useRef('1');
  const remoteRef = useRef({ orderId: null, state: null });
  const saveRef = useRef(saveDraftCrateLabel);
  saveRef.current = saveDraftCrateLabel;

  const apply = useCallback((value) => {
    indexRef.current = value;
    inputRef.current = String(value);
    setCrateIndex(value);
    setInputValue(String(value));
  }, []);

  const remote = remoteCrateState({ draft: draftCrateLabel, packedCartonCount: printedCount });
  const { draftIndex, packedNext } = remote;

  useEffect(() => {
    const state = { draftIndex, packedNext };
    if (!orderId) {
      remoteRef.current = { orderId: null, state: null };
      apply(1);
      return;
    }
    if (remoteRef.current.orderId !== orderId) {
      remoteRef.current = { orderId, state };
      apply(initialCrateIndex({ local: readCrateLabel(orderId), draft: { index: draftIndex }, packedCartonCount: packedNext - 1 }));
      return;
    }
    const next = crateIndexAfterRemoteChange({ current: indexRef.current, previous: remoteRef.current.state, next: state });
    remoteRef.current = { orderId, state };
    if (next !== indexRef.current) {
      apply(next);
      writeCrateLabel(orderId, { index: next });
    }
  }, [apply, draftIndex, orderId, packedNext]);

  const onInputChange = useCallback((raw) => {
    const clean = sanitizeCrateInput(raw);
    inputRef.current = clean;
    setInputValue(clean);
  }, []);

  /** Apply what the worker typed; returns the carton number to use. */
  const commitInput = useCallback(() => {
    const value = commitCrateInput(inputRef.current, indexRef.current);
    const changed = value !== indexRef.current;
    apply(value);
    const currentOrderId = remoteRef.current.orderId;
    if (changed && currentOrderId) {
      writeCrateLabel(currentOrderId, { index: value });
      if (saveRef.current) {
        const warn = (error) => console.warn('[carton label] draft counter not saved', error?.message || error);
        try {
          Promise.resolve(saveRef.current(currentOrderId, { index: value })).catch(warn);
        } catch (error) {
          warn(error);
        }
      }
    }
    return value;
  }, [apply]);

  /** After a print of this order: show the next number (ignored if the worker moved on). */
  const setAfterPrint = useCallback((printedOrderId, next) => {
    if (remoteRef.current.orderId !== printedOrderId) return;
    apply(next);
  }, [apply]);

  return useMemo(() => ({
    crateIndex,
    inputValue,
    onInputChange,
    commitInput,
    setAfterPrint,
  }), [commitInput, crateIndex, inputValue, onInputChange, setAfterPrint]);
}
