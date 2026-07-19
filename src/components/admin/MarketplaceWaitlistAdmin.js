import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMarketplaceWaitlistEntries } from '../../services/marketplaceWaitlistService';

const formatDate = (value) => {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
};

const MarketplaceWaitlistAdmin = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <div dir="rtl" className="max-w-5xl mx-auto p-6">
      <Link to="/admin" className="text-blue-600 hover:underline text-sm">
        ← חזרה ללוח מנהל
      </Link>
      <h1 className="text-2xl font-bold mt-4 mb-2">רשימת המתנה לשוק</h1>
      <p className="text-gray-600 mb-6 text-sm">
        עסקים מקומיים שנרשמו לפיילוט השוק (3-5 עסקים ראשונים).
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-600 py-10">טוען...</div>
      ) : entries.length === 0 ? (
        <div className="text-center text-gray-500 py-10 bg-white border rounded-xl">
          אין עדיין הרשמות לרשימת ההמתנה.
        </div>
      ) : (
        <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3 font-semibold">תאריך</th>
                <th className="p-3 font-semibold">שם</th>
                <th className="p-3 font-semibold">טלפון</th>
                <th className="p-3 font-semibold">אימייל</th>
                <th className="p-3 font-semibold">סוג העסק</th>
                <th className="p-3 font-semibold">קהילה</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="p-3 whitespace-nowrap text-gray-500">{formatDate(entry.createdAt)}</td>
                  <td className="p-3 font-medium">{entry.name || '—'}</td>
                  <td className="p-3 whitespace-nowrap" dir="ltr">{entry.phone || '—'}</td>
                  <td className="p-3" dir="ltr">{entry.email || '—'}</td>
                  <td className="p-3">{entry.businessKind || '—'}</td>
                  <td className="p-3">{entry.community || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <p className="text-gray-500 text-xs mt-3">סה"כ {entries.length} הרשמות</p>
      )}
    </div>
  );
};

export default MarketplaceWaitlistAdmin;
