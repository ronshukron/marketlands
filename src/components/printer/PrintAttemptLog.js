import React, { useState } from 'react';
import { readPrintAttempts } from '../../utils/printAttemptLog';

// The station's last print attempts (utils/printAttemptLog.js), shown under
// "advanced actions" on the weighing screens. Read when opened, and on refresh.

const formatTime = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
};

export default function PrintAttemptLog({ t, className = '' }) {
  const [open, setOpen] = useState(false);
  const [attempts, setAttempts] = useState([]);

  const toggle = () => {
    if (!open) setAttempts(readPrintAttempts());
    setOpen((value) => !value);
  };

  const resultText = (entry) => {
    if (entry.code === 'ok') return t.printLogOk;
    if (entry.code === 'ok_confirmed') return t.printLogConfirmed;
    return t.printerError(entry.code);
  };
  const syncText = (entry) => {
    if (entry.sync === 'saved') return t.printLogSaved;
    if (entry.sync === 'pending') return t.printLogPending;
    return '';
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-100 text-gray-700 border hover:bg-gray-200"
      >
        🏷️ {t.printLogTitle}
      </button>
      {open && (
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white">
          {attempts.length === 0 ? (
            <p className="p-3 text-xs text-gray-500">{t.printLogEmpty}</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-1 text-start">{t.printLogTime}</th>
                  <th className="px-2 py-1 text-start">{t.printLogOrder}</th>
                  <th className="px-2 py-1 text-start">{t.printLogCarton}</th>
                  <th className="px-2 py-1 text-start">{t.printLogResult}</th>
                  <th className="px-2 py-1 text-start">{t.printLogDuration}</th>
                  <th className="px-2 py-1 text-start">{t.printLogSync}</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((entry, index) => {
                  const failed = entry.code !== 'ok' && entry.code !== 'ok_confirmed';
                  return (
                    <tr key={`${entry.at}-${index}`} className={`border-t border-gray-100 ${failed ? 'bg-red-50' : ''}`}>
                      <td className="px-2 py-1 whitespace-nowrap" dir="ltr">{formatTime(entry.at)}</td>
                      <td className="px-2 py-1 font-mono" dir="ltr">{String(entry.orderId || '').slice(-8)}</td>
                      <td className="px-2 py-1 font-bold">{entry.carton}#</td>
                      <td className={`px-2 py-1 ${failed ? 'text-red-700 font-bold' : 'text-green-700'}`}>{resultText(entry)}</td>
                      <td className="px-2 py-1" dir="ltr">{(entry.durationMs / 1000).toFixed(1)}s</td>
                      <td className="px-2 py-1">{syncText(entry)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
