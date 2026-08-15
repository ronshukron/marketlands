import React, { useMemo, useState } from 'react';

const TopProducts = ({ orders }) => {
  const [visibleCount, setVisibleCount] = useState(10);
  const data = useMemo(() => {
    const stats = {};
    orders.forEach(o => {
      if (o.paymentStatus !== 'completed') return;
      if (!o.orderBreakdown) return;

      Object.values(o.orderBreakdown).forEach(biz => {
        biz.items?.forEach(item => {
            const key = `${item.productName} (${biz.businessName})`;
            if (!stats[key]) stats[key] = { name: item.productName, business: biz.businessName, qty: 0, revenue: 0 };
            stats[key].qty += item.quantity;
            stats[key].revenue += (item.price * item.quantity);
        });
      });
    });
    return Object.values(stats).sort((a, b) => b.revenue - a.revenue);
  }, [orders]);
  const visibleProducts = visibleCount === 'all' ? data : data.slice(0, visibleCount);

  return (
    <div className="bg-white p-6 rounded-lg shadow h-full">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
                <h3 className="text-lg font-bold text-gray-800">מוצרים נמכרים ביותר</h3>
                <p className="mt-1 text-xs text-gray-500">
                    מציג {visibleProducts.length} מתוך {data.length} מוצרים
                </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600">
                <span>הצג</span>
                <select
                    value={visibleCount}
                    onChange={(event) => setVisibleCount(
                        event.target.value === 'all' ? 'all' : Number(event.target.value),
                    )}
                    className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value="all">הכול</option>
                </select>
            </label>
        </div>
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="p-2 text-right">מוצר</th>
                        <th className="p-2 text-right">כמות</th>
                        <th className="p-2 text-right">הכנסות</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {visibleProducts.map((prod) => (
                        <tr key={`${prod.business}-${prod.name}`}>
                            <td className="p-2">
                                <div className="font-medium">{prod.name}</div>
                                <div className="text-xs text-gray-500">{prod.business}</div>
                            </td>
                            <td className="p-2">{prod.qty}</td>
                            <td className="p-2">₪{prod.revenue.toLocaleString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default TopProducts;
