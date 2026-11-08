import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { loadLinkableOrderForms } from '../../services/orderGoLiveService';
import { GO_LIVE_MODES, parseDateSafe } from '../../utils/deliveryScheduleUtils';

const MODE_CHOICES = [
  { value: GO_LIVE_MODES.IMMEDIATE, label: 'מיד', hint: 'הטופס פתוח מרגע השמירה.' },
  { value: GO_LIVE_MODES.AT_TIME, label: 'בתאריך ושעה', hint: 'הטופס נפתח לכל הקהילות ברגע שנבחר.' },
  { value: GO_LIVE_MODES.AFTER_ORDER, label: 'אחרי טופס אחר', hint: 'בכל קהילה הטופס נפתח כשהטופס שנבחר נסגר באותה קהילה.' },
];

const formatDateTime = (date) => (date
  ? date.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
  : '');

export const toDateTimeLocal = (value) => {
  const d = parseDateSafe(value);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * value: { mode, opensAtLocal, linkedOrder }
 * linkedOrder: { id, orderName, businessName, endingTime, pickupSpots, data }
 */
const AlwaysOnGoLiveFields = ({ value, onChange, excludeOrderId = '', initialLinkedOrderId = '' }) => {
  const [linkableOrders, setLinkableOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadError, setLoadError] = useState('');
  const mode = value?.mode || GO_LIVE_MODES.IMMEDIATE;

  useEffect(() => {
    if (mode !== GO_LIVE_MODES.AFTER_ORDER) return undefined;
    let cancelled = false;
    setLoadingOrders(true);
    setLoadError('');
    (async () => {
      try {
        const list = await loadLinkableOrderForms({ excludeOrderId });
        if (initialLinkedOrderId && !list.some((order) => order.id === initialLinkedOrderId)) {
          const snap = await getDoc(doc(db, 'Orders', initialLinkedOrderId));
          if (snap.exists()) {
            const data = snap.data();
            list.unshift({
              id: snap.id,
              orderName: data.orderName || 'ללא שם',
              businessName: data.businessName || '',
              endingTime: parseDateSafe(data.endingTime || data.Ending_Time),
              pickupSpots: Array.isArray(data.pickupSpots) ? data.pickupSpots : [],
              data,
            });
          }
        }
        if (cancelled) return;
        setLinkableOrders(list);
        if (initialLinkedOrderId && !value?.linkedOrder) {
          const initial = list.find((order) => order.id === initialLinkedOrderId);
          if (initial) onChange({ ...value, linkedOrder: initial });
        }
      } catch (error) {
        console.error('Failed to load order forms for go-live link:', error);
        if (!cancelled) setLoadError('טעינת הטפסים נכשלה. נסו שוב.');
      } finally {
        if (!cancelled) setLoadingOrders(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, excludeOrderId, initialLinkedOrderId]);

  const selectedLinked = value?.linkedOrder || null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">מתי הטופס נפתח ללקוחות</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {MODE_CHOICES.map((choice) => (
          <label
            key={choice.value}
            className={`border rounded-lg p-3 cursor-pointer text-sm ${mode === choice.value ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}
          >
            <input
              type="radio"
              name="goLiveMode"
              value={choice.value}
              checked={mode === choice.value}
              onChange={() => onChange({ ...value, mode: choice.value })}
              className="ml-2"
            />
            <span className="font-medium">{choice.label}</span>
            <p className="text-xs text-gray-500 mt-1">{choice.hint}</p>
          </label>
        ))}
      </div>

      {mode === GO_LIVE_MODES.AT_TIME && (
        <label className="block">
          <span className="text-sm text-gray-600">תאריך ושעת פתיחה</span>
          <input
            type="datetime-local"
            value={value?.opensAtLocal || ''}
            onChange={(e) => onChange({ ...value, opensAtLocal: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mt-1"
          />
        </label>
      )}

      {mode === GO_LIVE_MODES.AFTER_ORDER && (
        <div className="space-y-2">
          <label className="block">
            <span className="text-sm text-gray-600">ייפתח אחרי הטופס</span>
            <select
              value={selectedLinked?.id || ''}
              onChange={(e) => onChange({
                ...value,
                linkedOrder: linkableOrders.find((order) => order.id === e.target.value) || null,
              })}
              disabled={loadingOrders}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mt-1 bg-white"
            >
              <option value="">{loadingOrders ? 'טוען טפסים...' : 'בחרו טופס'}</option>
              {linkableOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderName}
                  {order.businessName ? ` · ${order.businessName}` : ''}
                  {order.endingTime ? ` · נסגר ${formatDateTime(order.endingTime)}` : ''}
                </option>
              ))}
            </select>
          </label>
          {loadError && <p className="text-xs text-red-600">{loadError}</p>}
          {!loadingOrders && !loadError && linkableOrders.length === 0 && (
            <p className="text-xs text-gray-500">אין כרגע טפסים מוגבלים בזמן שעדיין פתוחים.</p>
          )}
          <p className="text-xs text-gray-500">
            בכל קהילה הטופס נפתח שעה לפני זמן הסיום של הטופס שנבחר באותה קהילה, כשהטופס שנבחר יוצא מהחנות. קהילה שאין לה זמן סיום בטופס שנבחר נשארת סגורה.
          </p>
        </div>
      )}
    </div>
  );
};

export default AlwaysOnGoLiveFields;
