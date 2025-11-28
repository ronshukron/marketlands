import React, { useState, useMemo } from 'react';
import { format, isWithinInterval, parseISO, subWeeks, startOfDay, endOfDay } from 'date-fns';

const RefundsCard = ({ refunds }) => {
  // Default to last 12 weeks
  const [startDate, setStartDate] = useState(format(subWeeks(new Date(), 12), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const stats = useMemo(() => {
      if (!refunds) return { count: 0, total: 0 };
      
      const start = startOfDay(parseISO(startDate));
      const end = endOfDay(parseISO(endDate));

      const filtered = refunds.filter(r => {
          // Try to find a date field
          const dateVal = r.createdAt || r.date || r.timestamp;
          if (!dateVal) return true; // If no date, include it (or exclude? safest to include if unknown)
          
          const date = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
          return isWithinInterval(date, { start, end });
      });

      return {
          count: filtered.length,
          total: filtered.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
      };
  }, [refunds, startDate, endDate]);

  return (
    <div className="bg-white p-6 rounded-lg shadow h-full flex flex-col">
        <h3 className="text-lg font-bold mb-4 text-gray-800 text-center">החזרים וזיכויים</h3>
        
        <div className="flex gap-2 text-xs bg-gray-50 p-3 rounded mb-4">
            <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border-gray-300 rounded px-1 py-1"
            />
            <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border-gray-300 rounded px-1 py-1"
            />
        </div>

        <div className="flex flex-col items-center justify-center flex-grow">
            <div className="text-4xl font-bold text-gray-800 mb-2">₪{stats.total.toLocaleString()}</div>
            <div className="text-gray-500 text-sm">סה"כ הוחזר</div>
            <div className="mt-4 text-xl font-semibold text-blue-600">{stats.count}</div>
            <div className="text-xs text-gray-400">בקשות זיכוי</div>
        </div>
    </div>
  );
};

export default RefundsCard;