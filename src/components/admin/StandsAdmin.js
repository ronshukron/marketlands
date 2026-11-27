import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import usePickupSpots from '../../hooks/usePickupSpots';
import LoadingSpinner from '../LoadingSpinner';
import { isAdminAccount } from '../../utils/accountRoles';
import { whatsappLink } from '../../utils/funnelReport';
import {
  DEFAULT_STAND_SLUG,
  STAND_STATUS_LABELS,
  describeStandError,
  listStands,
  saveStand,
  settleStandOrder,
  standLink,
  watchStandOrders,
} from '../../services/standService';

// /admin/stands: the leftovers stand ("בסטה ליד הבית"). Set the stand's
// community and discount, open or close it, get its link (for the QR sign),
// and charge or cancel each order customers paid for with a card hold.

const money = (value) => `₪${(Number(value) || 0).toFixed(2)}`;
const toDate = (value) => (value && typeof value.toDate === 'function' ? value.toDate() : (value ? new Date(value) : null));
const when = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
};
const EMPTY_STAND = { name: 'בסטה ליד הבית', community: '', discountPercent: 30, active: true, note: '', slug: DEFAULT_STAND_SLUG };

const StandEditor = ({ stand, communities, onSaved }) => {
  const [form, setForm] = useState(stand);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(stand); }, [stand]);
  const update = (field) => (event) => setForm((prev) => ({
    ...prev,
    [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
  }));
  const save = async () => {
    if (!form.community) {
      Swal.fire('חסר יישוב', 'בחרו מאיזה יישוב להציג את המוצרים.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await saveStand(form);
      await onSaved();
      Swal.fire({ icon: 'success', title: 'נשמר', timer: 1200, showConfirmButton: false });
    } catch (error) {
      Swal.fire('השמירה נכשלה', error?.message || '', 'error');
    } finally {
      setSaving(false);
    }
  };
  const link = form.id ? standLink(form.id) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      Swal.fire({ icon: 'success', title: 'הקישור הועתק', timer: 1000, showConfirmButton: false });
    } catch (error) {
      Swal.fire('הקישור', link, 'info');
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 [&_p]:mb-0">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">
          שם הבסטה
          <input value={form.name} onChange={update('name')} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-gray-700">
          המוצרים של היישוב
          <select value={form.community} onChange={update('community')} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="">בחרו יישוב</option>
            {communities.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          הנחה על הכל (%)
          <input type="number" min="0" max="90" value={form.discountPercent} onChange={update('discountPercent')}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-gray-800">
          <input type="checkbox" checked={Boolean(form.active)} onChange={update('active')} className="h-5 w-5 accent-emerald-600" />
          הבסטה פתוחה
        </label>
      </div>
      {!form.id && (
        <label className="block text-sm font-medium text-gray-700">
          כתובת הדף (לקישור ול-QR)
          <span className="mt-1 flex items-center gap-1" dir="ltr">
            <span className="text-sm text-gray-500">{window.location.host}/stand/</span>
            <input value={form.slug || ''} onChange={update('slug')} maxLength={40}
              className="w-40 rounded-lg border border-gray-300 px-3 py-2" />
          </span>
        </label>
      )}
      <label className="block text-sm font-medium text-gray-700">
        הודעה בדף (לא חובה)
        <input value={form.note} onChange={update('note')} maxLength={300} placeholder="למשל: המשקל ליד הדלת"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={saving}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {form.id ? 'שמירה' : 'יצירת הבסטה'}
        </button>
        {link && (
          <>
            <button type="button" onClick={copy} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">העתקת הקישור</button>
            <a href={link} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold">פתיחת הדף</a>
            <span className="text-xs text-gray-500" dir="ltr">{link}</span>
          </>
        )}
      </div>
    </div>
  );
};

const OrderCard = ({ order }) => {
  const [busy, setBusy] = useState(false);
  const details = order.customerDetails || {};
  const holdSum = Number(order.delayedPayment?.holdSum) || Number(order.total) || 0;
  const status = order.paymentStatus;
  const act = async (action, amount = null) => {
    setBusy(true);
    try {
      await settleStandOrder(order.id, action, amount);
    } catch (error) {
      Swal.fire('הפעולה נכשלה', describeStandError(error), 'error');
    } finally {
      setBusy(false);
    }
  };
  const charge = async () => {
    const answer = await Swal.fire({
      title: `לחייב ${money(order.total)}?`,
      text: `${details.name || 'הלקוח'} · ${(order.lines || []).length} מוצרים`,
      icon: 'question', showCancelButton: true, confirmButtonText: 'חיוב', cancelButtonText: 'לא',
    });
    if (answer.isConfirmed) act('charge');
  };
  const chargeOther = async () => {
    const answer = await Swal.fire({
      title: 'כמה לחייב?', input: 'number',
      inputAttributes: { min: '0.01', max: String(holdSum), step: '0.01' },
      inputValue: Number(order.total).toFixed(2),
      text: `עד ${money(holdSum)} (מה שאושר בכרטיס)`,
      showCancelButton: true, confirmButtonText: 'חיוב', cancelButtonText: 'ביטול',
      inputValidator: (value) => (!(Number(value) > 0) || Number(value) > holdSum ? 'סכום לא תקין' : null),
    });
    if (answer.isConfirmed) act('charge', Number(answer.value));
  };
  const cancel = async () => {
    const answer = await Swal.fire({
      title: 'לבטל את ההזמנה?', text: 'לא יהיה חיוב. האישור בכרטיס יפוג מעצמו.',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'ביטול ההזמנה', cancelButtonText: 'חזרה',
    });
    if (answer.isConfirmed) act('cancel');
  };
  const wa = whatsappLink(details.phone);
  return (
    <li className={`rounded-xl border p-3 ${status === 'held' ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'} [&_p]:mb-0`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-gray-900">
          {details.name || 'ללא שם'}
          {details.phone && <a href={`tel:${details.phone}`} className="mr-2 text-sm font-normal text-blue-700" dir="ltr">{details.phone}</a>}
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="mr-2 text-sm font-normal text-emerald-700 underline">וואטסאפ</a>}
        </p>
        <span className="text-xs text-gray-600">{when(order.createdAt)} · {order.standName}</span>
      </div>
      <ul className="mt-1 text-sm text-gray-700">
        {(order.lines || []).map((line) => (
          <li key={line.productId} className="flex justify-between gap-2">
            <span>{line.productName} · {line.quantity} {line.unit === 'package' ? "יח'" : 'ק"ג'}</span>
            <span>{money(line.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <strong>{money(order.finalSum ?? order.total)}</strong>
          <span className="mr-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-700">{STAND_STATUS_LABELS[status] || status}</span>
          {order.lastError && <span className="mr-2 text-xs text-red-600">{order.lastError}</span>}
        </p>
        {status === 'held' && (
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={charge}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60">חיוב {money(order.total)}</button>
            <button type="button" disabled={busy} onClick={chargeOther}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold">סכום אחר</button>
            <button type="button" disabled={busy} onClick={cancel}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-700">ביטול</button>
          </div>
        )}
        {status === 'pending_payment' && (
          <button type="button" disabled={busy} onClick={cancel} className="text-xs text-gray-500 underline">הסרה מהרשימה</button>
        )}
      </div>
    </li>
  );
};

export default function StandsAdmin() {
  const { currentUser, userRole, loading: authLoading } = useAuth();
  const isAdmin = isAdminAccount(currentUser, userRole);
  const { pickupSpots = [] } = usePickupSpots();
  const [stands, setStands] = useState(null);
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('held');
  const [ordersError, setOrdersError] = useState('');

  const load = useCallback(async () => {
    setStands(await listStands());
  }, []);
  useEffect(() => {
    if (authLoading || !isAdmin) return undefined;
    load().catch(() => setStands([]));
    return watchStandOrders(setOrders, () => setOrdersError('טעינת ההזמנות נכשלה (צריך לפרוס את חוקי Firestore).'));
  }, [authLoading, isAdmin, load]);

  const communities = useMemo(() => [...new Set((pickupSpots || []).map((spot) => (typeof spot === 'string' ? spot : spot?.name)).filter(Boolean))].sort(), [pickupSpots]);
  const shown = orders.filter((order) => (filter === 'held' ? order.paymentStatus === 'held' : order.paymentStatus !== 'pending_payment' || filter === 'all'));
  const heldCount = orders.filter((order) => order.paymentStatus === 'held').length;

  if (authLoading) return <div className="py-12"><LoadingSpinner /></div>;
  if (!isAdmin) return <div className="p-6 text-center text-red-700" dir="rtl">אין הרשאה לדף הזה</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 text-right sm:p-6 [&_p]:mb-0" dir="rtl">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-gray-900">בסטה ליד הבית</h1>
          <p className="text-sm text-gray-600">מוצרים שנשארו, בהנחה, ליד הבית. לקוחות סורקים, מזינים מה לקחו ומאשרים בכרטיס; אתם מחייבים.</p>
        </div>
        <Link to="/admin" className="text-sm text-blue-700 hover:underline">לוח הניהול</Link>
      </div>

      <section className="space-y-3">
        {stands === null ? <LoadingSpinner /> : (
          <>
            {stands.map((stand) => (
              <StandEditor key={stand.id} stand={{ ...EMPTY_STAND, ...stand }} communities={communities} onSaved={load} />
            ))}
            {stands.length === 0 && <StandEditor stand={EMPTY_STAND} communities={communities} onSaved={load} />}
          </>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-gray-900">הזמנות</h2>
          {[['held', `ממתינות לחיוב (${heldCount})`], ['done', 'אחרונות'], ['all', 'הכל, כולל לא שולמו']].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${filter === value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white'}`}>
              {label}
            </button>
          ))}
        </div>
        {ordersError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{ordersError}</p>}
        {shown.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">אין הזמנות להצגה</p>
        ) : (
          <ul className="space-y-2">{shown.map((order) => <OrderCard key={order.id} order={order} />)}</ul>
        )}
      </section>
    </div>
  );
}
