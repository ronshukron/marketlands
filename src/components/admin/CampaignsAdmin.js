import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { endOfDay, format, startOfDay, subDays } from 'date-fns';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { isAdminAccount } from '../../utils/accountRoles';
import { fetchDocsByCreatedAtRange } from '../../utils/customerOrderDateQueries';
import { listAllSubscriptions } from '../../services/basketSubscriptionService';
import { campaignLink, listCampaignLinks, saveCampaignLink } from '../../services/campaignService';
import { normalizeCampaignCode } from '../../utils/campaignAttribution';
import { CAMPAIGN_CART_STEPS, summarizeCampaigns } from '../../utils/campaignReport';
import { formatPercent } from '../../utils/funnelReport';

// /admin/campaigns: a link (and QR) per flyer, and how each one performs:
// visitors, the cart steps, paid orders and revenue, weekly-basket signups,
// and the paths people took. Add a new link whenever a new flyer goes out.

const STEP_LABELS = {
  cart_started: 'הוסיפו לעגלה',
  checkout_opened: 'הגיעו לקופה',
  payment_started: 'עברו לתשלום',
  order_completed: 'סיימו הזמנה',
};
const money = (value) => `₪${(Number(value) || 0).toFixed(2)}`;
const toInput = (date) => format(date, 'yyyy-MM-dd');
const fromInput = (value, edge) => {
  const [y, m, d] = String(value || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return edge === 'end' ? endOfDay(date) : startOfDay(date);
};

const loadReportData = async (start, end) => {
  const [eventDocs, delayedDocs, regularDocs, subscriptions] = await Promise.all([
    fetchDocsByCreatedAtRange('funnelEvents', start, end),
    fetchDocsByCreatedAtRange('customerOrdersDelayed', start, end),
    fetchDocsByCreatedAtRange('customerOrders', start, end),
    listAllSubscriptions().catch(() => []),
  ]);
  return {
    events: eventDocs.map((snap) => snap.data()).filter((event) => event.campaign),
    orders: [
      ...delayedDocs.map((snap) => ({ id: snap.id, collection: 'customerOrdersDelayed', ...snap.data() })),
      ...regularDocs.map((snap) => ({ id: snap.id, collection: 'customerOrders', ...snap.data() })),
    ].filter((order) => order.campaign?.code),
    subscriptions,
  };
};

const NewLinkForm = ({ onSaved }) => {
  const [form, setForm] = useState({ name: '', code: '', target: '/' });
  const [saving, setSaving] = useState(false);
  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const code = await saveCampaignLink({ ...form, active: true, isNew: true });
      setForm({ name: '', code: '', target: '/' });
      await onSaved();
      Swal.fire({ icon: 'success', title: 'הקישור מוכן', text: campaignLink(code), confirmButtonText: 'הבנתי' });
    } catch (error) {
      Swal.fire('לא נשמר', error?.message || '', 'error');
    } finally {
      setSaving(false);
    }
  };
  const codeOk = Boolean(normalizeCampaignCode(form.code));
  return (
    <form onSubmit={save} className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-4 sm:items-end">
      <label className="text-sm font-medium text-gray-700">
        שם (לכם)
        <input value={form.name} onChange={update('name')} placeholder="פלייר ירוק" maxLength={80}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
      </label>
      <label className="text-sm font-medium text-gray-700">
        קוד בקישור
        <input value={form.code} onChange={update('code')} placeholder="green" maxLength={40} dir="ltr"
          className={`mt-1 w-full rounded-lg border px-3 py-2 ${form.code && !codeOk ? 'border-red-400' : 'border-gray-300'}`} />
      </label>
      <label className="text-sm font-medium text-gray-700">
        לאן מגיעים
        <input value={form.target} onChange={update('target')} placeholder="/" dir="ltr"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
      </label>
      <button type="submit" disabled={saving || !codeOk}
        className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50">
        קישור חדש
      </button>
      <p className="text-xs text-gray-500 sm:col-span-4">
        הקוד: אותיות באנגלית, ספרות ומקף. הוא חלק מהקישור ולא משתנה אחרי ההדפסה; את היעד ("לאן מגיעים") אפשר לשנות בכל זמן,
        למשל <span dir="ltr">/</span> לדף הבית או <span dir="ltr">/?category=פירות</span>.
      </p>
    </form>
  );
};

