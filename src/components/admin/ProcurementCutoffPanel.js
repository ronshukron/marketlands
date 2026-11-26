import React, { useState } from 'react';
import { format } from 'date-fns';

const VISIBLE_ORDERS = 12;

const toInputValue = (date) => (date ? format(date, "yyyy-MM-dd'T'HH:mm") : '');

const fromInputValue = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const parseCutoff = (entry) => fromInputValue(entry?.cutoffAt);

const countLabel = (count) => (count === 1 ? 'הזמנה אחת' : `${count} הזמנות`);

const CutoffGroup = ({ group, formatDayLabel, ordersLoadedAt, selectedDeliveryDate, saving, onSave }) => {
  const cutoffs = group.entries.map(parseCutoff);
  const hasOpenEntry = cutoffs.some((cutoff) => !cutoff);
  const minuteValues = Array.from(new Set(cutoffs.map(toInputValue)));
  const savedValue = minuteValues.length === 1 ? minuteValues[0] : '';
  const [draft, setDraft] = useState(null);
  const value = draft === null ? savedValue : draft;
  const draftDate = fromInputValue(value);
  const changed = draft !== null && Boolean(draftDate) && draft !== savedValue;

  const procureDay = formatDayLabel(group.procureOnDate);
  const deliveryDay = formatDayLabel(group.originalDeliveryDate);
  const entryOf = (order) => group.entries.find((entry) => entry.community === order.community);
  // While a new time is being chosen the list previews it; otherwise it shows what is saved.
  const isLate = ({ order, enteredAt }) => {
    const cutoff = changed ? draftDate : parseCutoff(entryOf(order));
    return Boolean(cutoff && enteredAt && enteredAt > cutoff);
  };
  const lateCount = group.orders.filter(isLate).length;
  const earlyCount = group.orders.length - lateCount;

  const handleSave = async () => {
    const confirmed = window.confirm(
      `שעת הסגירה: ${format(draftDate, 'dd/MM HH:mm')}\n\n`
      + `ברכש של ${procureDay}: ${countLabel(earlyCount)}\n`
      + `ברכש של ${deliveryDay}: ${countLabel(lateCount)}\n\n`
      + 'אם כבר הזמנתם מהספקים, ודאו שזו השעה שבה הנתונים נטענו לאותה הזמנה. להמשיך?'
    );
    if (!confirmed) return;
    if (await onSave(group, draftDate.toISOString())) setDraft(null);
  };

  return (
    <div className={`mt-3 rounded border p-3 text-sm ${hasOpenEntry ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`}>
      <p className="font-semibold text-gray-800">
        {group.entries.map((entry) => entry.community).join(', ')}
      </p>
      <p className="text-gray-600">{`נרכשות ב${procureDay}, משלוח ב${deliveryDay}`}</p>

      {hasOpenEntry && !changed && (
        <p className="mt-1 font-semibold text-red-800">
          {`לא נקבעה שעת סגירה, ולכן גם הזמנות חדשות ליישובים האלה לא ייכנסו לרכש של ${deliveryDay}. קבעו את השעה שבה נטענו הנתונים לרכש של ${procureDay}.`}
        </p>
      )}
      {!hasOpenEntry && !savedValue && !changed && (
        <p className="mt-1 text-gray-700">
          {`שעות הסגירה: ${group.entries.map((entry, index) => `${entry.community} ${format(cutoffs[index], 'dd/MM HH:mm')}`).join(', ')}`}
        </p>
      )}
      {(!hasOpenEntry || changed) && (
        <p className="mt-1 text-gray-800">
          {changed ? 'לפי השעה שבחרתם (עוד לא נשמר): ' : ''}
          {`${countLabel(earlyCount)} ברכש של ${procureDay}, `}
          <strong>{`${countLabel(lateCount)} שנכנסו אחרי הסגירה ברכש של ${deliveryDay}`}</strong>
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-gray-700">
          שעת סגירת הרכש
          <input
            type="datetime-local"
            value={value}
            onChange={(event) => setDraft(event.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 bg-white"
          />
        </label>
        {group.procureOnDate === selectedDeliveryDate && ordersLoadedAt && (
          <button
            type="button"
            onClick={() => setDraft(toInputValue(ordersLoadedAt))}
            className="px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-100"
          >
            {`לפי הנתונים שעל המסך (${format(ordersLoadedAt, 'HH:mm')})`}
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!changed || saving}
          className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50"
        >
          שמירת שעת הסגירה
        </button>
      </div>

      {group.orders.length > 0 && (
        <details className="mt-2" open={hasOpenEntry || changed}>
          <summary className="cursor-pointer text-gray-700">ההזמנות האחרונות ליישובים האלה</summary>
          <ul className="mt-1 space-y-0.5">
            {group.orders.slice(0, VISIBLE_ORDERS).map((row) => (
              <li key={row.order.id} className={isLate(row) ? 'font-semibold text-teal-800' : 'text-gray-600'}>
                {`${row.enteredAt ? format(row.enteredAt, 'dd/MM HH:mm') : 'ללא שעה'} · ${row.order.community} · ${row.order.customerDetails?.name || ''} · נרכשת ב${isLate(row) ? deliveryDay : procureDay}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

/**
 * Closing time of each early purchase that touches the selected day. Orders that
 * entered after it are purchased on their own delivery day, so none is missed.
 */
const ProcurementCutoffPanel = ({ groups = [], ...props }) => (
  <>
    {groups.map((group) => <CutoffGroup key={group.key} group={group} {...props} />)}
  </>
);

export default ProcurementCutoffPanel;
