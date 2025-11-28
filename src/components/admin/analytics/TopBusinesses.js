import React, { useMemo } from 'react';

const TopBusinesses = ({ orders }) => {
  const data = useMemo(() => {
    const stats = {};
    orders.forEach(o => {
      if (o.paymentStatus !== 'completed') return;
      if (!o.orderBreakdown) return;

      Object.values(o.orderBreakdown).forEach(biz => {
        const name = biz.businessName || 'Unknown';
        if (!stats[name]) stats[name] = { name, revenue: 0, orders: 0 };
        
        const bizTotal = biz.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
        stats[name].revenue += bizTotal;
        stats[name].orders += 1;
      });
    });
    return Object.values(stats).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [orders]);

  return (
    <div className="bg-white p-6 rounded-lg shadow h-full">
        <h3 className="text-lg font-bold mb-4 text-gray-800">עסקים מובילים (לפי הכנסות)</h3>
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="p-2 text-right">שם העסק</th>
                        <th className="p-2 text-right">הזמנות</th>
                        <th className="p-2 text-right">הכנסות</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {data.map((biz, i) => (
                        <tr key={i}>
                            <td className="p-2 font-medium">{biz.name}</td>
                            <td className="p-2">{biz.orders}</td>
                            <td className="p-2 text-green-600 font-bold">₪{biz.revenue.toLocaleString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default TopBusinesses;
