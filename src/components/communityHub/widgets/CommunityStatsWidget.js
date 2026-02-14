import React, { useState, useEffect } from 'react';
import { getCommunityWeeklyHistory } from '../../../services/communityDiscountService';

const CommunityStatsWidget = ({ communityName }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!communityName) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getCommunityWeeklyHistory(communityName, 8);
        if (!cancelled) setHistory(data);
      } catch (err) {
        console.error('Error loading stats:', err);
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [communityName]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-32 bg-gray-200 rounded w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
        <p className="text-red-500 text-sm text-center">שגיאה בטעינת נתונים: {error}</p>
      </div>
    );
  }

  const currentWeek = history[history.length - 1] || { total: 0, orderCount: 0 };
  const lastWeek = history[history.length - 2] || { total: 0, orderCount: 0 };

  const totalChange = lastWeek.total > 0
    ? ((currentWeek.total - lastWeek.total) / lastWeek.total * 100).toFixed(1)
    : null;

  const orderChange = lastWeek.orderCount > 0
    ? ((currentWeek.orderCount - lastWeek.orderCount) / lastWeek.orderCount * 100).toFixed(1)
    : null;

  const maxTotal = Math.max(...history.map(w => w.total), 1);

  const formatWeekLabel = (weekStart) => {
    if (!weekStart) return '';
    const d = new Date(weekStart);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-l from-blue-600 to-blue-700 text-white px-6 py-4">
        <h3 className="text-lg font-bold">סטטיסטיקות הקהילה</h3>
        <p className="text-blue-100 text-sm mt-1">נתוני הזמנות שבועיים</p>
      </div>

      <div className="p-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-sm text-blue-600">סה"כ השבוע</p>
            <p className="text-2xl font-bold text-blue-900">
              {Math.round(currentWeek.total).toLocaleString('he-IL')} &#8362;
            </p>
            {totalChange !== null && (
              <p className={`text-sm mt-1 font-semibold ${Number(totalChange) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {Number(totalChange) >= 0 ? '\u2191' : '\u2193'} {Math.abs(Number(totalChange))}%
              </p>
            )}
          </div>

          <div className="bg-purple-50 rounded-lg p-4 text-center">
            <p className="text-sm text-purple-600">הזמנות השבוע</p>
            <p className="text-2xl font-bold text-purple-900">
              {currentWeek.orderCount}
            </p>
            {orderChange !== null && (
              <p className={`text-sm mt-1 font-semibold ${Number(orderChange) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {Number(orderChange) >= 0 ? '\u2191' : '\u2193'} {Math.abs(Number(orderChange))}%
              </p>
            )}
          </div>
        </div>

        {/* Simple Bar Chart */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">8 שבועות אחרונים</p>
          <div className="flex items-end gap-2 h-32">
            {history.map((week, idx) => {
              const height = maxTotal > 0 ? (week.total / maxTotal) * 100 : 0;
              const isCurrentWeek = idx === history.length - 1;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-500">
                    {week.total > 0 ? `${Math.round(week.total)}\u20AA` : ''}
                  </span>
                  <div
                    className={`w-full rounded-t-md transition-all duration-500 ${
                      isCurrentWeek ? 'bg-blue-500' : 'bg-blue-200'
                    }`}
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${Math.round(week.total)} \u20AA \u2014 ${week.orderCount} הזמנות`}
                  />
                  <span className="text-xs text-gray-400">
                    {formatWeekLabel(week.weekStart)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityStatsWidget;
