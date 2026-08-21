import React from 'react';
import { useBrotherLabelPrinter } from '../../hooks/useBrotherLabelPrinter';
import { renderQl800Label } from '../../utils/ql800LabelCanvas';

export default function LabelPrinterPanel({ t, className = '' }) {
  const {
    hasPrinterSupport,
    status,
    isPrinting,
    error,
    refreshStatus,
    printImage,
  } = useBrotherLabelPrinter();

  if (!hasPrinterSupport) {
    return (
      <div className={`rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 ${className}`}>
        {t.printerBrowserHint}
      </div>
    );
  }

  const handleTestPrint = async () => {
    const image = renderQl800Label({
      customerNumber: '345',
      name: 'רון ביטר',
      community: 'ניצנים',
      crateIndex: 1,
    });
    await printImage(image);
  };

  const connected = !!status?.connected;
  const statusLabel = status?.editorLite
    ? t.printerEditorLite
    : connected
      ? t.printerConnected
      : t.printerDisconnected;

  return (
    <div className={`rounded-lg border border-gray-200 bg-white px-3 py-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className={`text-sm font-black ${connected ? 'text-green-700' : 'text-gray-700'}`}>
            {statusLabel}
          </div>
          {(error || status?.error) && (
            <div className="text-xs text-red-600 mt-1">
              {t.printerError(error || status.error, status?.message)}
            </div>
          )}
          {status?.message && (
            <div className="text-[11px] text-gray-500 mt-1 font-mono break-all">{status.message}</div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => refreshStatus()}
            className="px-3 py-1.5 text-sm font-bold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800"
          >
            {t.printerRefresh}
          </button>
          <button
            type="button"
            onClick={handleTestPrint}
            disabled={isPrinting}
            className="px-3 py-1.5 text-sm font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
          >
            {isPrinting ? t.printing : t.testPrint}
          </button>
        </div>
      </div>
    </div>
  );
}
