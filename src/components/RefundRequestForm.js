import React, { useMemo, useState } from 'react';
import {
  buildRefundItems,
  getRefundableLinesFromOrder,
  sumRefundAmount,
} from '../utils/refundUtils';

const PERCENT_PRESETS = [25, 50, 75, 100];

const RefundRequestForm = ({
  orders = [],
  selectedOrderId = null,
  onSubmit,
  onCancel,
  isSubmitting = false,
  isExternalOrder = false,
}) => {
  const [orderId, setOrderId] = useState(selectedOrderId || '');
  const [selectedLineIds, setSelectedLineIds] = useState({});
  const [percentByLineId, setPercentByLineId] = useState({});
  const [reason, setReason] = useState('');

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === orderId) || null,
    [orders, orderId],
  );

  const refundableLines = useMemo(
    () => (selectedOrder ? getRefundableLinesFromOrder(selectedOrder) : []),
    [selectedOrder],
  );

  const selectedLines = useMemo(
    () => refundableLines.filter((line) => selectedLineIds[line.lineId]),
    [refundableLines, selectedLineIds],
  );

  const refundItems = useMemo(
    () => buildRefundItems(selectedLines, percentByLineId),
    [selectedLines, percentByLineId],
  );

  const requestedRefundAmount = useMemo(() => sumRefundAmount(refundItems), [refundItems]);

  const toggleLine = (lineId) => {
    setSelectedLineIds((prev) => {
      const next = { ...prev, [lineId]: !prev[lineId] };
      if (next[lineId] && percentByLineId[lineId] == null) {
        setPercentByLineId((percents) => ({ ...percents, [lineId]: 100 }));
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert('אנא הזן סיבה לבקשת ההחזר');
      return;
    }
    if (!isExternalOrder && selectedLines.length === 0) {
      alert('אנא בחר לפחות פריט אחד לזיכוי');
      return;
    }
    onSubmit({
      orderId: isExternalOrder ? null : orderId,
      reason: reason.trim(),
      refundItems: isExternalOrder ? [] : refundItems,
      requestedRefundAmount: isExternalOrder ? 0 : requestedRefundAmount,
      orderAmount: selectedOrder?.grandTotal || selectedOrder?.totalAmount || 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} dir="rtl">
      {!isExternalOrder && !selectedOrderId && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">בחר הזמנה</label>
          <select
            value={orderId}
            onChange={(e) => {
              setOrderId(e.target.value);
              setSelectedLineIds({});
              setPercentByLineId({});
            }}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
            required
          >
            <option value="">בחר הזמנה...</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                #{order.id.substring(0, 8)}... — ₪{(order.grandTotal || order.totalAmount || 0).toFixed(2)}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isExternalOrder && refundableLines.length > 0 && (
        <div className="mb-4 space-y-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
          <p className="text-sm font-semibold text-gray-800">בחר פריטים לזיכוי</p>
          {refundableLines.map((line) => {
            const isSelected = !!selectedLineIds[line.lineId];
            const percent = percentByLineId[line.lineId] ?? 100;
            return (
              <div key={line.lineId} className={`rounded-lg border p-3 ${isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleLine(line.lineId)}
                    className="mt-1 rounded border-gray-300"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{line.productName}</p>
                    <p className="text-xs text-gray-500">{line.businessName} • ₪{line.lineTotal.toFixed(2)}</p>
                  </div>
                </label>
                {isSelected && (
                  <div className="mt-2 pr-6">
                    <div className="flex flex-wrap gap-1 mb-2">
                      {PERCENT_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setPercentByLineId((prev) => ({ ...prev, [line.lineId]: preset }))}
                          className={`px-2 py-0.5 text-xs rounded ${
                            percent === preset ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {preset}%
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={percent}
                      onChange={(e) => setPercentByLineId((prev) => ({ ...prev, [line.lineId]: Number(e.target.value) }))}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      זיכוי: {percent}% = ₪{((line.lineTotal * percent) / 100).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isExternalOrder && selectedLines.length > 0 && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm">
          <span className="font-semibold">סה״כ מבוקש לזיכוי: </span>
          <span className="text-green-800 font-bold">₪{requestedRefundAmount.toFixed(2)}</span>
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="refundReason" className="block text-sm font-medium text-gray-700 mb-1">
          {isExternalOrder ? 'פרטי ההזמנה והסיבה לזיכוי' : 'הזיכוי מאושר אוטומטית — נשמח להסבר כדי להשתפר בעתיד :)'}
        </label>
        <textarea
          id="refundReason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows="4"
          required
        />
      </div>

      <div className="flex justify-between mt-6">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
        >
          ביטול
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className={`px-4 py-2 bg-red-600 text-white rounded-md transition-colors ${
            isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-red-700'
          }`}
        >
          {isSubmitting ? 'שולח בקשה...' : 'שלח בקשת החזר'}
        </button>
      </div>
    </form>
  );
};

export default RefundRequestForm;
