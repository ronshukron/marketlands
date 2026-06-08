import React, { useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import usePickupSpots from '../../hooks/usePickupSpots';
import {
  generateAvailableDeliveryDates,
  getEffectiveCutoffAt,
} from '../../utils/deliveryScheduleUtils';
import LoadingSpinner from '../LoadingSpinner';
import AdminBusinessWeeklyCutoffs from './AdminBusinessWeeklyCutoffs';

const FIREBASE_PROJECT_ID = process.env.REACT_APP_FIREBASE_PROJECT_ID || '';
const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

const WEEK_DAYS = [
  { value: 0, label: 'ראשון' },
  { value: 1, label: 'שני' },
  { value: 2, label: 'שלישי' },
  { value: 3, label: 'רביעי' },
  { value: 4, label: 'חמישי' },
  { value: 5, label: 'שישי' },
  { value: 6, label: 'שבת' },
];

const emptyException = {
  date: '',
  enabled: true,
  cutoffAt: '',
  note: '',
  reason: '',
};

const defaultForm = {
  active: true,
  weeklyDays: [],
  cutoffHours: '10',
  horizonWeeks: '8',
  exceptions: [],
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const formatFirestoreError = (err) => {
  if (err?.code === 'permission-denied') {
    return 'אין הרשאת כתיבה ל-Firestore. הוסיפו את כללי deliverySchedules (ראו docs/DeliverySchedules-Firestore-Rules.snippet.txt) ופרסמו אותם ב-Firebase Console.';
  }
  return err?.message || 'שגיאה לא ידועה';
};

const toDatetimeLocal = (value) => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const DeliveryScheduleAdmin = () => {
  const { currentUser, userRole } = useAuth();
  const { pickupSpots } = usePickupSpots();
  const [selectedCommunity, setSelectedCommunity] = useState('');
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSelectedCommunities, setBulkSelectedCommunities] = useState([]);
  const [bulkWeeklyDays, setBulkWeeklyDays] = useState([]);
  const [bulkActive, setBulkActive] = useState(true);
  const [bulkCutoffHours, setBulkCutoffHours] = useState('10');
  const [bulkHorizonWeeks, setBulkHorizonWeeks] = useState('8');
  const [error, setError] = useState('');

  const isAdmin = Boolean(
    currentUser && (userRole === 'admin' || ADMIN_UIDS.includes(currentUser.uid))
  );

  useEffect(() => {
    if (!selectedCommunity && pickupSpots.length > 0) {
      setSelectedCommunity(pickupSpots[0]);
    }
  }, [pickupSpots, selectedCommunity]);

  useEffect(() => {
    if (!currentUser) return;
    if (!isAdmin) {
      setError('You are not authorized to view this page');
      setLoading(false);
      return;
    }
    loadSchedule(selectedCommunity);
  }, [currentUser, isAdmin, selectedCommunity]);

  const loadSchedule = async (communityName) => {
    if (!communityName) return;
    setLoading(true);
    setError('');
    try {
      const scheduleRef = doc(db, 'deliverySchedules', communityName);
      const scheduleSnap = await getDoc(scheduleRef);
      if (!scheduleSnap.exists()) {
        setForm(defaultForm);
        return;
      }

      const data = scheduleSnap.data() || {};
      setForm({
        active: data.active !== false,
        weeklyDays: Array.isArray(data.weeklyDays) ? data.weeklyDays.map(Number) : [],
        cutoffHours: String(data.defaultCutoff?.hoursBeforeDelivery ?? 10),
        horizonWeeks: String(data.horizonWeeks ?? 8),
        exceptions: Object.entries(data.exceptions || {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, exception]) => ({
            date,
            enabled: exception?.enabled !== false,
            cutoffAt: toDatetimeLocal(exception?.cutoffAt),
            note: exception?.note || '',
            reason: exception?.reason || '',
          })),
      });
    } catch (err) {
      console.error('Error loading delivery schedule:', err);
      setError('Failed to load delivery schedule');
    } finally {
      setLoading(false);
    }
  };

  const toggleWeeklyDay = (day) => {
    setForm((prev) => {
      const nextDays = prev.weeklyDays.includes(day)
        ? prev.weeklyDays.filter((value) => value !== day)
        : [...prev.weeklyDays, day].sort((a, b) => a - b);
      return { ...prev, weeklyDays: nextDays };
    });
  };

  const toggleBulkCommunity = (communityName) => {
    setBulkSelectedCommunities((prev) => (
      prev.includes(communityName)
        ? prev.filter((name) => name !== communityName)
        : [...prev, communityName]
    ));
  };

  const toggleBulkWeeklyDay = (day) => {
    setBulkWeeklyDays((prev) => (
      prev.includes(day)
        ? prev.filter((value) => value !== day)
        : [...prev, day].sort((a, b) => a - b)
    ));
  };

  const updateException = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      exceptions: prev.exceptions.map((exception, currentIndex) => (
        currentIndex === index ? { ...exception, [field]: value } : exception
      )),
    }));
  };

  const removeException = (index) => {
    setForm((prev) => ({
      ...prev,
      exceptions: prev.exceptions.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleSave = async () => {
    if (!selectedCommunity) return;

    const cutoffHours = parsePositiveInt(form.cutoffHours, null);
    const horizonWeeks = parsePositiveInt(form.horizonWeeks, null);
    if (cutoffHours === null || horizonWeeks === null || horizonWeeks < 1) {
      Swal.fire('שגיאה', 'שעות חיתוך ומספר שבועות חייבים להיות מספרים תקינים (שבועות לפחות 1)', 'error');
      return;
    }

    const exceptions = {};
    for (const exception of form.exceptions) {
      if (!exception.date) continue;
      exceptions[exception.date] = {
        enabled: exception.enabled,
        ...(exception.cutoffAt ? { cutoffAt: new Date(exception.cutoffAt).toISOString() } : {}),
        ...(exception.note.trim() ? { note: exception.note.trim() } : {}),
        ...(exception.reason.trim() ? { reason: exception.reason.trim() } : {}),
      };
    }

    setSaving(true);
    try {
      await setDoc(doc(db, 'deliverySchedules', selectedCommunity), {
        communityName: selectedCommunity,
        active: Boolean(form.active),
        weeklyDays: form.weeklyDays,
        defaultCutoff: {
          hoursBeforeDelivery: cutoffHours,
        },
        horizonWeeks,
        exceptions,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await loadSchedule(selectedCommunity);
      Swal.fire('נשמר', `לוח המשלוחים נשמר ב-Firebase (${FIREBASE_PROJECT_ID})`, 'success');
    } catch (err) {
      console.error('Error saving delivery schedule:', err);
      Swal.fire('שגיאה', formatFirestoreError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSave = async () => {
    if (bulkSelectedCommunities.length === 0) {
      Swal.fire('שגיאה', 'בחרו לפחות קהילה אחת', 'error');
      return;
    }

    const cutoffHours = parsePositiveInt(bulkCutoffHours, null);
    const horizonWeeks = parsePositiveInt(bulkHorizonWeeks, null);
    if (cutoffHours === null || horizonWeeks === null || horizonWeeks < 1) {
      Swal.fire('שגיאה', 'שעות חיתוך ומספר שבועות חייבים להיות מספרים תקינים (שבועות לפחות 1)', 'error');
      return;
    }

    setBulkSaving(true);
    try {
      await Promise.all(bulkSelectedCommunities.map((communityName) => (
        setDoc(doc(db, 'deliverySchedules', communityName), {
          communityName,
          active: Boolean(bulkActive),
          weeklyDays: bulkWeeklyDays,
          defaultCutoff: {
            hoursBeforeDelivery: cutoffHours,
          },
          horizonWeeks,
          updatedAt: serverTimestamp(),
        }, { merge: true })
      )));

      if (bulkSelectedCommunities.includes(selectedCommunity)) {
        await loadSchedule(selectedCommunity);
      }

      Swal.fire('נשמר', `ימי המשלוח נשמרו עבור ${bulkSelectedCommunities.length} קהילות`, 'success');
    } catch (err) {
      console.error('Error saving bulk delivery schedules:', err);
      Swal.fire('שגיאה', formatFirestoreError(err), 'error');
    } finally {
      setBulkSaving(false);
    }
  };

  const previewCutoffHours = parsePositiveInt(form.cutoffHours, 10);
  const previewHorizonWeeks = Math.max(1, parsePositiveInt(form.horizonWeeks, 8));

  const previewDates = generateAvailableDeliveryDates({
    active: form.active,
    weeklyDays: form.weeklyDays,
    defaultCutoff: { hoursBeforeDelivery: previewCutoffHours },
    horizonWeeks: previewHorizonWeeks,
    exceptions: form.exceptions.reduce((acc, exception) => {
      if (!exception.date) return acc;
      acc[exception.date] = {
        enabled: exception.enabled,
        ...(exception.cutoffAt ? { cutoffAt: exception.cutoffAt } : {}),
      };
      return acc;
    }, {}),
  }).slice(0, 12);

  if (loading) {
    return (
      <div className="py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div className="max-w-3xl mx-auto p-6 text-red-600">{error}</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-6" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">ניהול לוחות משלוחים לקהילות</h1>
      {FIREBASE_PROJECT_ID && (
        <p className="text-sm text-gray-600 mb-6">
          שמירה מ-localhost נכנסת ישירות ל-Firebase: <strong>{FIREBASE_PROJECT_ID}</strong>
          {' '}(אותו פרויקט כמו האתר בפרודקשן, אם ה-.env.local מצביע אליו).
        </p>
      )}

      <div className="bg-white rounded-lg shadow p-5 mb-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-1">הגדרה מהירה לכמה קהילות</h2>
          <p className="text-sm text-gray-600">
            בחרו קהילות בלחיצה, בחרו ימי משלוח משותפים, ושמרו לכולן יחד. חריגים ותצוגה עתידית נשארים בעריכה של קהילה אחת למטה.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-medium text-gray-700">
              קהילות נבחרות ({bulkSelectedCommunities.length})
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBulkSelectedCommunities(pickupSpots.slice())}
                className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
              >
                בחר הכל
              </button>
              <button
                type="button"
                onClick={() => setBulkSelectedCommunities([])}
                className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                נקה
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 max-h-52 overflow-auto border border-gray-100 rounded-md p-2">
            {pickupSpots.map((spot) => {
              const selected = bulkSelectedCommunities.includes(spot);
              return (
                <button
                  key={spot}
                  type="button"
                  onClick={() => toggleBulkCommunity(spot)}
                  className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                    selected
                      ? 'bg-green-600 border-green-700 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-green-400'
                  }`}
                >
                  {spot}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={bulkActive}
            onChange={(event) => setBulkActive(event.target.checked)}
            className="h-4 w-4"
          />
          <span>להפעיל לוח משלוחים לקהילות שנבחרו</span>
        </label>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">ימי משלוח משותפים</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {WEEK_DAYS.map((day) => (
              <label key={day.value} className="flex items-center gap-2 bg-gray-50 rounded-md p-2">
                <input
                  type="checkbox"
                  checked={bulkWeeklyDays.includes(day.value)}
                  onChange={() => toggleBulkWeeklyDay(day.value)}
                />
                <span>{day.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            השמירה המהירה תעדכן רק פעילות, ימי משלוח, שעות חיתוך ברירת מחדל וכמות שבועות קדימה. חריגים קיימים לא יימחקו.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label>
            <span className="block text-sm font-medium text-gray-700 mb-1">שעות חיתוך לפני משלוח</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={bulkCutoffHours}
              onChange={(event) => setBulkCutoffHours(event.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
            <span className="text-xs text-gray-500 mt-1 block">
              יותר שעות = חיתוך מוקדם יותר (פחות זמן להזמנה). להארכת חלון הזמנה — הורידו שעות או הוסיפו חריג עם תאריך חיתוך מאוחר.
            </span>
          </label>
          <label>
            <span className="block text-sm font-medium text-gray-700 mb-1">כמה שבועות קדימה להציג</span>
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={bulkHorizonWeeks}
              onChange={(event) => setBulkHorizonWeeks(event.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={handleBulkSave}
          disabled={bulkSaving || bulkSelectedCommunities.length === 0}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2.5 px-4 rounded-lg"
        >
          {bulkSaving ? 'שומר...' : 'שמור ימי משלוח לקהילות שנבחרו'}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-5 mb-6 space-y-4">
        <h2 className="text-xl font-semibold">עריכה ותצוגה של קהילה אחת</h2>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">קהילה</span>
          <select
            value={selectedCommunity}
            onChange={(event) => setSelectedCommunity(event.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          >
            {pickupSpots.map((spot) => (
              <option key={spot} value={spot}>{spot}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
            className="h-4 w-4"
          />
          <span>לוח משלוחים פעיל</span>
        </label>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">ימי משלוח קבועים</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {WEEK_DAYS.map((day) => (
              <label key={day.value} className="flex items-center gap-2 bg-gray-50 rounded-md p-2">
                <input
                  type="checkbox"
                  checked={form.weeklyDays.includes(day.value)}
                  onChange={() => toggleWeeklyDay(day.value)}
                />
                <span>{day.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label>
            <span className="block text-sm font-medium text-gray-700 mb-1">שעות חיתוך לפני משלוח</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.cutoffHours}
              onChange={(event) => setForm((prev) => ({ ...prev, cutoffHours: event.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
            <span className="text-xs text-gray-500 mt-1 block">
              יותר שעות = חיתוך מוקדם יותר. לאחר שינוי — לחצו «שמור לוח משלוחים» בתחתית העמוד.
            </span>
          </label>
          <label>
            <span className="block text-sm font-medium text-gray-700 mb-1">כמה שבועות קדימה להציג</span>
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={form.horizonWeeks}
              onChange={(event) => setForm((prev) => ({ ...prev, horizonWeeks: event.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </label>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">חריגים לפי תאריך</h2>
          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, exceptions: [...prev.exceptions, emptyException] }))}
            className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            הוסף חריג
          </button>
        </div>

        <div className="space-y-3">
          {form.exceptions.length === 0 && (
            <p className="text-sm text-gray-500">אין חריגים מוגדרים.</p>
          )}
          {form.exceptions.map((exception, index) => (
            <div key={`${exception.date}-${index}`} className="grid grid-cols-1 md:grid-cols-6 gap-2 border border-gray-200 rounded-md p-3">
              <input
                type="date"
                value={exception.date}
                onChange={(event) => updateException(index, 'date', event.target.value)}
                className="border border-gray-300 rounded-md px-2 py-2"
              />
              <select
                value={exception.enabled ? 'true' : 'false'}
                onChange={(event) => updateException(index, 'enabled', event.target.value === 'true')}
                className="border border-gray-300 rounded-md px-2 py-2"
              >
                <option value="true">פעיל</option>
                <option value="false">מבוטל</option>
              </select>
              <input
                type="datetime-local"
                value={exception.cutoffAt}
                onChange={(event) => updateException(index, 'cutoffAt', event.target.value)}
                className="border border-gray-300 rounded-md px-2 py-2 md:col-span-2"
              />
              <input
                type="text"
                value={exception.enabled ? exception.note : exception.reason}
                onChange={(event) => updateException(index, exception.enabled ? 'note' : 'reason', event.target.value)}
                placeholder={exception.enabled ? 'הערה' : 'סיבת ביטול'}
                className="border border-gray-300 rounded-md px-2 py-2"
              />
              <button
                type="button"
                onClick={() => removeException(index)}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                הסר
              </button>
            </div>
          ))}
        </div>
      </div>

      <AdminBusinessWeeklyCutoffs />

      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-xl font-semibold mb-3">תצוגה מקדימה של תאריכים זמינים</h2>
        {previewDates.length === 0 ? (
          <p className="text-sm text-gray-500">אין תאריכים זמינים לפי ההגדרות הנוכחיות.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {previewDates.map((dateKey) => {
              const cutoff = getEffectiveCutoffAt(dateKey, {
                defaultCutoff: { hoursBeforeDelivery: previewCutoffHours },
                exceptions: form.exceptions.reduce((acc, exception) => {
                  if (!exception.date) return acc;
                  acc[exception.date] = { enabled: exception.enabled, cutoffAt: exception.cutoffAt };
                  return acc;
                }, {}),
              });
              return (
                <div key={dateKey} className="border border-green-200 bg-green-50 rounded-md p-3">
                  <div className="font-medium">{dateKey}</div>
                  <div className="text-xs text-gray-600">
                    חיתוך: {cutoff ? cutoff.toLocaleString('he-IL') : 'ללא'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-purple-700 hover:bg-purple-800 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded-lg"
      >
        {saving ? 'שומר...' : 'שמור לוח משלוחים'}
      </button>
    </div>
  );
};

export default DeliveryScheduleAdmin;
