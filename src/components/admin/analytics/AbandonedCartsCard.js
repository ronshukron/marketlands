import React, { useState, useMemo } from 'react';
import { format, startOfWeek, isWithinInterval, parseISO, subWeeks, startOfDay, endOfDay } from 'date-fns';

const AbandonedCartsCard = ({ orders, communities }) => {
  const [startDate, setStartDate] = useState(format(subWeeks(new Date(), 12), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCommunity, setSelectedCommunity] = useState('All');

  const stats = useMemo(() => {
      if (!orders) return { completed: 0, abandoned: 0, rate: 0 };

      const start = startOfDay(parseISO(startDate));
      const end = endOfDay(parseISO(endDate));

      let completed = 0;
      let abandoned = 0;

      orders.forEach(o => {
          // Date Filter
          if (!isWithinInterval(o.createdAt, { start, end })) return;
          // Community Filter
          if (selectedCommunity !== 'All' && o.customerDetails?.pickupSpot !== selectedCommunity) return;

          if (o.paymentStatus === 'completed') {
              completed++;
          } else {
              abandoned++;
          }
      });

      const total = completed + abandoned;
      const rate = total > 0 ? ((abandoned / total) * 100).toFixed(1) : 0;
      return { completed, abandoned, rate };
  }, [orders, startDate, endDate, selectedCommunity]);

  return (
    <div className="bg-white p-6 rounded-lg shadow h-full flex flex-col">
        <div className="mb-4">
             <h3 className="text-lg font-bold text-gray-800 text-center mb-4">יחס נטישת עגלות</h3>
             
             {/* Mini Controls */}
             <div className="flex flex-col gap-2 text-xs bg-gray-50 p-3 rounded mb-4">
                <div className="flex gap-2">
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
                <select 
                  value={selectedCommunity} 
                  onChange={(e) => setSelectedCommunity(e.target.value)}
                  className="w-full border-gray-300 rounded px-1 py-1"
                >
                  <option value="All">כל הקהילות</option>
                  {communities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
             </div>
        </div>

        <div className="flex flex-col items-center justify-center flex-grow">
            <div className="text-5xl font-bold text-red-500 mb-2">{stats.rate}%</div>
            <div className="text-gray-500 text-sm">שיעור נטישה כולל</div>
            <div className="mt-4 w-full grid grid-cols-2 gap-4 text-center">
                <div className="bg-green-50 p-2 rounded">
                    <div className="font-bold text-green-700">{stats.completed}</div>
                    <div className="text-xs">הושלמו</div>
                </div>
                <div className="bg-red-50 p-2 rounded">
                    <div className="font-bold text-red-700">{stats.abandoned}</div>
                    <div className="text-xs">ננטשו</div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default AbandonedCartsCard;