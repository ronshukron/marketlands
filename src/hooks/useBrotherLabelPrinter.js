import { useCallback, useEffect, useState } from 'react';
import { isElectron } from '../utils/electronDetect';

// One QL-800 per station. Every component that prints (the weighing screen,
// the printer panel's test print) shares this flag, so a second print request
// while one is on its way is ignored instead of queued behind it. It is a
// plain variable, not state, so two taps in the same frame both see it.
let printInFlight = false;

/** For tests only. */
export function resetPrintLockForTests() {
  printInFlight = false;
}

export function useBrotherLabelPrinter() {
  const printerAPI = isElectron() && window.electron?.printer ? window.electron.printer : null;
  const [status, setStatus] = useState({
    connected: false,
    mediaLoaded: false,
    mediaWidthMm: 0,
    twoColor: false,
    editorLite: false,
    error: null,
    errors: [],
  });
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState(null);

  const refreshStatus = useCallback(async () => {
    if (!printerAPI) return null;
    try {
      const next = await printerAPI.getStatus();
      setStatus(next || { connected: false });
      if (next?.error && next.error !== 'busy') setError(next.error);
      else setError(null);
      return next;
    } catch (err) {
      const code = err?.code || err?.message || 'print_failed';
      setError(code);
      setStatus((prev) => ({ ...prev, connected: false, error: code }));
      return null;
    }
  }, [printerAPI]);

  useEffect(() => {
    if (!printerAPI) return undefined;
    refreshStatus();
    const unsub = printerAPI.onError((payload) => {
      setError(payload?.code || payload?.error || 'print_failed');
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [printerAPI, refreshStatus]);

  const printImage = useCallback(async (image) => {
    if (!printerAPI) {
      return { ok: false, code: 'no_electron', error: 'no_electron' };
    }
    if (printInFlight) {
      return { ok: false, code: 'already_printing', error: 'already_printing', ignored: true };
    }
    printInFlight = true;
    setIsPrinting(true);
    try {
      const result = await printerAPI.print({
        width: image.width,
        height: image.height,
        data: image.data,
      });
      if (!result?.ok) {
        console.error('[QL-800] print failed', result);
        setError(result?.code || result?.error || 'print_failed');
        setStatus((prev) => ({
          ...prev,
          error: result?.code || prev.error,
          message: result?.message || prev.message,
        }));
      } else {
        setError(null);
        // Not awaited: a status read can take seconds (or time out) after the
        // label is already out, and the worker must not wait for it.
        refreshStatus().catch(() => {});
      }
      return result || { ok: false, code: 'print_failed' };
    } catch (err) {
      const code = err?.code || 'print_failed';
      setError(code);
      return { ok: false, code, error: code, message: err?.message };
    } finally {
      printInFlight = false;
      setIsPrinting(false);
    }
  }, [printerAPI, refreshStatus]);

  return {
    hasPrinterSupport: !!printerAPI,
    status,
    isPrinting,
    error,
    refreshStatus,
    printImage,
  };
}
