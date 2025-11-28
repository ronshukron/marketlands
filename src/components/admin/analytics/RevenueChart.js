import React, { useState, useMemo } from 'react';
import SharedBarChart from './SharedBarChart';
import { format, startOfWeek, startOfMonth, isWithinInterval, parseISO, subWeeks, startOfDay, endOfDay } from 'date-fns';

const RevenueChart = ({ orders, communities }) => {
  // Default range: Last 12 weeks
  const [startDate, setStartDate] = useState(format(subWeeks(new Date(), 12), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCommunity, setSelectedCommunity] = useState('All');
  const [metric, setMetric] = useState('revenue'); // 'revenue' or 'count'
  const [groupBy, setGroupBy] = useState('week'); // 'week' or 'month'

  const chartData = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(parseISO(endDate));

    const stats = {};

    orders.forEach(o => {
      // 1. Status Check
      if (o.paymentStatus !== 'completed') return;

      // 2. Date Check
      if (!isWithinInterval(o.createdAt, { start, end })) return;

      // 3. Community Check
      if (selectedCommunity !== 'All' && o.customerDetails?.pickupSpot !== selectedCommunity) return;

      // Group by Week or Month
      const bucketStart = groupBy === 'week'
        ? startOfWeek(o.createdAt, { weekStartsOn: 0 })
        : startOfMonth(o.createdAt);

      const key = format(bucketStart, groupBy === 'week' ? 'yyyy-MM-dd' : 'yyyy-MM');
      const label = format(bucketStart, groupBy === 'week' ? 'dd/MM' : 'MM/yy');

      if (!stats[key]) stats[key] = { date: bucketStart, label, revenue: 0, count: 0 };
      
      stats[key].revenue += Number(o.grandTotal || 0);
      stats[key].count += 1;
    });

    return Object.values(stats).sort((a, b) => a.date - b.date);
  }, [orders, startDate, endDate, selectedCommunity, metric, groupBy]);

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="bg-white p-4 rounded-lg shadow mb-4 border border-gray-200">
        <h4 className="font-bold text-gray-700 mb-3">הגדרות גרף הכנסות</h4>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">מתאריך</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm border-gray-300 rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">עד תאריך</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm border-gray-300 rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">קהילה</label>
            <select 
              value={selectedCommunity} 
              onChange={(e) => setSelectedCommunity(e.target.value)}
              className="text-sm border-gray-300 rounded px-2 py-1"
            >
              <option value="All">כל הקהילות</option>
              {communities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">מדד</label>
            <div className="flex border border-gray-300 rounded overflow-hidden">
              <button 
                onClick={() => setMetric('revenue')}
                className={`px-3 py-1 text-xs ${metric === 'revenue' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                הכנסות
              </button>
              <button 
                onClick={() => setMetric('count')}
                className={`px-3 py-1 text-xs ${metric === 'count' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                מס' הזמנות
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">תצוגה</label>
            <div className="flex border border-gray-300 rounded overflow-hidden">
              <button 
                onClick={() => setGroupBy('week')}
                className={`px-3 py-1 text-xs ${groupBy === 'week' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                שבועי
              </button>
              <button 
                onClick={() => setGroupBy('month')}
                className={`px-3 py-1 text-xs ${groupBy === 'month' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                חודשי
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-grow">
        <SharedBarChart 
          data={chartData}
          labelKey="label"
          valueKey={metric}
          title={
            metric === 'revenue' 
              ? (groupBy === 'week' ? 'הכנסות לפי שבוע' : 'הכנסות לפי חודש')
              : (groupBy === 'week' ? 'מספר הזמנות לפי שבוע' : 'מספר הזמנות לפי חודש')
          }
          subtitle={`מציג נתונים עבור ${selectedCommunity === 'All' ? 'כל הקהילות' : selectedCommunity}`}
          color={metric === 'revenue' ? 'bg-green-500' : 'bg-blue-500'}
          formatValue={(v) => metric === 'revenue' ? `₪${v.toLocaleString()}` : v}
        />
      </div>
    </div>
  );
};

export default RevenueChart;
