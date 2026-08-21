import { useCallback, useEffect, useState } from 'react';
import { isElectron } from '../utils/electronDetect';

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
    setIsPrinting(true);
    try {
      const result = await printerAPI.print({
        width: image.width,
        height: image.height,
        data: image.data,
      });
      console.log('[QL-800] print result', result);
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
        await refreshStatus();
      }
      return result || { ok: false, code: 'print_failed' };
    } catch (err) {
      const code = err?.code || 'print_failed';
      setError(code);
      return { ok: false, code, error: code, message: err?.message };
    } finally {
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
