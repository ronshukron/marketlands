import React, { useEffect, useMemo, useState } from 'react';
import { useWeightScale } from '../../../hooks/useWeightScale';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function formatKg(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (Number.isNaN(num)) return '';
  return num.toFixed(3);
}

function formatUnit(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (Number.isNaN(num)) return '';
  return String(Math.floor(num));
}

export default function WeighItemModal({
  open,
  item,
  existingValue,
  onCancel,
  onConfirm,
}) {
  const [manualValue, setManualValue] = useState('');
  const [readingValue, setReadingValue] = useState(null);
  const [source, setSource] = useState('manual'); // manual | scale | scale_placeholder | package | ordered_default

  // Scale integration
  const {
    isElectron,
    isConnected: scaleConnected,
    weight: liveWeight,
    lastStableWeight,
    error: scaleError,
  } = useWeightScale();

  const requested = useMemo(() => Number(item?.requestedQuantity || 0), [item]);
  // measurementType: 'kg' | 'unit' | 'package'
  // - kg: weighed in kg, charged by weight
  // - unit: weighed in kg (e.g., melon), but ordered/displayed as count, charged by weight
  // - package: no weighing, just confirm count, fixed price per package
  const measurementType = item?.measurementType || 'kg';
  const isPackageItem = measurementType === 'package';
  const isUnitItem = measurementType === 'unit';
  const needsWeighing = !isPackageItem; // kg and unit items need weighing

  // Auto-update reading when scale provides stable weight
  useEffect(() => {
    if (!open || isPackageItem) return; // Package items don't use scale
    if (lastStableWeight && lastStableWeight.stable && lastStableWeight.value > 0) {
      // Only auto-update if we haven't manually entered something
      // This provides live weight display but doesn't override manual entry
    }
  }, [lastStableWeight, open, isPackageItem]);

  useEffect(() => {
    if (!open) return;
    const existing = existingValue?.actualQuantity;
    if (existing !== undefined && existing !== null && existing !== '') {
      setManualValue(String(existing));
      setReadingValue(Number(existing));
      setSource(existingValue?.source || 'manual');
    } else {
      setManualValue('');
      setReadingValue(null);
      setSource('manual');
    }
  }, [open, existingValue]);

  if (!open || !item) return null;

  // Labels based on measurement type
  const labels = isPackageItem ? {
    // Package items: just confirm count, no weighing
    titleHe: 'אישור כמות מארזים',
    titleTh: 'ยืนยันจำนวนแพ็ก',
    orderedHe: 'כמות שהוזמנה',
    orderedTh: 'จำนวนที่สั่ง',
    currentHe: 'כמות בפועל',
    currentTh: 'จำนวนจริง',
    sourceHe: 'מקור',
    sourceTh: 'แหล่งที่มา',
    manualHe: 'כמות (מארזים):',
    manualTh: 'จำนวน (แพ็ก):',
    useOrderedBtnHe: 'השתמש בכמות שהוזמנה',
    useOrderedBtnTh: 'ใช้จำนวนที่สั่ง',
    cancelHe: 'ביטול',
    cancelTh: 'ยกเลิก',
    confirmHe: 'אישור והמשך',
    confirmTh: 'ตกลงและต่อไป',
    sourceManualTh: 'กรอกเอง',
    sourceManualHe: 'ידני',
    sourcePackageHe: 'כמות שהוזמנה',
    sourcePackageTh: 'จำนวนที่สั่ง',
    unitLabel: 'מארז',
    unitLabelTh: 'แพ็ก',
  } : isUnitItem ? {
    // Unit items: weighed like kg, but ordered/displayed as count (e.g., melon)
    titleHe: 'שקילת פריט (יחידה)',
    titleTh: 'ชั่งน้ำหนักสินค้า (ชิ้น)',
    orderedHe: 'כמות שהוזמנה',
    orderedTh: 'จำนวนที่สั่ง',
    currentHe: 'משקל בפועל (ק"ג)',
    currentTh: 'น้ำหนักจริง (กก.)',
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
    unitLabel: 'ק"ג',
    unitLabelTh: 'กก.',
    orderedUnitLabel: 'יח\'',
    orderedUnitLabelTh: 'ชิ้น',
  } : {
    // kg items: standard weighing
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
    unitBtnHe: 'יחידה - השתמש בכמות שהוזמנה',
    unitBtnTh: 'ใช้จำนวนที่สั่ง (ไม่ต้องชั่ง)',
    cancelHe: 'ביטול',
    cancelTh: 'ยกเลิก',
    confirmHe: 'אישור והמשך',
    confirmTh: 'ตกลงและต่อไป',
    sourceManualTh: 'กรอกเอง',
    sourceManualHe: 'ידני',
    sourceScaleTh: 'ตาชั่ง (ชั่วคราว)',
    sourceScaleHe: 'סקייל (placeholder)',
    sourceOrderedHe: 'כמות שהוזמנה',
    sourceOrderedTh: 'จำนวนที่สั่ง',
    unitLabel: 'ק"ג',
    unitLabelTh: 'กก.',
  };

  // Capture weight from real scale
  const captureFromScale = () => {
    if (!scaleConnected || !lastStableWeight) {
      alert('המשקל לא מחובר או אין קריאה יציבה.\nตาชั่งไม่ได้เชื่อมต่อหรือไม่มีค่าคงที่');
      return;
    }
    const value = lastStableWeight.value;
    const rounded = Math.round(value * 1000) / 1000;
    setReadingValue(rounded);
    setManualValue(String(rounded));
    setSource('scale');
  };

  const applyPlaceholderReading = () => {
    // Placeholder "scale reading": create something plausible near requested quantity.
    // Used when real scale is not connected
    const base = requested > 0 ? requested : 1.0;
    const jitter = (Math.random() - 0.5) * 0.12; // ±6%
    const value = clamp(base * (1 + jitter), 0.05, 99);
    const rounded = Math.round(value * 1000) / 1000;
    setReadingValue(rounded);
    setManualValue(String(rounded));
    setSource('scale_placeholder');
  };

  const applyOrderedQuantity = () => {
    // Use the ordered quantity as-is (for package items or as fallback for kg items)
    const qty = requested > 0 ? requested : 1;
    if (isPackageItem) {
      // Package items: use integer count
      setReadingValue(Math.floor(qty));
      setManualValue(String(Math.floor(qty)));
      setSource('package');
    } else {
      // kg items: use ordered kg quantity
      setReadingValue(qty);
      setManualValue(String(qty));
      setSource('ordered_default');
    }
  };

  const confirm = () => {
    const n = Number(manualValue);
    if (!Number.isFinite(n) || n <= 0) {
      if (isPackageItem) {
        alert('אנא הזן כמות תקינה (מספר שלם גדול מ-0).\nกรุณากรอกจำนวนเป็นตัวเลขมากกว่า 0');
      } else {
        alert('אנא הזן משקל תקין בק"ג (מספר גדול מ-0).\nกรุณากรอกน้ำหนักเป็นตัวเลขมากกว่า 0');
      }
      return;
    }
    onConfirm({
      // Package items: integer count; kg and unit items: weight in kg (3 decimal places)
      actualQuantity: isPackageItem ? Math.floor(n) : Math.round(n * 1000) / 1000,
      source,
    });
  };

  const getSourceLabel = () => {
    if (source === 'scale') return { he: 'משקל (BEP)', th: 'ตาชั่ง (BEP)' };
    if (source === 'scale_placeholder') return { he: labels.sourceScaleHe || labels.sourceManualHe, th: labels.sourceScaleTh || labels.sourceManualTh };
    if (source === 'package') return { he: labels.sourcePackageHe || 'מארז', th: labels.sourcePackageTh || 'แพ็ก' };
    if (source === 'ordered_default') return { he: labels.sourceOrderedHe || 'כמות שהוזמנה', th: labels.sourceOrderedTh || 'จำนวนที่สั่ง' };
    return { he: labels.sourceManualHe, th: labels.sourceManualTh };
  };

  const sourceLabel = getSourceLabel();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className={`px-6 py-4 text-white ${isPackageItem ? 'bg-purple-800' : isUnitItem ? 'bg-yellow-700' : 'bg-gray-900'}`}>
          <div className="text-lg font-bold">{labels.titleHe}</div>
          <div className="text-xs text-gray-300">{labels.titleTh}</div>
          <div className="mt-2 text-base font-bold text-white" dir="ltr">{item.thaiName || item.productName}</div>
          {item.thaiName && (
            <div className="text-xs text-gray-300 mt-0.5" dir="rtl">{item.productName}</div>
          )}
          {isPackageItem && (
            <div className="mt-2 inline-block text-xs px-2 py-1 bg-purple-600 rounded">
              מוצר נמכר במארזים - מחיר קבוע / ผลิตภัณฑ์ขายเป็นแพ็ก - ราคาคงที่
            </div>
          )}
          {isUnitItem && (
            <div className="mt-2 inline-block text-xs px-2 py-1 bg-yellow-600 rounded">
              מוצר נמכר ביחידות - נשקל לחיוב / ผลิตภัณฑ์ขายเป็นชิ้น - ต้องชั่งน้ำหนัก
            </div>
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
              <div className="text-2xl font-bold text-gray-900">
                {isPackageItem 
                  ? `${formatUnit(requested)} ${labels.unitLabel}`
                  : isUnitItem
                    ? `${formatUnit(requested)} ${labels.orderedUnitLabel || 'יח\''}`
                    : `${formatKg(requested)} ${labels.unitLabel}`}
              </div>
            </div>
            <div className="bg-gray-50 border rounded-lg p-3">
              <div className="text-xs text-gray-500">{labels.currentHe}</div>
              <div className="text-[11px] text-gray-400" dir="ltr">{labels.currentTh}</div>
              <div className={`text-2xl font-bold ${isPackageItem ? 'text-purple-700' : isUnitItem ? 'text-yellow-700' : 'text-blue-700'}`}>
                {isPackageItem 
                  ? `${formatUnit(readingValue)} ${labels.unitLabel}`
                  : `${formatKg(readingValue)} ${labels.unitLabel}`}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {labels.sourceHe}: {sourceLabel.he}
                <span className="ml-2" dir="ltr">
                  ({labels.sourceTh}: {sourceLabel.th})
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {/* For package items: show "Use ordered quantity" prominently, no scale */}
            {isPackageItem ? (
              <>
                <button
                  type="button"
                  onClick={applyOrderedQuantity}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg"
                >
                  {labels.useOrderedBtnHe}
                  <div className="text-xs font-normal mt-0.5" dir="ltr">{labels.useOrderedBtnTh}</div>
                </button>

                <div className="flex items-center gap-3">
                  <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                    {labels.manualHe}
                    <div className="text-[11px] font-normal text-gray-500" dir="ltr">{labels.manualTh}</div>
                  </label>
                  <input
                    value={manualValue}
                    onChange={(e) => {
                      setManualValue(e.target.value);
                      setSource('manual');
                    }}
                    inputMode="numeric"
                    placeholder="לדוגמה: 2"
                    className="flex-1 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </>
            ) : (
              <>
                {/* For kg and unit items: show scale controls - both need weighing */}
                {/* Scale status indicator */}
                {isElectron && (
                  <div className={`mb-2 text-center text-sm py-2 rounded-lg ${scaleConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {scaleConnected ? (
                      <>
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
                        משקל מחובר / ตาชั่งเชื่อมต่อแล้ว
                        {liveWeight && liveWeight.value != null && (
                          <span className="ml-2 font-bold">
                            {liveWeight.value.toFixed(3)} {liveWeight.unit}
                            {!liveWeight.stable && <span className="text-yellow-600 ml-1">(לא יציב)</span>}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-2"></span>
                        משקל לא מחובר / ตาชั่งไม่ได้เชื่อมต่อ
                      </>
                    )}
                  </div>
                )}

                {/* Real scale capture button (when connected) */}
                {scaleConnected && (
                  <button
                    type="button"
                    onClick={captureFromScale}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg mb-2"
                  >
                    📥 קלוט משקל מהמאזניים ({lastStableWeight && lastStableWeight.value != null ? `${lastStableWeight.value.toFixed(3)} kg` : 'ממתין...'})
                    <div className="text-xs font-normal mt-0.5" dir="ltr">อ่านค่าจากตาชั่ง (BEP)</div>
                  </button>
                )}

                {/* Placeholder scale button (when not connected or as fallback) */}
                <button
                  type="button"
                  onClick={applyPlaceholderReading}
                  className={`w-full ${scaleConnected ? 'bg-gray-400 hover:bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold py-3 rounded-lg`}
                >
                  {scaleConnected ? 'Placeholder (לבדיקה)' : labels.scaleBtnHe}
                  <div className="text-xs font-normal mt-0.5" dir="ltr">{scaleConnected ? 'For testing only' : labels.scaleBtnTh}</div>
                </button>

                {/* Only for kg items: option to use ordered quantity without weighing */}
                {!isUnitItem && (
                  <button
                    type="button"
                    onClick={applyOrderedQuantity}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-lg"
                  >
                    {labels.unitBtnHe}
                    <div className="text-xs font-normal mt-0.5" dir="ltr">{labels.unitBtnTh}</div>
                  </button>
                )}

                <div className="flex items-center gap-3">
                  <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                    {labels.manualHe}
                    <div className="text-[11px] font-normal text-gray-500" dir="ltr">{labels.manualTh}</div>
                  </label>
                  <input
                    value={manualValue}
                    onChange={(e) => {
                      setManualValue(e.target.value);
                      setSource('manual');
                    }}
                    inputMode="decimal"
                    placeholder="לדוגמה: 1.955"
                    className="flex-1 border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}
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