const CampaignCard = ({ row, link, onChanged }) => {
  const [showPaths, setShowPaths] = useState(false);
  const url = campaignLink(row.code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      Swal.fire({ icon: 'success', title: 'הקישור הועתק', timer: 1000, showConfirmButton: false });
    } catch (error) {
      Swal.fire('הקישור', url, 'info');
    }
  };
  const editTarget = async () => {
    const answer = await Swal.fire({
      title: 'לאן הקישור מוביל?', input: 'text', inputValue: link?.target || '/',
      showCancelButton: true, confirmButtonText: 'שמירה', cancelButtonText: 'ביטול',
    });
    if (!answer.isConfirmed) return;
    await saveCampaignLink({ code: row.code, name: link?.name, target: answer.value, active: link?.active !== false });
    onChanged();
  };
  const toggleActive = async () => {
    await saveCampaignLink({ code: row.code, name: link?.name, target: link?.target, active: link?.active === false });
    onChanged();
  };
  return (
    <li className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 [&_p]:mb-0" data-testid={`campaign-${row.code}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-gray-900">
          {row.name}
          <span className="mr-2 text-xs font-normal text-gray-500" dir="ltr">{row.code}</span>
          {link && link.active === false && <span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">כבוי</span>}
          {!link && <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">קוד בלי קישור</span>}
        </p>
        {link && (
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={copy} className="rounded-lg border border-gray-300 px-2 py-1 font-semibold">העתקת הקישור</button>
            <button type="button" onClick={editTarget} className="rounded-lg border border-gray-300 px-2 py-1 font-semibold">יעד: <span dir="ltr">{link.target || '/'}</span></button>
            <button type="button" onClick={toggleActive} className="rounded-lg border border-gray-300 px-2 py-1 font-semibold">
              {link.active === false ? 'הפעלה' : 'כיבוי'}
            </button>
          </div>
        )}
      </div>
      {link && <p className="text-xs text-gray-500" dir="ltr">{url}</p>}
      <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-lg font-black text-gray-900">{row.visitors}</p>
          <p className="text-[11px] text-gray-600">מבקרים ({row.scans} סרקו)</p>
        </div>
        {row.steps.map((entry) => (
          <div key={entry.step} className="rounded-lg bg-gray-50 p-2">
            <p className="text-lg font-black text-gray-900">{entry.count}</p>
            <p className="text-[11px] text-gray-600">{STEP_LABELS[entry.step]} {entry.conversion !== null ? `(${formatPercent(entry.conversion)})` : ''}</p>
          </div>
        ))}
        <div className="rounded-lg bg-emerald-50 p-2">
          <p className="text-lg font-black text-emerald-800">{row.paidOrders}</p>
          <p className="text-[11px] text-emerald-900">הזמנות · {money(row.revenue)}{row.revenueHasEstimates ? '*' : ''}</p>
        </div>
      </div>
      <p className="text-xs text-gray-600">
        סל שבועי: {row.signupsStarted} התחילו הרשמה · {row.subscriptions} נרשמו
        {row.topPaths.length > 0 && (
          <button type="button" onClick={() => setShowPaths((open) => !open)} className="mr-3 font-semibold text-blue-700 underline">
            {showPaths ? 'הסתרת המסלולים' : 'המסלולים הנפוצים'}
          </button>
        )}
      </p>
      {showPaths && (
        <ol className="list-decimal space-y-0.5 pr-5 text-xs text-gray-700">
          {row.topPaths.map((entry) => (
            <li key={entry.path}><span dir="ltr">{entry.path}</span> · {entry.count}</li>
          ))}
        </ol>
      )}
    </li>
  );
};

export default function CampaignsAdmin({ loadData = loadReportData, now: nowProp }) {
  const { currentUser, userRole, loading: authLoading } = useAuth();
  const isAdmin = isAdminAccount(currentUser, userRole);
  const now = useMemo(() => nowProp || new Date(), [nowProp]);
  const [links, setLinks] = useState(null);
  const [from, setFrom] = useState(() => toInput(subDays(now, 29)));
  const [to, setTo] = useState(() => toInput(now));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const loadLinks = useCallback(async () => setLinks(await listCampaignLinks()), []);
  const start = fromInput(from, 'start');
  const end = fromInput(to, 'end');
  const startTime = start ? start.getTime() : 0;
  const endTime = end ? end.getTime() : 0;

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    loadLinks().catch(() => setLinks([]));
  }, [authLoading, isAdmin, loadLinks]);

  useEffect(() => {
    if (authLoading || !isAdmin || !startTime || !endTime || startTime > endTime) return undefined;
    let active = true;
    setData(null);
    loadData(new Date(startTime), new Date(endTime))
      .then((result) => { if (active) { setData(result); setError(''); } })
      .catch((err) => {
        console.error('Failed to load the campaigns report:', err);
        if (active) {
          setData({ events: [], orders: [], subscriptions: [] });
          setError(err?.code === 'permission-denied' ? 'אין הרשאה לקרוא את הנתונים (צריך לפרוס את חוקי Firestore).' : 'טעינת הדוח נכשלה.');
        }
      });
    return () => { active = false; };
  }, [authLoading, isAdmin, loadData, startTime, endTime]);

  const rows = useMemo(() => (data && links
    ? summarizeCampaigns({ links, ...data, start: new Date(startTime), end: new Date(endTime) })
    : []), [data, links, startTime, endTime]);

  if (authLoading) return <div className="py-12"><LoadingSpinner /></div>;
  if (!isAdmin) return <div className="p-6 text-center text-red-700" dir="rtl">אין הרשאה לדף הזה</div>;

  const pick = (days) => {
    setFrom(toInput(subDays(now, days - 1)));
    setTo(toInput(now));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 text-right sm:p-6 [&_p]:mb-0" dir="rtl">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-gray-900">קמפיינים (QR ופליירים)</h1>
          <p className="text-sm text-gray-600">קישור לכל פלייר. מי שסורק נספר לקמפיין 30 יום (הסריקה האחרונה קובעת).</p>
        </div>
        <Link to="/admin" className="text-sm text-blue-700 hover:underline">לוח הניהול</Link>
      </div>

      <NewLinkForm onSaved={loadLinks} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {[[7, '7 ימים'], [30, '30 יום'], [90, '90 יום']].map(([days, label]) => (
          <button key={days} type="button" onClick={() => pick(days)} className="rounded-full border border-gray-300 bg-white px-3 py-1">{label}</button>
        ))}
        <label className="flex items-center gap-1">מ-
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="מתאריך" className="rounded-lg border border-gray-300 px-2 py-1" />
        </label>
        <label className="flex items-center gap-1">עד
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="עד תאריך" className="rounded-lg border border-gray-300 px-2 py-1" />
        </label>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {links === null || data === null ? (
        <div className="py-8"><LoadingSpinner /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">עוד אין קישורים. הוסיפו קישור לפלייר הראשון.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <CampaignCard key={row.code} row={row} link={links.find((link) => link.id === row.code)} onChanged={loadLinks} />
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-500">
        מבקרים = דפדפנים. מי שהגיע לשלב מאוחר נספר גם בשלבים שלפניו; ההמרה היא מהשלב הקודם.
        הזמנות והכנסות לפי ההזמנות עצמן (* כולל הערכה להזמנות שעוד לא נשקלו).
        ההוספות לעגלה וההזמנות נספרות רק מהגרסה הזו ואילך.
      </p>
    </div>
  );
}
