import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/authContext';
import usePickupSpots from '../../../hooks/usePickupSpots';
import { getCommunityCode } from '../../../services/pickupSpotsService';
import {
  archivePromotion,
  createPromotion,
  duplicatePromotion,
  listPromotions,
  publishPromotion,
  updatePromotion,
} from '../../../services/communityWeeklyPromotionService';
import { getWeekKey } from '../../../utils/deliveryScheduleUtils';
import CommunityWeeklyPromotionAnalytics from './CommunityWeeklyPromotionAnalytics';
import CommunityWeeklyPromotionEditor from './CommunityWeeklyPromotionEditor';

const ADMIN_UID = 'rfHOLhNoJOW8ByNypCtm3hlSNKs2';
const ALL = 'all';
const STATUS_LABELS = {
  draft: 'טיוטה',
  scheduled: 'מתוזמן',
  active: 'פעיל',
  archived: 'בארכיון',
};
const STATUS_STYLES = {
  draft: 'border-amber-200 bg-amber-50 text-amber-800',
  scheduled: 'border-blue-200 bg-blue-50 text-blue-800',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  archived: 'border-gray-200 bg-gray-100 text-gray-600',
};

const getPromotions = (result) => {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.promotions)) return result.promotions;
  if (Array.isArray(result?.items)) return result.items;
  return [];
};

const getPromotionCommunities = (promotion) => {
  const communities =
    promotion?.targetCommunities ||
    promotion?.communities ||
    promotion?.communityNames ||
    promotion?.pickupSpots;
  return Array.isArray(communities)
    ? communities.map((community) => (typeof community === 'string' ? community : community?.name)).filter(Boolean)
    : [];
};

const dateLabel = (value) => {
  if (!value) return '—';
  const date = value?.toDate?.() || new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('he-IL');
};

