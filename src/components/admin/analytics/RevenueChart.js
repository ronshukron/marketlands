import React, { useState, useMemo } from 'react';
import SharedBarChart from './SharedBarChart';
import { format, startOfMonth, isWithinInterval } from 'date-fns';
import {
  formatAnalyticsWeekLabel,
  getAnalyticsWeekEndKey,
  getAnalyticsWeekRange,
  getAnalyticsWeekStartKey,
  getDefaultCompletedAnalyticsRange,
  normalizeAnalyticsDateRange,
} from '../../../utils/analyticsWeekUtils';

const DEFAULT_RANGE = getDefaultCompletedAnalyticsRange(12);

const RevenueChart = ({ orders, communities }) => {
  const [startDate, setStartDate] = useState(DEFAULT_RANGE.startDate);
  const [endDate, setEndDate] = useState(DEFAULT_RANGE.endDate);
  const [selectedCommunity, setSelectedCommunity] = useState('All');
  const [metric, setMetric] = useState('revenue');
  const [groupBy, setGroupBy] = useState('week');

  const { chartData, totalRevenue, totalOrders, avgOrderValue } = useMemo(() => {
    if (!orders || orders.length === 0) return { chartData: [], totalRevenue: 0, totalOrders: 0, avgOrderValue: 0 };

    const range = normalizeAnalyticsDateRange(startDate, endDate);
    if (!range) return { chartData: [], totalRevenue: 0, totalOrders: 0, avgOrderValue: 0 };
    const { start, end } = range;

    const stats = {};
    let sumRevenue = 0;
    let sumOrders = 0;

    orders.forEach(o => {
      const isDelayed = o._source === 'customerOrdersDelayed';

      if (isDelayed) {
        const delayedStatus = String(o.delayedOrderStatus || '').toLowerCase();
        const pStatus = String(o.paymentStatus || '').toLowerCase();
        if (delayedStatus === 'abandoned' || delayedStatus === 'cancelled_by_admin' || delayedStatus === 'cancelled') return;
        if (pStatus === 'abandoned' || pStatus === 'cancelled') return;
      } else {
        if (o.paymentStatus !== 'completed') return;
      }

      if (!isWithinInterval(o.createdAt, { start, end })) return;
      if (selectedCommunity !== 'All' && o.customerDetails?.pickupSpot !== selectedCommunity) return;

      const weekRange = getAnalyticsWeekRange(o.createdAt);
      const bucketStart = groupBy === 'week' ? weekRange?.start : startOfMonth(o.createdAt);
      if (!bucketStart) return;

      const key = groupBy === 'week'
        ? getAnalyticsWeekStartKey(bucketStart)
        : format(bucketStart, 'yyyy-MM');
      const label = groupBy === 'week'
        ? formatAnalyticsWeekLabel(bucketStart)
        : format(bucketStart, 'MM/yy');

      if (!stats[key]) stats[key] = { date: bucketStart, label, revenue: 0, count: 0 };
      
      const amount = Number(o.grandTotal || 0);
      stats[key].revenue += amount;
      stats[key].count += 1;

      sumRevenue += amount;
      sumOrders += 1;
    });

    const sorted = Object.values(stats).sort((a, b) => a.date - b.date);
    return {
      chartData: sorted,
      totalRevenue: sumRevenue,
      totalOrders: sumOrders,
      avgOrderValue: sumOrders > 0 ? Math.round(sumRevenue / sumOrders) : 0
    };
  }, [orders, startDate, endDate, selectedCommunity, groupBy]);

  return (
    <div className="flex flex-col w-full">
      {/* Controls */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">מתאריך (יום ראשון)</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(getAnalyticsWeekStartKey(e.target.value))}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">עד תאריך (שבת)</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(getAnalyticsWeekEndKey(e.target.value))}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">קהילה</label>
            <select 
              value={selectedCommunity} 
              onChange={(e) => setSelectedCommunity(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            >
              <option value="All">כל הקהילות</option>
              {communities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">מדד</label>
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              <button 
                onClick={() => setMetric('revenue')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${metric === 'revenue' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                הכנסות
              </button>
              <button 
                onClick={() => setMetric('count')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${metric === 'count' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                מס' הזמנות
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">תצוגה</label>
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              <button 
                onClick={() => setGroupBy('week')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${groupBy === 'week' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                שבועי
              </button>
              <button 
                onClick={() => setGroupBy('month')}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${groupBy === 'month' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                חודשי
              </button>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="flex gap-6 mr-auto bg-gray-50 rounded-lg px-5 py-2 border border-gray-200">
            <div className="text-center">
              <div className="text-xs font-semibold text-gray-500">סה"כ הכנסות</div>
              <div className="text-lg font-bold text-green-600">₪{totalRevenue.toLocaleString()}</div>
            </div>
            <div className="w-px bg-gray-300" />
            <div className="text-center">
              <div className="text-xs font-semibold text-gray-500">סה"כ הזמנות</div>
              <div className="text-lg font-bold text-blue-600">{totalOrders.toLocaleString()}</div>
            </div>
            <div className="w-px bg-gray-300" />
            <div className="text-center">
              <div className="text-xs font-semibold text-gray-500">ממוצע להזמנה</div>
              <div className="text-lg font-bold text-purple-600">₪{avgOrderValue.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <SharedBarChart 
        data={chartData}
        labelKey="label"
        valueKey={metric}
        height={400}
        title={
          metric === 'revenue' 
            ? (groupBy === 'week' ? 'הכנסות לפי שבוע' : 'הכנסות לפי חודש')
            : (groupBy === 'week' ? 'מספר הזמנות לפי שבוע' : 'מספר הזמנות לפי חודש')
        }
        subtitle={`מציג נתונים עבור ${selectedCommunity === 'All' ? 'כל הקהילות' : selectedCommunity}`}
        color={metric === 'revenue' ? 'bg-green-500' : 'bg-blue-500'}
        formatValue={(v) => metric === 'revenue' ? `₪${Math.round(v).toLocaleString()}` : v}
      />
    </div>
  );
};

export default RevenueChart;
