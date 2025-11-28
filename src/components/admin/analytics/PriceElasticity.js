import React, { useState, useMemo } from 'react';
import SharedBarChart from './SharedBarChart';
import { format, startOfWeek, startOfMonth } from 'date-fns';

const PriceElasticity = ({ orders }) => {
  const [selectedProduct, setSelectedProduct] = useState('');
  const [viewMode, setViewMode] = useState('timeline'); // 'price_points' or 'timeline'
  const [period, setPeriod] = useState('week'); // 'week' or 'month'

  // 1. Extract unique products for dropdown
  const products = useMemo(() => {
    if (!orders) return [];
    const productSet = new Set();
    orders.forEach(o => {
      if (o.paymentStatus !== 'completed') return;
      if (o.orderBreakdown) {
        Object.values(o.orderBreakdown).forEach(biz => {
          biz.items?.forEach(item => {
             productSet.add(item.productName);
          });
        });
      }
    });
    return Array.from(productSet).sort();
  }, [orders]);

  // 2. Analyze data for selected product
  const { pricePointData, timelineData } = useMemo(() => {
    if (!selectedProduct || !orders) return { pricePointData: [], timelineData: [] };

    const pricePoints = {}; // { price: { count: 0, totalQty: 0 } }
    const bucketData = {}; // { key: { date, label, totalQty, sumPrice, count } }

    // Sort orders by date for timeline
    const sortedOrders = [...orders].sort((a, b) => a.createdAt - b.createdAt);

    sortedOrders.forEach(o => {
      if (o.paymentStatus !== 'completed') return;
      if (o.orderBreakdown) {
        Object.values(o.orderBreakdown).forEach(biz => {
          biz.items?.forEach(item => {
             if (item.productName === selectedProduct) {
                 const price = Number(item.price);
                 const qty = item.quantity;

                 // --- Aggregated by Price ---
                 if (!pricePoints[price]) pricePoints[price] = { price, count: 0, totalQty: 0 };
                 pricePoints[price].count += 1; 
                 pricePoints[price].totalQty += qty; 

                 // --- Aggregated by Week / Month (Timeline) ---
                 const bucketStart = period === 'week' 
                   ? startOfWeek(o.createdAt, { weekStartsOn: 0 })
                   : startOfMonth(o.createdAt);

                 const key = format(bucketStart, period === 'week' ? 'yyyy-MM-dd' : 'yyyy-MM');
                 const label = format(bucketStart, period === 'week' ? 'dd/MM' : 'MM/yy');
                 
                 if (!bucketData[key]) bucketData[key] = { date: bucketStart, label, totalQty: 0, sumPrice: 0, count: 0 };
                 bucketData[key].totalQty += qty;
                 bucketData[key].sumPrice += (price * qty); // Weighted price
                 bucketData[key].count += qty;
             }
          });
        });
      }
    });

    // Process Price Points
    const processedPricePoints = Object.values(pricePoints)
      .sort((a, b) => a.price - b.price)
      .map(p => ({
          label: `₪${p.price}`,
          price: p.price,
          totalQty: p.totalQty,
          avgQty: (p.totalQty / p.count).toFixed(2),
          orderCount: p.count
      }));

    // Process Timeline
    // We want to show the *Price* as the label on the timeline bar to see correlation
    const processedTimeline = Object.values(bucketData)
      .sort((a, b) => a.date - b.date)
      .map(w => {
          // Weighted Average Price for that period
          const avgPrice = w.count > 0 ? (w.sumPrice / w.count) : 0;
          const priceLabel = `₪${Number(avgPrice).toFixed(avgPrice % 1 === 0 ? 0 : 1)}`;
          
          return {
              label: w.label, // Week / Month label
              totalQty: w.totalQty,
              priceLabel // Price at that time
          };
      });

    return { pricePointData: processedPricePoints, timelineData: processedTimeline };
  }, [orders, selectedProduct, period]);

  // Set default product
  if (!selectedProduct && products.length > 0) {
      setSelectedProduct(products[0]);
  }

  return (
    <div className="flex flex-col h-full bg-white p-6 rounded-lg shadow">
      <div className="mb-6">
        <div className="flex justify-between items-start mb-4">
            <div>
                <h4 className="font-bold text-gray-800 text-lg">רגישות למחיר (Price Elasticity)</h4>
                <p className="text-sm text-gray-500">השפעת שינויי מחיר על כמות המכירות</p>
            </div>
            
            {/* View Toggle */}
            <div className="flex gap-2 items-center">
              <div className="flex border border-gray-300 rounded overflow-hidden text-sm">
                <button 
                  onClick={() => setViewMode('timeline')}
                  className={`px-3 py-1 ${viewMode === 'timeline' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  לפי ציר זמן
                </button>
                <button 
                  onClick={() => setViewMode('price_points')}
                  className={`px-3 py-1 ${viewMode === 'price_points' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  לפי רמות מחיר
                </button>
              </div>
              {viewMode === 'timeline' && (
                <div className="flex border border-gray-300 rounded overflow-hidden text-xs">
                  <button 
                    onClick={() => setPeriod('week')}
                    className={`px-2 py-1 ${period === 'week' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    שבועי
                  </button>
                  <button 
                    onClick={() => setPeriod('month')}
                    className={`px-2 py-1 ${period === 'month' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    חודשי
                  </button>
                </div>
              )}
            </div>
        </div>

        <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">בחר מוצר לניתוח</label>
            <select 
              value={selectedProduct} 
              onChange={(e) => setSelectedProduct(e.target.value)}
              className="w-full text-sm border-gray-300 rounded px-2 py-2 max-w-md shadow-sm"
            >
              {products.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
        </div>
      </div>

      <div className="flex-grow">
          {viewMode === 'timeline' ? (
               <SharedBarChart 
                data={timelineData}
                labelKey="label"
                valueKey="totalQty"
                topLabelKey="priceLabel"
                title="מכירות שבועיות ומחיר"
                subtitle="המספר מעל העמודה מייצג את המחיר הממוצע באותו שבוע"
                color="bg-indigo-500"
               />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                <SharedBarChart 
                    data={pricePointData}
                    labelKey="label"
                    valueKey="totalQty"
                    title="סך הכל נמכר לפי מחיר"
                    color="bg-blue-500"
                />
                <SharedBarChart 
                    data={pricePointData}
                    labelKey="label"
                    valueKey="avgQty"
                    title="ממוצע להזמנה לפי מחיר"
                    color="bg-orange-400"
                />
            </div>
          )}
      </div>
    </div>
  );
};

export default PriceElasticity;