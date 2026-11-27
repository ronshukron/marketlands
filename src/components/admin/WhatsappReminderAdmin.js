import React, { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import {
  describeSubscriptionError,
  listReminderMessages,
  loadNotificationConfig,
  saveNotificationConfig,
  sendWhatsappTest,
} from '../../services/basketSubscriptionService';

// Admin pieces of the WhatsApp reminder before orders close
// (functions/handlers/whatsappReminders.js): the settings, a test message to
// the admin's own phone, and each customer's choice and last reminder.

export const REMINDER_STATUS_LABELS = {
  dry_run: 'מצב בדיקה (לא נשלח)',
  sending: 'בשליחה',
  retry_pending: 'ממתין לניסיון נוסף',
  sent: 'נשלח',
  delivered: 'נמסר',
  read: 'נקרא',
  failed: 'נכשל',
};

const pad = (hour) => String(hour).padStart(2, '0');

const formatTime = (value) => {
  const date = value?.toDate ? value.toDate() : (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export function WhatsappReminderSettings() {
  const [config, setConfig] = useState(null);
  const [hours, setHours] = useState('4');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let active = true;
    loadNotificationConfig()
      .then((loaded) => {
        if (!active) return;
        setConfig(loaded);
        setHours(String(loaded.basketReminderHoursBeforeCutoff));
      })
      .catch(() => { if (active) setConfig(null); });
    return () => { active = false; };
  }, []);

  const save = async (patch) => {
    if (!config) return;
    setSaving(true);
    try {
      const next = { ...config, ...patch };
      const savedHours = await saveNotificationConfig(next);
      setConfig({ ...next, basketReminderHoursBeforeCutoff: savedHours });
      setHours(String(savedHours));
    } catch (error) {
      Swal.fire('השמירה נכשלה', error?.message || '', 'error');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const result = await sendWhatsappTest();
      if (result?.dryRun) {
        Swal.fire('מצב בדיקה', `המפתחות של WhatsApp עוד לא הוגדרו, ולכן ההודעה לא נשלחה. היא נרשמה ביומן ההודעות (למספר שמסתיים ב-${result.to}).`, 'info');
      } else {
        Swal.fire('ההודעה נשלחה', `בדקו את הוואטסאפ במספר שמסתיים ב-${result?.to}.`, 'success');
      }
    } catch (error) {
      const data = error?.response?.data;
      const detail = data?.error?.message || data?.error?.code || '';
      Swal.fire('השליחה נכשלה', detail || describeSubscriptionError(error), 'error');
    } finally {
      setTesting(false);
    }
  };

  if (!config) return null;
  return (
    <section className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-950" aria-label="תזכורת בוואטסאפ">
      <h2 className="font-bold">תזכורת בוואטסאפ לפני סגירת ההזמנות</h2>
      <p className="mt-1 text-xs text-green-900">
        נשלחת ללקוחות שאישרו, עם קישור לעריכת המשלוח. לא נשלחת בין {pad(config.quietHoursStart)}:00
        ל-{pad(config.quietHoursEnd)}:00; תזכורת שנופלת בשעות האלה מוקדמת ל-{pad(config.quietHoursStart)}:00.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={config.basketReminderEnabled}
            disabled={saving}
            onChange={(event) => save({ basketReminderEnabled: event.target.checked })}
            className="h-4 w-4 accent-green-600"
          />
          פעיל
        </label>
        <label className="flex items-center gap-2">
          שעות לפני סגירת ההזמנות:
          <input
            type="number"
            min={1}
            max={72}
            value={hours}
            disabled={saving}
            onChange={(event) => setHours(event.target.value)}
            onBlur={() => { if (Number(hours) !== config.basketReminderHoursBeforeCutoff) save({ basketReminderHoursBeforeCutoff: hours }); }}
            className="w-16 rounded border border-green-300 px-2 py-1"
            aria-label="שעות לפני סגירת ההזמנות"
          />
        </label>
        <button
          type="button"
          onClick={test}
          disabled={testing}
          className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50"
        >
          {testing ? 'שולחים…' : 'שלח הודעת בדיקה לטלפון שלי'}
        </button>
      </div>
    </section>
  );
}

/** A customer's choice and the latest reminder, inside their details panel. */
export function WhatsappReminderStatus({ subscription, busy, onToggle }) {
  const [messages, setMessages] = useState(null);
  const load = useCallback(() => {
    listReminderMessages(subscription).then(setMessages).catch(() => setMessages([]));
  }, [subscription]);
  useEffect(() => { load(); }, [load]);

  const whatsapp = subscription.notifications?.whatsapp || null;
  const last = messages && messages[0];
  let choice = 'לא בחר';
  if (whatsapp?.optIn === true) choice = `מאושר${whatsapp.phoneE164 ? ` (מסתיים ב-${String(whatsapp.phoneE164).slice(-4)})` : ''}`;
  else if (whatsapp?.source === 'inbound_stop') choice = 'ביקש להפסיק (השיב "הסר")';
  else if (whatsapp) choice = 'לא מאושר';

  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>{choice}</span>
        {onToggle && (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => onToggle(!(whatsapp?.optIn === true))}
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
          >
            {whatsapp?.optIn === true ? 'כיבוי' : 'הפעלה'}
          </button>
        )}
      </div>
      {messages === null && <div className="text-xs text-gray-400">טוען…</div>}
      {last && (
        <div className={`text-xs ${last.status === 'failed' ? 'text-red-700' : 'text-gray-600'}`}>
          תזכורת אחרונה: {REMINDER_STATUS_LABELS[last.status] || last.status}
          {formatTime(last.updatedAt || last.createdAt) ? ` · ${formatTime(last.updatedAt || last.createdAt)}` : ''}
          {last.error?.message ? ` · ${last.error.message}` : ''}
        </div>
      )}
      {messages && messages.length === 0 && <div className="text-xs text-gray-400">עוד לא נשלחה תזכורת</div>}
    </div>
  );
}