const weekLabel = (weekKey) => {
  if (!weekKey) return 'שבוע לא הוגדר';
  const start = new Date(`${weekKey}T12:00:00`);
  if (Number.isNaN(start.getTime())) return weekKey;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString('he-IL')}–${end.toLocaleDateString('he-IL')}`;
};

const StatusBadge = ({ status }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}>
    {STATUS_LABELS[status] || status || STATUS_LABELS.draft}
  </span>
);

const CommunityWeeklyPromotionsAdmin = () => {
  const { currentUser, userRole } = useAuth();
  const { pickupSpots = [], loaded: communitiesLoaded } = usePickupSpots();
  const isAdmin = userRole === 'admin' || currentUser?.uid === ADMIN_UID;
  const [view, setView] = useState('list');
  const [selectedPromotion, setSelectedPromotion] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState({
    weekKey: getWeekKey(new Date()),
    community: ALL,
    status: ALL,
  });

  const serviceFilters = useMemo(
    () => ({
      ...(filters.status !== ALL ? { status: filters.status } : {}),
      maxResults: 250,
    }),
    [filters.status]
  );

  const loadPromotions = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await listPromotions(serviceFilters);
      setPromotions(getPromotions(result));
    } catch (loadError) {
      console.error('Failed to load community weekly promotions', loadError);
      setError('לא ניתן לטעון כרגע את המבצעים השבועיים.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, serviceFilters]);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timeout);
  }, [notice]);

  const visiblePromotions = useMemo(
    () =>
      promotions.filter((promotion) => {
        const week = promotion.weekKey || promotion.deliveryWeekKey || '';
        const status = promotion.status || 'draft';
        const communities = getPromotionCommunities(promotion);
        const codes = promotion.targetCommunityCodes || [];
        return (
          (!filters.weekKey || week === filters.weekKey) &&
          (filters.status === ALL || status === filters.status) &&
          (filters.community === ALL ||
            communities.includes(filters.community) ||
            codes.includes(getCommunityCode(filters.community)))
        );
      }),
    [promotions, filters]
  );

  const returnToList = () => {
    setSelectedPromotion(null);
    setView('list');
    setError('');
  };

  const editPromotion = (promotion) => {
    setSelectedPromotion(promotion);
    setView('editor');
    setError('');
  };

  const savePromotion = async (payload) => {
    setSaving(true);
    setError('');
    try {
      if (selectedPromotion?.id) {
        await updatePromotion(selectedPromotion.id, payload, { user: currentUser });
        setNotice('הטיוטה עודכנה בהצלחה.');
      } else {
        await createPromotion(payload, { user: currentUser });
        setNotice('הטיוטה נוצרה בהצלחה.');
      }
      returnToList();
      await loadPromotions();
    } catch (saveError) {
      console.error('Failed to save community weekly promotion', saveError);
      setError(saveError?.message || 'שמירת הטיוטה נכשלה. נסו שוב.');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (promotion, action, successMessage) => {
    setActingId(promotion.id);
    setError('');
    try {
      await action();
      setNotice(successMessage);
      await loadPromotions();
    } catch (actionError) {
      console.error('Community weekly promotion action failed', actionError);
      setError(actionError?.message || 'הפעולה נכשלה. נסו שוב.');
    } finally {
      setActingId('');
    }
  };

  const publish = (promotion) => {
    if (!window.confirm(`לפרסם את "${promotion.title || 'המבצע'}"? לאחר הפרסום לא ניתן לערוך אותו.`)) return;
    runAction(
      promotion,
      () => publishPromotion(promotion.id, { user: currentUser }),
      'המבצע פורסם בהצלחה.'
    );
  };

  const archive = (promotion) => {
    if (!window.confirm(`להעביר את "${promotion.title || 'המבצע'}" לארכיון?`)) return;
    runAction(
      promotion,
      () => archivePromotion(promotion.id, { user: currentUser }),
      'המבצע הועבר לארכיון.'
    );
  };

  const duplicate = (promotion) => {
    runAction(
      promotion,
      () => duplicatePromotion(promotion.id, {}, { user: currentUser }),
      'נוצר עותק חדש כטיוטה.'
    );
  };

  if (!currentUser) {
    return (
      <main dir="rtl" className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900">
          יש להתחבר כדי לגשת לניהול מבצעים.
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main dir="rtl" className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
          אין לך הרשאת מנהל לצפות במסך זה.
        </div>
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-gray-50 font-hebrew">
      <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
        <header className="mb-6 rounded-2xl bg-gradient-to-l from-blue-700 to-blue-600 p-5 text-white shadow-sm sm:p-7">
          <Link
            to="/admin"
            className="inline-flex min-h-11 items-center text-sm font-medium text-blue-100 hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
          >
            חזרה ללוח הניהול ←
          </Link>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">מבצעי קהילה שבועיים</h1>
              <p className="mt-1 max-w-2xl text-sm text-blue-100 sm:text-base">
                יצירת מבצעים ממוקדים לקהילות, פרסום ומעקב אחר ביצועים.
              </p>
            </div>
            {view === 'list' && (
              <button
                type="button"
                onClick={() => {
                  setSelectedPromotion(null);
                  setView('editor');
                }}
                className="min-h-11 rounded-lg bg-white px-5 py-2 font-bold text-blue-700 shadow-sm hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-white"
              >
                + יצירת מבצע
              </button>
            )}
          </div>
        </header>

        {notice && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800" role="status">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {view === 'editor' && (
          <CommunityWeeklyPromotionEditor
            key={selectedPromotion?.id || 'new-promotion'}
            promotion={selectedPromotion}
            saving={saving}
            onSave={savePromotion}
            onCancel={returnToList}
          />
        )}

        {view === 'analytics' && (
          <CommunityWeeklyPromotionAnalytics
            promotion={selectedPromotion}
            promotions={visiblePromotions}
            onBack={returnToList}
          />
        )}

        {view === 'list' && (
          <>
            <section className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-medium text-gray-700">
                  שבוע
                  <input
                    type="date"
                    value={filters.weekKey}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        weekKey: event.target.value ? getWeekKey(event.target.value) : '',
                      }))
                    }
                    className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  קהילה
                  <select
                    value={filters.community}
                    onChange={(event) => setFilters((current) => ({ ...current, community: event.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    disabled={!communitiesLoaded}
                  >
                    <option value={ALL}>כל הקהילות</option>
                    {pickupSpots.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  סטטוס
                  <select
                    value={filters.status}
                    onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  >
                    <option value={ALL}>כל הסטטוסים</option>
                    <option value="draft">טיוטות</option>
                    <option value="scheduled">מתוזמנים</option>
                    <option value="active">פעילים</option>
                    <option value="archived">ארכיון</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                <p className="text-sm text-gray-500">{visiblePromotions.length} מבצעים בתצוגה</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPromotion(null);
                    setView('analytics');
                  }}
                  className="min-h-11 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  ניתוח כללי
                </button>
              </div>
            </section>

            {loading && (
              <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500" role="status">
                טוען מבצעים...
              </div>
            )}

            {!loading && visiblePromotions.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
                <h2 className="font-bold text-gray-800">לא נמצאו מבצעים מתאימים</h2>
                <p className="mt-1 text-sm text-gray-500">שנו את הסינון או צרו טיוטה חדשה לשבוע זה.</p>
              </div>
            )}

            {!loading && visiblePromotions.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                {visiblePromotions.map((promotion) => {
                  const status = promotion.status || 'draft';
                  const communities = getPromotionCommunities(promotion);
                  const items = promotion.productSnapshots || [];
                  const busy = actingId === promotion.id;
                  return (
                    <article key={promotion.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-bold text-gray-900">{promotion.title || 'מבצע ללא כותרת'}</h2>
                          <p className="mt-1 text-sm text-gray-500">
                            {weekLabel(promotion.weekKey || promotion.deliveryWeekKey)}
                          </p>
                        </div>
                        <StatusBadge status={status} />
                      </div>

                      {(promotion.shareConfig?.message || promotion.message) && (
                        <p className="mt-3 line-clamp-2 text-sm text-gray-600">
                          {promotion.shareConfig?.message || promotion.message}
                        </p>
                      )}

                      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                        <div>
                          <dt className="text-gray-500">קהילות</dt>
                          <dd className="mt-1 font-semibold text-gray-800">{communities.length || promotion.targetCommunityCodes?.length || 0}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">מוצרים</dt>
                          <dd className="mt-1 font-semibold text-gray-800">{items.length}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">פתיחה</dt>
                          <dd className="mt-1 font-medium text-gray-700">{dateLabel(promotion.startsAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-gray-500">סגירה</dt>
                          <dd className="mt-1 font-medium text-gray-700">{dateLabel(promotion.endsAt)}</dd>
                        </div>
                      </dl>

                      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <button
                          type="button"
                          onClick={() => editPromotion(promotion)}
                          className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
                        >
                          {status === 'draft' ? 'עריכה' : 'צפייה'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPromotion(promotion);
                            setView('analytics');
                          }}
                          className="min-h-11 rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        >
                          ניתוח
                        </button>
                        {(status === 'draft' || status === 'scheduled') && (
                          <button
                            type="button"
                            onClick={() => publish(promotion)}
                            disabled={busy}
                            className="min-h-11 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50"
                          >
                            {status === 'scheduled' ? 'הפעלה' : 'פרסום'}
                          </button>
                        )}
                        {status !== 'archived' && (
                          <button
                            type="button"
                            onClick={() => archive(promotion)}
                            disabled={busy}
                            className="min-h-11 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50"
                          >
                            ארכוב
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => duplicate(promotion)}
                          disabled={busy}
                          className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
                        >
                          {busy ? 'מבצע...' : 'שכפול'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
};

export default CommunityWeeklyPromotionsAdmin;
