import React, { useMemo, useState } from 'react';
import {
  buildSupplierOrderText,
  computeRemainingLines,
  fromNativeQuantity,
  isUnitBasedMeasurement,
  sumOrderedByProductKey,
  toNativeQuantity,
} from '../../utils/supplierOrderProgressUtils';
import { appendSupplierOrderBatch } from '../../services/supplierOrderProgressService';

const buildInitialRows = (products, batches) => (
  computeRemainingLines(products, sumOrderedByProductKey(batches)).map((row) => {
    const isUnitBased = isUnitBasedMeasurement(row.measurementType);
    return {
      ...row,
      isUnitBased,
      mode: 'unit',
      quantity: fromNativeQuantity(row.remainingQty, 'unit', row.unitSize, row.measurementType),
      included: row.remainingQty > 0,
    };
  })
);

const formatInMode = (nativeQty, row) => {
  const value = fromNativeQuantity(nativeQty, row.mode, row.unitSize, row.measurementType);
  const isKg = row.mode === 'kg' && !row.isUnitBased;
  return `${isKg ? Number(value).toFixed(1) : value} ${isKg ? 'ק"ג' : "יח'"}`;
};

const ContinuousSupplierOrderModal = ({
  businessId,
  business,
  batches = [],
  weekKey,
  deliveryDate,
  deliveryDateLabel,
  buildHeader,
  defaultSupplierLabel = '',
  communityFilterActive = false,
  adminUid = null,
  onCopy,
  onClose,
  onSaved,
}) => {
  const [rows, setRows] = useState(() => buildInitialRows(business.products || {}, batches));
  const [supplierLabel, setSupplierLabel] = useState(defaultSupplierLabel);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedRows = useMemo(
    () => rows.filter((row) => row.included && (Number(row.quantity) || 0) > 0),
    [rows],
  );
  const remainingCount = rows.filter((row) => row.remainingQty > 0).length;

  const updateRow = (index, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[index] };
      if (field === 'mode') {
        const native = toNativeQuantity(row.quantity, row.mode, row.unitSize, row.measurementType);
        row.mode = value;
        row.quantity = fromNativeQuantity(native, value, row.unitSize, row.measurementType);
      } else if (field === 'quantity') {
        row.quantity = value === '' ? '' : Number(value);
      } else if (field === 'included') {
        row.included = value;
      }
      next[index] = row;
      return next;
    });
  };

  const setAllMode = (mode) => {
    setRows((prev) => prev.map((row) => {
      if (row.isUnitBased) return row;
      const native = toNativeQuantity(row.quantity, row.mode, row.unitSize, row.measurementType);
      return { ...row, mode, quantity: fromNativeQuantity(native, mode, row.unitSize, row.measurementType) };
    }));
  };

  const fillRemaining = () => {
    setRows((prev) => prev.map((row) => ({
      ...row,
      quantity: fromNativeQuantity(row.remainingQty, row.mode, row.unitSize, row.measurementType),
      included: row.remainingQty > 0,
    })));
  };

  const buildText = () => buildSupplierOrderText({
    header: buildHeader(supplierLabel.trim()),
    items: selectedRows,
  });

  const handleCopyOnly = async () => {
    try {
      await onCopy(buildText());
      alert('ההזמנה הועתקה (לא נשמרה)');
    } catch (err) {
      console.error('Failed to copy continuous order:', err);
      alert('שגיאה בהעתקה');
    }
  };

  const handleCopyAndSave = async () => {
    if (selectedRows.length === 0) {
      alert('לא נבחרו מוצרים להזמנה');
      return;
    }
    setSaving(true);
    try {
      const text = buildText();
      await onCopy(text);
      const lines = Object.fromEntries(selectedRows.map((row) => [row.key, {
        productName: row.productName,
        selectedOption: row.selectedOption || '',
        measurementType: row.measurementType,
        unitSize: row.unitSize,
        quantity: toNativeQuantity(row.quantity, row.mode, row.unitSize, row.measurementType),
        enteredMode: row.isUnitBased ? 'unit' : row.mode,
        enteredQuantity: Number(row.quantity) || 0,
      }]));
      const saved = await appendSupplierOrderBatch(
        { weekKey, deliveryDate, businessId, businessName: business.businessName || '' },
        {
          supplierLabel: supplierLabel.trim() || business.businessName || '',
          note: note.trim(),
          lines,
          textSnapshot: text,
          createdBy: adminUid,
        },
      );
      alert('ההזמנה הועתקה ונשמרה. בפעם הבאה יוצג רק מה שנותר להזמין.');
      onSaved(saved);
    } catch (err) {
      console.error('Failed to save continuous order:', err);
      alert('שגיאה בשמירת ההזמנה. אם ההזמנה הועתקה, היא לא נרשמה כמוזמנת.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:w-11/12 max-w-3xl max-h-[92vh] flex flex-col" dir="rtl">
        <div className="flex justify-between items-start px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-xl font-bold text-gray-800">הזמנה מתמשכת - {business.businessName}</h3>
            <p className="text-sm text-gray-500">
              רכש ליום {deliveryDateLabel} · {batches.length > 0 ? `הוזמן עד כה ב-${batches.length} חלקים` : 'עוד לא הוזמן דבר'}
              {' · '}{remainingCount > 0 ? `נותרו ${remainingCount} מוצרים` : 'הכל הוזמן'}
            </p>
          </div>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-700 leading-none">x</button>
        </div>

        {communityFilterActive && (
          <div className="mx-5 mt-3 bg-amber-50 border border-amber-300 text-amber-800 text-sm p-2 rounded">
            שימו לב: מסנן קהילות פעיל, לכן הכמויות הנדרשות כוללות רק את הקהילות שנבחרו.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-5 py-3 border-b border-gray-100">
          <label>
            <span className="block text-sm text-gray-600 mb-1">ספק / נמען לחלק הזה (מופיע בפתיחת ההודעה)</span>
            <input
              type="text"
              value={supplierLabel}
              onChange={(event) => setSupplierLabel(event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="למשל: עמי / סיטונאי א'"
            />
          </label>
          <label>
            <span className="block text-sm text-gray-600 mb-1">הערה (לא חובה)</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="למשל: הזמנה ראשונה 10:00"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 px-5 py-3 bg-gray-50 border-b border-gray-100 items-center">
          <span className="text-sm text-gray-600 ml-2">הכל:</span>
          <button onClick={() => setAllMode('unit')} className="px-4 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200">
            יח'
          </button>
          <button onClick={() => setAllMode('kg')} className="px-4 py-1.5 rounded-full text-sm font-medium bg-purple-100 text-purple-700 hover:bg-purple-200">
            ק"ג
          </button>
          <button onClick={fillRemaining} className="mr-auto px-4 py-1.5 rounded-full text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300">
            מלא את כל היתרה
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {rows.map((row, index) => (
            <div
              key={row.key}
              className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border ${
                row.included ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={row.included}
                  onChange={(event) => updateRow(index, 'included', event.target.checked)}
                  className="w-5 h-5"
                />
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-gray-800 block truncate">
                    {row.productName}
                    {row.selectedOption && <span className="text-sm font-normal text-gray-500"> ({row.selectedOption})</span>}
                  </span>
                  <span className="text-xs text-gray-500">
                    נדרש {formatInMode(row.totalQty, row)} · הוזמן {formatInMode(row.orderedQty, row)} ·{' '}
                    <span className={row.remainingQty > 0 ? 'font-semibold text-blue-700' : 'text-green-700'}>
                      נותר {formatInMode(row.remainingQty, row)}
                    </span>
                    {row.overOrdered && <span className="text-red-600 font-semibold"> · הוזמן יותר מהנדרש</span>}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 pr-8 sm:pr-0">
                {!row.isUnitBased ? (
                  <div className="inline-flex rounded-full overflow-hidden border border-gray-300">
                    <button onClick={() => updateRow(index, 'mode', 'unit')} className={`px-3 py-1.5 text-sm ${row.mode === 'unit' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                      יח'
                    </button>
                    <button onClick={() => updateRow(index, 'mode', 'kg')} className={`px-3 py-1.5 text-sm ${row.mode === 'kg' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                      ק"ג
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 w-[88px] text-center">יח' קבוע</span>
                )}
                <input
                  type="number"
                  min="0"
                  step={row.mode === 'kg' && !row.isUnitBased ? '0.1' : '1'}
                  value={row.quantity}
                  onChange={(event) => updateRow(index, 'quantity', event.target.value)}
                  disabled={!row.included}
                  className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-center disabled:bg-gray-100"
                />
                <span className="text-sm text-gray-500 w-8">{row.mode === 'kg' && !row.isUnitBased ? 'ק"ג' : "יח'"}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 px-5 py-4 bg-gray-50 rounded-b-2xl flex flex-wrap gap-2 justify-between items-center">
          <span className="text-sm text-gray-500">{selectedRows.length} מוצרים נבחרו</span>
          <div className="flex gap-2">
            <button
              onClick={handleCopyOnly}
              disabled={saving}
              className="px-4 py-3 bg-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-300 disabled:opacity-50"
            >
              העתק בלבד
            </button>
            <button
              onClick={handleCopyAndSave}
              disabled={saving || selectedRows.length === 0}
              className="px-6 py-3 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? 'שומר...' : 'העתק ושמור הזמנה'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContinuousSupplierOrderModal;
