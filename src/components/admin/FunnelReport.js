import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { endOfDay, format, startOfDay } from 'date-fns';
import { fetchDocsByCreatedAtRange } from '../../utils/customerOrderDateQueries';
import { FUNNEL_COLLECTION } from '../../services/funnelService';
import { FUNNEL_STEP_LABELS, FUNNEL_TITLES } from '../../constants/funnel';
import {
  formatPercent,
  summarizeFunnel,
  summarizeSubscriptionExits,
  weekRange,
  whatsappLink,
} from '../../utils/funnelReport';

// "משפכים" on /admin/subscriptions: for a chosen range, how many opened the
// weekly-basket signup and how many finished, who left and why, and the
// four-step count of the regular cart. Funnel numbers come from funnelEvents
// (written by services/funnelService.js since this version went live);
// signups, pauses and cancels come from the subscriptions themselves.

const PENDING_CARD_TEXT = 'היי, ראינו שהתחלת הרשמה לסל השבועי ושמירת הכרטיס לא הושלמה. אפשר לעזור?';
const BY_LABELS = { customer: 'הלקוח', admin: 'אדמין', basket_unavailable: 'הסל לא זמין' };

const loadFunnelEvents = async (start, end) => {
  const docs = await fetchDocsByCreatedAtRange(FUNNEL_COLLECTION, start, end);
  return docs.map((snap) => ({ id: snap.id, ...snap.data() }));
};

