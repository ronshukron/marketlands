import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import {
  canTransferCustomerOrderDelivery,
  transferCustomerOrderDelivery,
} from '../../services/customerOrderTransferService';
import {
  generateAvailableDeliveryDates,
  getWeekKey,
  isOrderDeliveryDateFallback,
  toLocalDateKey,
} from '../../utils/deliveryScheduleUtils';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const formatWeekLabel = (weekKey) => {
  const sunday = new Date(weekKey);
  const friday = new Date(sunday);
  friday.setDate(sunday.getDate() + 5);
  return `${format(sunday, 'dd/MM/yyyy')} – ${format(friday, 'dd/MM/yyyy')}`;
};

const formatDateKeyLabel = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${DAY_NAMES[date.getDay()]} ${format(date, 'dd/MM/yyyy')}`;
};

async function loadTargetDeliveryDates() {
  const schedulesSnapshot = await getDocs(collection(db, 'deliverySchedules'));
  const deliveryDates = new Set();

  schedulesSnapshot.docs.forEach((scheduleSnap) => {
    generateAvailableDeliveryDates(scheduleSnap.data(), { includePastCutoff: true })
      .forEach((dateKey) => deliveryDates.add(dateKey));
  });

  const todayKey = toLocalDateKey(new Date());
  for (let offset = -7; offset <= 56; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    deliveryDates.add(toLocalDateKey(date));
  }

  return Array.from(deliveryDates).filter(Boolean).sort();
}

export default function CustomerOrderDeliveryTransferControl({
  orderId,
  source = 'customerOrdersDelayed',
  orderData = null,
  currentDeliveryDateKey = '',
  deliveryDateIsFallback = false,
  availableDeliveryDates = null,
  adminUid = null,
  onTransferred,
  buttonLabel = 'העבר משלוח',
  buttonClassName = 'px-3 py-1.5 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 disabled:opacity-50',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [targetDates, setTargetDates] = useState(availableDeliveryDates || []);
  const [targetDate, setTargetDate] = useState('');
  const [loadingDates, setLoadingDates] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState('');

  const isFallback = deliveryDateIsFallback || (orderData ? isOrderDeliveryDateFallback(orderData) : false);
  const canTransfer = Boolean(orderId) && !isFallback && canTransferCustomerOrderDelivery(orderData || {});

  const currentDateKey = currentDeliveryDateKey
    || (orderData ? toLocalDateKey(
      orderData.fulfillment?.deliveryDate
      || orderData.deliveryDate
      || '',
    ) : '');

  useEffect(() => {
    if (availableDeliveryDates?.length) {
      setTargetDates(availableDeliveryDates);
    }
  }, [availableDeliveryDates]);

  useEffect(() => {
    if (!open || targetDates.length > 0) return;
    setLoadingDates(true);
    loadTargetDeliveryDates()
      .then((dates) => setTargetDates(dates))
      .catch(() => setError('טעינת תאריכי משלוח נכשלה'))
      .finally(() => setLoadingDates(false));
  }, [open, targetDates.length]);

  useEffect(() => {
    if (!open) return;
    const todayKey = toLocalDateKey(new Date());
    const preferred = targetDates.find((dateKey) => dateKey >= todayKey && dateKey !== currentDateKey)
      || targetDates.find((dateKey) => dateKey !== currentDateKey)
      || '';
    setTargetDate(preferred);
    setError('');
  }, [open, targetDates, currentDateKey]);

  const targetDatesByWeek = useMemo(() => (
    targetDates.reduce((acc, dateKey) => {
      const weekKey = getWeekKey(dateKey);
      if (!acc[weekKey]) acc[weekKey] = [];
      acc[weekKey].push(dateKey);
      return acc;
    }, {})
  ), [targetDates]);

  if (!canTransfer) return null;

  const handleTransfer = async () => {
    if (!targetDate) {
      setError('יש לבחור תאריך משלוח');
      return;
    }
    if (targetDate === currentDateKey) {
      setError('תאריך היעד זהה לתאריך הנוכחי');
      return;
    }

    const confirmed = window.confirm(
      `להעביר את ההזמנה ${orderId} מ-${formatDateKeyLabel(currentDateKey)} ל-${formatDateKeyLabel(targetDate)}?`,
    );
    if (!confirmed) return;

    setTransferring(true);
    setError('');
    try {
      await transferCustomerOrderDelivery({
        orderId,
        customerOrderSource: source,
        newDeliveryDateKey: targetDate,
        adminUid,
      });
      setOpen(false);
      if (typeof onTransferred === 'function') {
        onTransferred({ orderId, newDeliveryDateKey: targetDate });
      }
    } catch (err) {
      setError(err.message || 'העברת ההזמנה נכשלה');
    } finally {
      setTransferring(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || transferring}
        className={buttonClassName}
      >
        {transferring ? 'מעביר...' : buttonLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" dir="rtl">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <h3 className="text-lg font-bold text-gray-900">העברת תאריך משלוח</h3>
              <p className="mt-1 text-sm text-gray-600">
                {orderId}
              </p>
              {currentDateKey && (
                <p className="mt-1 text-sm text-gray-700">
                  משלוח נוכחי: <span className="font-semibold">{formatDateKeyLabel(currentDateKey)}</span>
                </p>
              )}
            </div>

            <div className="px-5 py-4 space-y-3">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">תאריך משלוח חדש</span>
                {loadingDates ? (
                  <div className="text-sm text-gray-500">טוען תאריכים...</div>
                ) : (
                  <select
                    value={targetDate}
                    onChange={(event) => setTargetDate(event.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {Object.entries(targetDatesByWeek).map(([weekKey, dates]) => (
                      <optgroup key={weekKey} label={`שבוע ${formatWeekLabel(weekKey)}`}>
                        {dates.map((dateKey) => (
                          <option key={dateKey} value={dateKey} disabled={dateKey === currentDateKey}>
                            {formatDateKeyLabel(dateKey)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}
              </label>

              <p className="text-xs text-gray-500">
                מעדכן deliveryDate, deliveryWeekKey, fulfillment ו-orderBreakdown. דוחות לפי createdAt לא משתנים.
              </p>
            </div>

            <div className="flex gap-2 border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={handleTransfer}
                disabled={transferring || loadingDates || !targetDate}
                className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {transferring ? 'מעביר...' : 'אשר העברה'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={transferring}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
