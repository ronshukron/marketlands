import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import {
  getMarketplaceWaitlistEntries,
  reviewMarketplaceWaitlistEntry,
} from '../../services/marketplaceWaitlistService';
import {
  filterMarketplaceWaitlistEntries,
  MARKETPLACE_WAITLIST_STATUS_LABELS,
  normalizeMarketplaceWaitlistStatus,
} from '../../utils/marketplaceWaitlistReview';
import '../marketplace/marketplace.css';

const formatDate = (value) => {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
};

const MarketplaceWaitlistAdmin = () => {
  const { currentUser } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reviewNotes, setReviewNotes] = useState({});
  const [updatingId, setUpdatingId] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const list = await getMarketplaceWaitlistEntries();
        setEntries(list);
      } catch (err) {
        console.error('Failed to load marketplace waitlist', err);
        const isPermission = err?.code === 'permission-denied';
        setError(
          isPermission
            ? 'אין הרשאה לטעון את רשימת ההמתנה. יש לעדכן את חוקי Firestore (ראו docs/Marketplace-Waitlist-Firestore-Rules.snippet.txt).'
            : 'לא הצלחנו לטעון את רשימת ההמתנה. נסו שוב בעוד רגע.'
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredEntries = useMemo(
    () => filterMarketplaceWaitlistEntries(entries, statusFilter),
    [entries, statusFilter]
  );

  const reviewEntry = async (entry, status) => {
    if (
      !currentUser ||
      updatingId ||
      normalizeMarketplaceWaitlistStatus(entry.status) !== 'new'
    ) return;
    setUpdatingId(entry.id);
    setError('');
    try {
      await reviewMarketplaceWaitlistEntry({
        entryId: entry.id,
        status,
        reviewNote: reviewNotes[entry.id] || '',
        reviewer: { uid: currentUser.uid, email: currentUser.email || '' },
      });
      setEntries((current) =>
        current.map((item) =>
          item.id === entry.id
            ? {
                ...item,
                status,
                reviewNote: reviewNotes[entry.id] || '',
                reviewedAt: new Date(),
                reviewedBy: { uid: currentUser.uid, email: currentUser.email || '' },
              }
            : item
        )
      );
    } catch (err) {
      console.error('Failed to review marketplace waitlist entry', err);
      setError(err?.message || 'לא הצלחנו לעדכן את ההרשמה.');
    } finally {
      setUpdatingId('');
    }
  };

  return (
    <div dir="rtl" className="mp-page mp-bench-page">
      <main className="mp-main mp-bench mp-stack">
      <Link to="/admin" className="mp-link text-sm">
        ← חזרה ללוח מנהל
      </Link>
      <header className="mp-bench-header">
        <div>
      <h1 className="mp-bench-title mp-section-title-chalk">רשימת המתנה לשוק</h1>
      <p className="mp-bench-subtitle">
        עסקים מקומיים שנרשמו לפיילוט השוק (3-5 עסקים ראשונים).
        אישור או דחייה מעדכנים סטטוס בלבד — לא נוצרים סיסמאות או חשבונות אוטומטית; יש להזמין את העסק ידנית לאחר אישור.
      </p>
        </div>
        <label className="mp-form-label">
          סינון לפי סטטוס
          <select
            className="mp-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">כל ההרשמות</option>
            <option value="new">חדשות</option>
            <option value="approved">אושרו</option>
            <option value="rejected">נדחו</option>
          </select>
        </label>
      </header>

      {error && (
        <div className="mp-alert mp-alert-error text-sm" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-600 py-10">טוען...</div>
      ) : filteredEntries.length === 0 ? (
        <div className="mp-panel mp-empty text-center">
          אין הרשמות התואמות לסינון.
        </div>
      ) : (
        <div className="mp-panel overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3 font-semibold">תאריך</th>
                <th className="p-3 font-semibold">שם</th>
                <th className="p-3 font-semibold">טלפון</th>
                <th className="p-3 font-semibold">אימייל</th>
                <th className="p-3 font-semibold">סוג העסק</th>
                <th className="p-3 font-semibold">קהילה</th>
                <th className="p-3 font-semibold">סטטוס ובדיקה</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="p-3 whitespace-nowrap text-gray-500">{formatDate(entry.createdAt)}</td>
                  <td className="p-3 font-medium">{entry.name || '—'}</td>
                  <td className="p-3 whitespace-nowrap" dir="ltr">{entry.phone || '—'}</td>
                  <td className="p-3" dir="ltr">{entry.email || '—'}</td>
                  <td className="p-3">{entry.businessKind || '—'}</td>
                  <td className="p-3">{entry.community || '—'}</td>
                  <td className="p-3 min-w-[260px]">
                    <div className="mp-stack">
                      <span className={`mp-badge mp-waitlist-status is-${normalizeMarketplaceWaitlistStatus(entry.status)}`}>
                        {MARKETPLACE_WAITLIST_STATUS_LABELS[normalizeMarketplaceWaitlistStatus(entry.status)]}
                      </span>
                      <input
                        className="mp-input"
                        value={reviewNotes[entry.id] ?? entry.reviewNote ?? ''}
                        onChange={(event) =>
                          setReviewNotes((current) => ({
                            ...current,
                            [entry.id]: event.target.value,
                          }))
                        }
                        maxLength={200}
                        disabled={normalizeMarketplaceWaitlistStatus(entry.status) !== 'new'}
                        placeholder="הערת בדיקה (אופציונלי)"
                        aria-label={`הערת בדיקה עבור ${entry.name || 'הרשמה'}`}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="mp-btn mp-btn-primary mp-bench-btn-sm"
                          disabled={Boolean(updatingId) || normalizeMarketplaceWaitlistStatus(entry.status) !== 'new'}
                          onClick={() => reviewEntry(entry, 'approved')}
                        >
                          אישור
                        </button>
                        <button
                          type="button"
                          className="mp-btn mp-btn-outline mp-bench-btn-sm"
                          disabled={Boolean(updatingId) || normalizeMarketplaceWaitlistStatus(entry.status) !== 'new'}
                          onClick={() => reviewEntry(entry, 'rejected')}
                        >
                          דחייה
                        </button>
                      </div>
                      {entry.reviewedBy?.email && (
                        <small className="mp-section-note">
                          נבדק על ידי {entry.reviewedBy.email}
                          {formatDate(entry.reviewedAt) && ` · ${formatDate(entry.reviewedAt)}`}
                        </small>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <p className="mp-section-note text-xs">
          מוצגות {filteredEntries.length} מתוך {entries.length} הרשמות
        </p>
      )}
      </main>
    </div>
  );
};

export default MarketplaceWaitlistAdmin;