const toInputDate = (date) => format(date, 'yyyy-MM-dd');
const fromInputDate = (value, edge) => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return edge === 'end' ? endOfDay(date) : startOfDay(date);
};
const formatDate = (date) => (date ? date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' }) : '');
const formatDateTime = (date) => (date
  ? date.toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '');

const cellClass = 'border-b border-gray-100 px-2 py-1.5';

const FunnelTable = ({ title, summary, split }) => (
  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
    <table className="min-w-full text-sm">
      <caption className="px-3 pt-3 text-right font-bold text-gray-900">{title}</caption>
      <thead>
        <tr className="text-right text-xs text-gray-500">
          <th scope="col" className={cellClass}>שלב</th>
          <th scope="col" className={cellClass}>מבקרים</th>
          <th scope="col" className={cellClass}>המרה</th>
          {split && <th scope="col" className={cellClass}>סל מוכן</th>}
          {split && <th scope="col" className={cellClass}>בונים סל</th>}
        </tr>
      </thead>
      <tbody>
        {summary.steps.map((row, index) => (
          <tr key={row.step} data-testid={`funnel-${summary.funnel}-${row.step}`}>
            <th scope="row" className={`${cellClass} text-right font-medium ${row.optional ? 'pr-6 text-gray-600' : 'text-gray-900'}`}>
              {row.optional ? `מתוכם: ${FUNNEL_STEP_LABELS[row.step]}` : FUNNEL_STEP_LABELS[row.step]}
            </th>
            <td className={`${cellClass} font-bold`}>{row.count}</td>
            <td className={`${cellClass} text-gray-600`}>{formatPercent(row.conversion)}</td>
            {split && (
              <td className={cellClass}>
                {split.readyMade[index].count}
                {split.readyMade[index].conversion !== null && (
                  <span className="mr-1 text-xs text-gray-500">({formatPercent(split.readyMade[index].conversion)})</span>
                )}
              </td>
            )}
            {split && (
              <td className={cellClass}>
                {split.buildYourOwn[index].count}
                {split.buildYourOwn[index].conversion !== null && (
                  <span className="mr-1 text-xs text-gray-500">({formatPercent(split.buildYourOwn[index].conversion)})</span>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const PeopleList = ({ title, rows, kind, emptyText }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-3">
    <h4 className="font-bold text-gray-900">{title} <span className="font-normal text-gray-500">{rows.length}</span></h4>
    {rows.length === 0 ? (
      <p className="mt-1 text-sm text-gray-500">{emptyText}</p>
    ) : (
      <ul className="mt-2 divide-y divide-gray-100 text-sm">
        {rows.map((row) => {
          const link = kind === 'pending' ? whatsappLink(row.phone, PENDING_CARD_TEXT) : whatsappLink(row.phone);
          return (
            <li key={row.id} className="py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-gray-900">{row.name || 'ללא שם'}</span>
                {row.phone && <span dir="ltr" className="text-gray-600">{row.phone}</span>}
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">וואטסאפ</a>
                )}
                <span className="text-xs text-gray-500">
                  {[row.community, row.basketTitle, row.personalBasket ? 'סל אישי' : ''].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-gray-600">
                {kind === 'pending' ? `התחילו ב-${formatDateTime(row.date)}` : formatDate(row.date)}
                {kind !== 'pending' && ` · משלוחים שנוצרו: ${row.cycleCount}`}
                {kind !== 'pending' && row.by && ` · ${BY_LABELS[row.by] || row.by}`}
                {kind !== 'pending' && (
                  <span className="font-semibold text-gray-800">{` · סיבה: ${row.reasonLabel || 'לא צוינה'}`}</span>
                )}
              </div>
              {row.note && <p className="mt-1 rounded bg-gray-50 px-2 py-1 text-sm text-gray-800">"{row.note}"</p>}
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

export default function FunnelReport({ subscriptions, loadEvents = loadFunnelEvents, now: nowProp }) {
  const now = useMemo(() => nowProp || new Date(), [nowProp]);
  const initial = useMemo(() => weekRange(now), [now]);
  const [from, setFrom] = useState(() => toInputDate(initial.start));
  const [to, setTo] = useState(() => toInputDate(initial.end));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const start = fromInputDate(from, 'start');
  const end = fromInputDate(to, 'end');
  const startTime = start ? start.getTime() : 0;
  const endTime = end ? end.getTime() : 0;

  const load = useCallback(async () => {
    if (!startTime || !endTime || startTime > endTime) return;
    setLoading(true);
    try {
      setEvents(await loadEvents(new Date(startTime), new Date(endTime)));
      setError('');
    } catch (err) {
      console.error('Failed to load funnel events:', err);
      setEvents([]);
      setError(err?.code === 'permission-denied'
        ? 'אין הרשאה לקרוא את נתוני המשפך. צריך לפרוס את חוקי Firestore (funnelEvents).'
        : 'טעינת נתוני המשפך נכשלה.');
    } finally {
      setLoading(false);
    }
  }, [loadEvents, startTime, endTime]);

  useEffect(() => { load(); }, [load]);

  const weekly = useMemo(() => summarizeFunnel(events, 'weekly_basket'), [events]);
  const cart = useMemo(() => summarizeFunnel(events, 'cart'), [events]);
  const exits = useMemo(
    () => (startTime && endTime
      ? summarizeSubscriptionExits(subscriptions, { start: new Date(startTime), end: new Date(endTime), now })
      : summarizeSubscriptionExits([], { start: now, end: now, now })),
    [subscriptions, startTime, endTime, now],
  );

  const pickWeek = (weeksBack) => {
    const range = weekRange(now, weeksBack);
    setFrom(toInputDate(range.start));
    setTo(toInputDate(range.end));
  };
  const invalidRange = !startTime || !endTime || startTime > endTime;

  return (
    <section aria-labelledby="funnel-report-title" className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="funnel-report-title" className="text-lg font-black text-gray-900">משפכים</h2>
          <p className="text-sm text-gray-600">מי מתחיל הרשמה לסל שבועי או עגלה, ומי עוצר באמצע.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" onClick={() => pickWeek(0)} className="rounded-full border border-gray-300 bg-white px-3 py-1 hover:border-gray-500">השבוע</button>
          <button type="button" onClick={() => pickWeek(1)} className="rounded-full border border-gray-300 bg-white px-3 py-1 hover:border-gray-500">שבוע שעבר</button>
          <label className="flex items-center gap-1">
            מ-
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="מתאריך"
              className="rounded-lg border border-gray-300 px-2 py-1" />
          </label>
          <label className="flex items-center gap-1">
            עד
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="עד תאריך"
              className="rounded-lg border border-gray-300 px-2 py-1" />
          </label>
        </div>
      </div>

      {invalidRange && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">טווח התאריכים לא תקין.</p>}
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="סיכום סל שבועי">
        {[
          ['נרשמו (שמרו כרטיס)', exits.activated, 'funnel-activated'],
          ['התחילו ולא שמרו כרטיס', exits.pendingCard.length, 'funnel-pending'],
          ['השהו', exits.paused.length, 'funnel-paused'],
          ['ביטלו', exits.canceled.length, 'funnel-canceled'],
        ].map(([label, value, testId]) => (
          <div key={testId} className="rounded-xl border border-gray-200 bg-white p-3" data-testid={testId}>
            <div className="text-2xl font-black text-gray-900">{value}</div>
            <div className="text-xs text-gray-600">{label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">טוענים נתוני משפך...</p>
      ) : (
        <>
          {!error && !invalidRange && events.length === 0 && (
            <p className="rounded-lg bg-white p-2 text-sm text-gray-600">
              אין נתוני משפך בטווח הזה. המעקב מתחיל מהיום שבו הגרסה הזו עלתה לאתר.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <FunnelTable title={FUNNEL_TITLES.weekly_basket} summary={weekly} split={weekly.split} />
            <FunnelTable title={FUNNEL_TITLES.cart} summary={cart} split={null} />
          </div>
          <p className="text-xs text-gray-500">
            מבקרים = דפדפנים. מי שהגיע לשלב מאוחר יותר נספר גם בשלבים שלפניו (חוץ מ"שינו את הסל", שאינו חובה).
            המרה = מתוך השלב הקודם.
            {weekly.split && weekly.split.unknown > 0 && ` ${weekly.split.unknown} מבקרים בסל השבועי בלי סוג סל ידוע.`}
          </p>
        </>
      )}

      {exits.reasons.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <caption className="px-3 pt-3 text-right font-bold text-gray-900">למה עצרו</caption>
            <thead>
              <tr className="text-right text-xs text-gray-500">
                <th scope="col" className={cellClass}>סיבה</th>
                <th scope="col" className={cellClass}>השהו</th>
                <th scope="col" className={cellClass}>ביטלו</th>
              </tr>
            </thead>
            <tbody>
              {exits.reasons.map((row) => (
                <tr key={row.reason || 'none'}>
                  <th scope="row" className={`${cellClass} text-right font-medium`}>{row.label}</th>
                  <td className={cellClass}>{row.paused}</td>
                  <td className={cellClass}>{row.canceled}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <PeopleList title="התחילו ולא שמרו כרטיס" rows={exits.pendingCard} kind="pending"
          emptyText="אין הרשמות שנתקעו לפני שמירת הכרטיס." />
        <PeopleList title="השהו" rows={exits.paused} kind="paused" emptyText="אף אחד לא השהה בטווח הזה." />
        <PeopleList title="ביטלו" rows={exits.canceled} kind="canceled" emptyText="אף אחד לא ביטל בטווח הזה." />
      </div>
    </section>
  );
}
