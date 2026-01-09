import React, { useEffect, useMemo, useState } from 'react';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function formatKg(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (Number.isNaN(num)) return '';
  return num.toFixed(3);
}

export default function WeighItemModal({
  open,
  item,
  existingValue,
  onCancel,
  onConfirm,
}) {
  const [manualKg, setManualKg] = useState('');
  const [readingKg, setReadingKg] = useState(null);
  const [source, setSource] = useState('manual'); // manual | scale_placeholder

  const requested = useMemo(() => Number(item?.requestedQuantity || 0), [item]);

  useEffect(() => {
    if (!open) return;
    const existing = existingValue?.actualQuantity;
    if (existing !== undefined && existing !== null && existing !== '') {
      setManualKg(String(existing));
      setReadingKg(Number(existing));
      setSource(existingValue?.source || 'manual');
    } else {
      setManualKg('');
      setReadingKg(null);
      setSource('manual');
    }
  }, [open, existingValue]);

  if (!open || !item) return null;

  const applyPlaceholderReading = () => {
    // Placeholder "scale reading": create something plausible near requested quantity.
    // Example in request: 2.000 ordered -> 1.955 read.
    const base = requested > 0 ? requested : 1.0;
    const jitter = (Math.random() - 0.5) * 0.12; // ±6%
    const value = clamp(base * (1 + jitter), 0.05, 99);
    const rounded = Math.round(value * 1000) / 1000;
    setReadingKg(rounded);
    setManualKg(String(rounded));
    setSource('scale_placeholder');
  };

  const confirm = () => {
    const n = Number(manualKg);
    if (!Number.isFinite(n) || n <= 0) {
      alert('אנא הזן משקל תקין בק"ג (מספר גדול מ-0).');
      return;
    }
    onConfirm({
      actualQuantity: Math.round(n * 1000) / 1000,
      source,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-gray-900 text-white">
          <div className="text-lg font-bold">שקילת פריט</div>
          <div className="text-sm text-gray-200">{item.productName}</div>
        </div>

        <div className="p-6" dir="rtl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="bg-gray-50 border rounded-lg p-3">
              <div className="text-xs text-gray-500">כמות שהוזמנה</div>
              <div className="text-2xl font-bold text-gray-900">{formatKg(requested)} ק"ג</div>
            </div>
            <div className="bg-gray-50 border rounded-lg p-3">
              <div className="text-xs text-gray-500">קריאת משקל (נוכחי)</div>
              <div className="text-2xl font-bold text-blue-700">{formatKg(readingKg)} ק"ג</div>
              <div className="text-xs text-gray-500 mt-1">מקור: {source === 'scale_placeholder' ? 'סקייל (placeholder)' : 'ידני'}</div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={applyPlaceholderReading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg"
            >
              קבל קריאה מהמשקל (Placeholder)
            </button>

            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">משקל ידני (ק"ג):</label>
              <input
                value={manualKg}
                onChange={(e) => {
                  setManualKg(e.target.value);
                  setSource('manual');
                }}
                inputMode="decimal"
                placeholder="לדוגמה: 1.955"
                className="flex-1 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-lg"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={confirm}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg"
            >
              אישור והמשך
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


