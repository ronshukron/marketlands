import React, { useState, useMemo } from 'react';
import SharedBarChart from './SharedBarChart';
import { format, startOfWeek, startOfMonth, isWithinInterval, parseISO, subWeeks, startOfDay, endOfDay } from 'date-fns';

const CommunityGrowthChart = ({ orders, communities }) => {
  const [startDate, setStartDate] = useState(format(subWeeks(new Date(), 12), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCommunity, setSelectedCommunity] = useState('All');
  const [groupBy, setGroupBy] = useState('week'); // 'week' or 'month'

  // Calculate customer first-seen dates (Global context, not affected by date filter)
  const customerFirstSeen = useMemo(() => {
    const firstSeen = {};
    orders.forEach(o => {
      if (o.paymentStatus !== 'completed') return;
      const id = o.customerDetails?.email || o.customerDetails?.phone;
      if (!id) return;
      
      const date = o.createdAt;
      if (!firstSeen[id] || date < firstSeen[id]) {
        firstSeen[id] = date;
      }
    });
    return firstSeen;
  }, [orders]);

  const { chartData, summary } = useMemo(() => {
    if (!orders || orders.length === 0) return { chartData: [], summary: {} };

    const start = startOfDay(parseISO(startDate));
    const end = endOfDay(parseISO(endDate));

    const bucketData = {}; 
    let totalActive = 0;
    let totalNew = 0;

    orders.forEach(o => {
      if (o.paymentStatus !== 'completed') return;
      if (!isWithinInterval(o.createdAt, { start, end })) return;
      if (selectedCommunity !== 'All' && o.customerDetails?.pickupSpot !== selectedCommunity) return;

      const bucketStart = groupBy === 'week'
        ? startOfWeek(o.createdAt, { weekStartsOn: 0 })
        : startOfMonth(o.createdAt);

      const key = format(bucketStart, groupBy === 'week' ? 'yyyy-MM-dd' : 'yyyy-MM');
      const label = format(bucketStart, groupBy === 'week' ? 'dd/MM' : 'MM/yy');
      
      const userId = o.customerDetails?.email || o.customerDetails?.phone;
      if (!userId) return;

      if (!bucketData[key]) bucketData[key] = { date: bucketStart, label, users: new Set(), newUsers: 0 };
      
      if (!bucketData[key].users.has(userId)) {
        bucketData[key].users.add(userId);
        
        // Check if new user (first seen in this week)
        // We check if their global first seen date is >= this period start
        if (customerFirstSeen[userId] >= bucketStart) {
             bucketData[key].newUsers += 1;
             totalNew += 1;
        }
      }
    });

    const data = Object.values(bucketData)
      .map(d => ({ 
          ...d, 
          count: d.users.size,
          returning: d.users.size - d.newUsers
      }))
      .sort((a, b) => a.date - b.date);

    totalActive = data.reduce((sum, d) => sum + d.count, 0);
    const avgActive = data.length > 0 ? (totalActive / data.length).toFixed(0) : 0;

    // Health Trend (Last 2 vs Previous 2)
    let trend = 'stable';
    if (data.length >= 4) {
        const last2 = data.slice(-2).reduce((s, i) => s + i.count, 0);
        const prev2 = data.slice(-4, -2).reduce((s, i) => s + i.count, 0);
        if (last2 > prev2 * 1.1) trend = 'growing';
        else if (last2 < prev2 * 0.9) trend = 'declining';
    }

    return { chartData: data, summary: { avgActive, totalNew, trend } };
  }, [orders, startDate, endDate, selectedCommunity, customerFirstSeen, groupBy]);

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="bg-white p-4 rounded-lg shadow mb-4 border border-gray-200">
        <div className="flex justify-between items-start mb-3">
             <h4 className="font-bold text-gray-700">הגדרות צמיחה ובריאות קהילה</h4>
             <div className={`px-2 py-1 rounded text-xs font-bold ${
                 summary.trend === 'growing' ? 'bg-green-100 text-green-800' : 
                 summary.trend === 'declining' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
             }`}>
                 {summary.trend === 'growing' ? '📈 במגמת צמיחה' : 
                  summary.trend === 'declining' ? '📉 במגמת ירידה' : '➡️ יציב'}
             </div>
        </div>

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
            <label className="block text-xs font-medium text-gray-500 mb-1">תצוגה</label>
            <div className="flex border border-gray-300 rounded overflow-hidden text-xs">
              <button 
                onClick={() => setGroupBy('week')}
                className={`px-3 py-1 ${groupBy === 'week' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                שבועית
              </button>
              <button 
                onClick={() => setGroupBy('month')}
                className={`px-3 py-1 ${groupBy === 'month' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                חודשית
              </button>
            </div>
          </div>
        </div>
        
        <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
             <div className="bg-purple-50 p-2 rounded">
                 <span className="block font-bold text-purple-700">{summary.avgActive}</span>
                 <span className="text-xs text-gray-500">ממוצע פעילים שבועי</span>
             </div>
             <div className="bg-blue-50 p-2 rounded">
                 <span className="block font-bold text-blue-700">{summary.totalNew}</span>
                 <span className="text-xs text-gray-500">לקוחות חדשים בתקופה</span>
             </div>
        </div>
      </div>

      <div className="flex-grow">
        <SharedBarChart 
          data={chartData}
          labelKey="label"
          valueKey="count"
          title="משתמשים פעילים ייחודיים"
          subtitle={
            groupBy === 'week' 
              ? 'מספר הקונים הייחודיים שביצעו רכישה בכל שבוע'
              : 'מספר הקונים הייחודיים שביצעו רכישה בכל חודש'
          }
          color="bg-purple-500"
        />
      </div>
    </div>
  );
};

export default CommunityGrowthChart;