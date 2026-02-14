import React, { useState, useEffect } from 'react';
import { getCommunityPopularItems } from '../../../services/communityDiscountService';

const PopularItemsWidget = ({ communityName }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showWeek, setShowWeek] = useState(0); // 0 = current week

  useEffect(() => {
    if (!communityName) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getCommunityPopularItems(communityName, showWeek);
        if (!cancelled) setItems(data.slice(0, 10)); // top 10
      } catch (err) {
        console.error('Error loading popular items:', err);
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [communityName, showWeek]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 bg-gray-200 rounded w-full mb-2" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
        <p className="text-red-500 text-sm text-center">שגיאה בטעינת מוצרים פופולריים: {error}</p>
      </div>
    );
  }

  const getUnitLabel = (item) => {
    if (item.measurementType === 'package') return 'יח\'';
    if (item.measurementType === 'unit') return 'יח\'';
    return 'ק"ג';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-l from-orange-500 to-orange-600 text-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">מוצרים פופולריים</h3>
            <p className="text-orange-100 text-sm mt-1">המוצרים הנמכרים ביותר בקהילה</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowWeek(0)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                showWeek === 0
                  ? 'bg-white text-orange-600 font-semibold'
                  : 'bg-orange-400 text-white'
              }`}
            >
              השבוע
            </button>
            <button
              onClick={() => setShowWeek(1)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                showWeek === 1
                  ? 'bg-white text-orange-600 font-semibold'
                  : 'bg-orange-400 text-white'
              }`}
            >
              שבוע שעבר
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {items.length === 0 ? (
          <p className="text-center text-gray-400 py-4">אין נתונים לשבוע זה</p>
        ) : (
          <div className="space-y-3">
            {items.map((item, idx) => {
              const maxQty = items[0]?.totalQuantity || 1;
              const barWidth = (item.totalQuantity / maxQty) * 100;
              return (
                <div key={idx} className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx < 3 ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-800">
                        {item.productName}
                      </span>
                      {item.selectedOption && item.selectedOption !== 'default' && item.selectedOption !== 'None' && (
                        <span className="text-xs text-gray-500">({item.selectedOption})</span>
                      )}
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-semibold text-gray-700">
                        {item.totalQuantity.toFixed(1)} {getUnitLabel(item)}
                      </span>
                      <span className="text-xs text-gray-400 mr-2">
                        ({item.orderCount} הזמנות)
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-orange-300 to-orange-500 transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PopularItemsWidget;
