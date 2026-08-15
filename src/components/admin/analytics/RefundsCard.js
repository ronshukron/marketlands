import React, { useState, useMemo } from 'react';
import { isWithinInterval } from 'date-fns';
import { COMPLETED_REFUND_STATUSES } from '../../../utils/refundUtils';
import {
  getAnalyticsWeekEndKey,
  getAnalyticsWeekStartKey,
  getDefaultCompletedAnalyticsRange,
  normalizeAnalyticsDateRange,
} from '../../../utils/analyticsWeekUtils';

const DEFAULT_RANGE = getDefaultCompletedAnalyticsRange(12);

const RefundsCard = ({ refunds }) => {
  const [startDate, setStartDate] = useState(DEFAULT_RANGE.startDate);
  const [endDate, setEndDate] = useState(DEFAULT_RANGE.endDate);

  const stats = useMemo(() => {
      if (!refunds) return { count: 0, total: 0 };
      
      const range = normalizeAnalyticsDateRange(startDate, endDate);
      if (!range) return { count: 0, total: 0 };
      const { start, end } = range;

      const filtered = refunds.filter(r => {
          if (!COMPLETED_REFUND_STATUSES.includes(r.status)) return false;
          // Try to find a date field
          const dateVal = r.createdAt || r.date || r.timestamp;
          if (!dateVal) return true; // If no date, include it (or exclude? safest to include if unknown)
          
          const date = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
          return isWithinInterval(date, { start, end });
      });

      return {
          count: filtered.length,
          total: filtered.reduce((sum, r) => {
            const amount = r.approvedRefundAmount ?? r.requestedRefundAmount ?? r.orderAmount ?? r.amount ?? 0;
            return sum + (Number(amount) || 0);
          }, 0)
      };
  }, [refunds, startDate, endDate]);

  return (
    <div className="bg-white p-6 rounded-lg shadow h-full flex flex-col">
        <h3 className="text-lg font-bold mb-4 text-gray-800 text-center">החזרים וזיכויים</h3>
        
        <div className="flex gap-2 text-xs bg-gray-50 p-3 rounded mb-4">
          <label className="w-full">
            <span className="mb-1 block text-gray-500">מיום ראשון</span>
            <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(getAnalyticsWeekStartKey(e.target.value))}
                className="w-full border-gray-300 rounded px-1 py-1"
            />
          </label>
          <label className="w-full">
            <span className="mb-1 block text-gray-500">עד שבת</span>
            <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(getAnalyticsWeekEndKey(e.target.value))}
                className="w-full border-gray-300 rounded px-1 py-1"
            />
          </label>
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