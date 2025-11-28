import React, { useMemo } from 'react';

const TopProducts = ({ orders }) => {
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
    return Object.values(stats).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [orders]);

  return (
    <div className="bg-white p-6 rounded-lg shadow h-full">
        <h3 className="text-lg font-bold mb-4 text-gray-800">מוצרים נמכרים ביותר</h3>
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
                    {data.map((prod, i) => (
                        <tr key={i}>
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
