import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import usePickupSpots from '../../hooks/usePickupSpots';
import {
  generateAvailableDeliveryDates,
  getDeliveryScheduleDocumentKeys,
  getEffectiveCutoffAt,
} from '../../utils/deliveryScheduleUtils';
import { loadFarmerBadgeBusinessIds, saveFarmerBadgeBusinessIds } from '../../services/farmerBadgeService';
import {
  expandFarmerBadgeSelection,
  farmerBadgeGroupIsSelected,
  groupBusinessesForFarmerBadge,
  toggleFarmerBadgeGroupIds,
} from '../../utils/farmerBadgeUtils';
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

const getScheduleCommunityKey = (communityName) => (
  getDeliveryScheduleDocumentKeys(communityName)[0] || communityName
);

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
  const [businesses, setBusinesses] = useState([]);
  const [businessesLoading, setBusinessesLoading] = useState(false);
  const [businessSearch, setBusinessSearch] = useState('');
  const [farmerBadgeBusinessIds, setFarmerBadgeBusinessIds] = useState([]);
  const [savingFarmerBadges, setSavingFarmerBadges] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = Boolean(
    currentUser && (userRole === 'admin' || ADMIN_UIDS.includes(currentUser.uid))
  );

  const farmerBadgeGroups = useMemo(
    () => groupBusinessesForFarmerBadge(businesses),
    [businesses],
  );

  const selectedFarmerGroups = useMemo(() => (
    farmerBadgeGroups
      .filter((group) => farmerBadgeGroupIsSelected(group, farmerBadgeBusinessIds))
      .sort((a, b) => a.label.localeCompare(b.label, 'he'))
  ), [farmerBadgeBusinessIds, farmerBadgeGroups]);

  const visibleFarmerGroups = useMemo(() => {
    const normalizedSearch = businessSearch.trim().toLowerCase();
    return farmerBadgeGroups
      .filter((group) => (
        !normalizedSearch
        || group.label.toLowerCase().includes(normalizedSearch)
        || group.ids.some((id) => id.toLowerCase().includes(normalizedSearch))
      ))
      .sort((a, b) => {
        const aSelected = farmerBadgeGroupIsSelected(a, farmerBadgeBusinessIds);
        const bSelected = farmerBadgeGroupIsSelected(b, farmerBadgeBusinessIds);
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        return a.label.localeCompare(b.label, 'he');
      });
  }, [businessSearch, farmerBadgeBusinessIds, farmerBadgeGroups]);

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

  useEffect(() => {
    if (!isAdmin) return;

    let active = true;
    const loadBusinesses = async () => {
      setBusinessesLoading(true);
      try {
        const snapshot = await getDocs(collection(db, 'businesses'));
        if (active) {
          setBusinesses(snapshot.docs.map((businessDoc) => ({
            ...businessDoc.data(),
            id: businessDoc.id,
          })));
        }
      } catch (err) {
        console.error('Error loading businesses for farmer badges:', err);
        if (active) {
          Swal.fire('שגיאה', 'טעינת רשימת העסקים נכשלה', 'error');
        }
      } finally {
        if (active) setBusinessesLoading(false);
      }
    };

    loadBusinesses();
    return () => {
      active = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return undefined;

    let active = true;
    loadFarmerBadgeBusinessIds()
      .then((businessIds) => {
        if (active) setFarmerBadgeBusinessIds(businessIds);
      })
      .catch((err) => {
        console.error('Error loading farmer badges:', err);
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const loadSchedule = async (communityName) => {
    if (!communityName) return;
    setLoading(true);
    setError('');
    try {
      const scheduleKeys = getDeliveryScheduleDocumentKeys(communityName);
      let data = null;
      for (const key of scheduleKeys) {
        const scheduleSnap = await getDoc(doc(db, 'deliverySchedules', key));
        if (scheduleSnap.exists()) {
          data = scheduleSnap.data() || {};
          break;
        }
      }
      if (!data) {
        setForm(defaultForm);
        return;
      }
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

  const toggleFarmerBadgeGroup = (group) => {
    setFarmerBadgeBusinessIds((prev) => toggleFarmerBadgeGroupIds(prev, group));
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
      const communityKey = getScheduleCommunityKey(selectedCommunity);
      await setDoc(doc(db, 'deliverySchedules', communityKey), {
        communityName: communityKey,
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

  const handleSaveFarmerBadges = async () => {
    setSavingFarmerBadges(true);
    try {
      const expanded = expandFarmerBadgeSelection({
        selectedIds: farmerBadgeBusinessIds,
        selectedNames: selectedFarmerGroups.map((group) => group.label),
        businesses,
      });
      const saved = await saveFarmerBadgeBusinessIds(expanded.ids, expanded.names);
      setFarmerBadgeBusinessIds(saved.ids);
      Swal.fire('נשמר', 'תגי החקלאי נשמרו לכל נקודות האיסוף', 'success');
    } catch (err) {
      console.error('Error saving farmer badges:', err);
      Swal.fire('שגיאה', formatFirestoreError(err), 'error');
    } finally {
      setSavingFarmerBadges(false);
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
      await Promise.all(bulkSelectedCommunities.map((communityName) => {
        const communityKey = getScheduleCommunityKey(communityName);
        return setDoc(doc(db, 'deliverySchedules', communityKey), {
          communityName: communityKey,
          active: Boolean(bulkActive),
          weeklyDays: bulkWeeklyDays,
          defaultCutoff: {
            hoursBeforeDelivery: cutoffHours,
          },
          horizonWeeks,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }));

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
            השמירה המהירה תעדכן רק פעילות, ימי משלוח, שעות חיתוך ברירת מחדל וכמות שבועות קדימה. חריגים וסימוני חקלאי קיימים לא יימחקו.
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

      <div className="bg-amber-50 border border-amber-200 rounded-lg shadow p-5 mb-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-amber-950">עסקים עם תג חקלאי</h2>
            <p className="text-sm text-amber-900/80 mt-1">
              בחירה לפי שם העסק לכל הקהילות. אם לאותו שם יש כמה רשומות, כולן נבחרות יחד כדי שהתג יופיע בחנות.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFarmerBadgeBusinessIds([])}
            disabled={farmerBadgeBusinessIds.length === 0}
            className="text-xs min-h-11 px-3 py-2 rounded bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            נקה בחירה
          </button>
        </div>
        <input
          type="search"
          value={businessSearch}
          onChange={(event) => setBusinessSearch(event.target.value)}
          placeholder="חיפוש עסק..."
          className="w-full border border-amber-300 rounded-md px-3 py-2 bg-white"
        />
        <p className="text-sm text-amber-950">
          נבחרו {selectedFarmerGroups.length} עסקים
        </p>
        {selectedFarmerGroups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedFarmerGroups.map((group) => (
              <button
                key={`selected-${group.key}`}
                type="button"
                onClick={() => toggleFarmerBadgeGroup(group)}
                className="inline-flex min-h-11 items-center gap-1 rounded-full bg-amber-200 px-3 py-1.5 text-sm text-amber-950 hover:bg-amber-300"
              >
                <span>{group.label}</span>
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
        <div className="max-h-64 overflow-auto border border-amber-200 rounded-md divide-y divide-amber-100 bg-white">
          {businessesLoading && (
            <p className="p-3 text-sm text-gray-500">טוען עסקים...</p>
          )}
          {!businessesLoading && visibleFarmerGroups.map((group) => {
            const selected = farmerBadgeGroupIsSelected(group, farmerBadgeBusinessIds);
            return (
              <label
                key={group.key}
                className={`flex items-center gap-2 p-2 hover:bg-amber-50 cursor-pointer min-h-11 ${selected ? 'bg-amber-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleFarmerBadgeGroup(group)}
                />
                <span className="text-sm text-gray-800">
                  {group.label}
                  {group.ids.length > 1 && (
                    <span className="text-xs text-gray-500 mr-2">({group.ids.length} רשומות)</span>
                  )}
                </span>
              </label>
            );
          })}
          {!businessesLoading && visibleFarmerGroups.length === 0 && (
            <p className="p-3 text-sm text-gray-500">לא נמצאו עסקים.</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSaveFarmerBadges}
          disabled={savingFarmerBadges}
          className="w-full min-h-11 bg-amber-700 hover:bg-amber-800 disabled:bg-gray-400 text-white font-bold py-2.5 px-4 rounded-lg"
        >
          {savingFarmerBadges ? 'שומר תגי חקלאי...' : 'שמור תגי חקלאי'}
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
