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

  const labels = {
    titleHe: 'שקילת פריט',
    titleTh: 'ชั่งน้ำหนักสินค้า',
    orderedHe: 'כמות שהוזמנה',
    orderedTh: 'จำนวนที่สั่ง',
    currentHe: 'קריאת משקל (נוכחי)',
    currentTh: 'น้ำหนัก (ปัจจุบัน)',
    sourceHe: 'מקור',
    sourceTh: 'แหล่งที่มา',
    manualHe: 'משקל ידני (ק"ג):',
    manualTh: 'กรอกน้ำหนัก (กก.):',
    scaleBtnHe: 'קבל קריאה מהמשקל (Placeholder)',
    scaleBtnTh: 'อ่านค่าจากตาชั่ง (ชั่วคราว)',
    cancelHe: 'ביטול',
    cancelTh: 'ยกเลิก',
    confirmHe: 'אישור והמשך',
    confirmTh: 'ตกลงและต่อไป',
    sourceManualTh: 'กรอกเอง',
    sourceManualHe: 'ידני',
    sourceScaleTh: 'ตาชั่ง (ชั่วคราว)',
    sourceScaleHe: 'סקייל (placeholder)',
    unitBtnHe: 'יחידה - השתמש בכמות שהוזמנה',
    unitBtnTh: 'ใช้จำนวนที่สั่ง (ไม่ต้องชั่ง)',
    sourceUnitHe: 'יחידה',
    sourceUnitTh: 'จำนวน (ไม่ชั่ง)',
  };

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

  const applyUnitQuantity = () => {
    // For unit items (packs, pieces) - use the ordered quantity as-is, no weighing.
    const qty = requested > 0 ? requested : 1;
    setReadingKg(qty);
    setManualKg(String(qty));
    setSource('unit');
  };

  const confirm = () => {
    const n = Number(manualKg);
    if (!Number.isFinite(n) || n <= 0) {
      alert('אנא הזן משקל תקין בק"ג (מספר גדול מ-0).\nกรุณากรอกน้ำหนักเป็นตัวเลขมากกว่า 0');
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
          <div className="text-lg font-bold">{labels.titleHe}</div>
          <div className="text-xs text-gray-300">{labels.titleTh}</div>
          <div className="mt-2 text-base font-bold text-white" dir="ltr">{item.thaiName || item.productName}</div>
          {item.thaiName && (
            <div className="text-xs text-gray-300 mt-0.5" dir="rtl">{item.productName}</div>
          )}
        </div>

        <div className="p-6" dir="rtl">
          {item.images && item.images.length > 0 && (
            <div className="mb-4 flex justify-center">
              <img
                src={item.images[0]}
                alt={item.thaiName || item.productName}
                className="w-36 h-36 rounded-xl object-cover border border-gray-200"
              />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="bg-gray-50 border rounded-lg p-3">
              <div className="text-xs text-gray-500">{labels.orderedHe}</div>
              <div className="text-[11px] text-gray-400" dir="ltr">{labels.orderedTh}</div>
              <div className="text-2xl font-bold text-gray-900">{formatKg(requested)} ק"ג</div>
            </div>
            <div className="bg-gray-50 border rounded-lg p-3">
              <div className="text-xs text-gray-500">{labels.currentHe}</div>
              <div className="text-[11px] text-gray-400" dir="ltr">{labels.currentTh}</div>
              <div className="text-2xl font-bold text-blue-700">{formatKg(readingKg)} ק"ג</div>
              <div className="text-xs text-gray-500 mt-1">
                {labels.sourceHe}: {source === 'scale_placeholder' ? labels.sourceScaleHe : source === 'unit' ? labels.sourceUnitHe : labels.sourceManualHe}
                <span className="ml-2" dir="ltr">
                  ({labels.sourceTh}: {source === 'scale_placeholder' ? labels.sourceScaleTh : source === 'unit' ? labels.sourceUnitTh : labels.sourceManualTh})
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={applyPlaceholderReading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg"
            >
              {labels.scaleBtnHe}
              <div className="text-xs font-normal mt-0.5" dir="ltr">{labels.scaleBtnTh}</div>
            </button>

            <button
              type="button"
              onClick={applyUnitQuantity}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-lg"
            >
              {labels.unitBtnHe}
              <div className="text-xs font-normal mt-0.5" dir="ltr">{labels.unitBtnTh}</div>
            </button>

            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                {labels.manualHe}
                <div className="text-[11px] font-normal text-gray-500" dir="ltr">{labels.manualTh}</div>
              </label>
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
              {labels.cancelHe}
              <div className="text-xs font-normal mt-0.5" dir="ltr">{labels.cancelTh}</div>
            </button>
            <button
              type="button"
              onClick={confirm}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg"
            >
              {labels.confirmHe}
              <div className="text-xs font-normal mt-0.5" dir="ltr">{labels.confirmTh}</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


