import React, { useMemo } from 'react';
import { differenceInDays } from 'date-fns';

const CustomerJourney = ({ orders }) => {
  // This component analyzes ALL completed orders to determine customer behavior
  
  const data = useMemo(() => {
      const customerHistory = {}; 
      
      // Sort oldest first
      const sorted = [...orders].filter(o => o.paymentStatus === 'completed').sort((a, b) => a.createdAt - b.createdAt);
      
      sorted.forEach(o => {
          const id = o.customerDetails?.email || o.customerDetails?.phone;
          if (!id) return;
          if (!customerHistory[id]) customerHistory[id] = [];
          customerHistory[id].push(o);
      });

      const orderNumStats = {}; 
      
      Object.values(customerHistory).forEach(userOrders => {
          userOrders.forEach((order, index) => {
              const orderNum = index + 1;
              if (orderNum > 10) return; // Cap at 10 for readability
              
              // Calculate item count
              let itemCount = 0;
              if (order.orderBreakdown) {
                  Object.values(order.orderBreakdown).forEach(biz => {
                      itemCount += biz.items?.reduce((s, i) => s + i.quantity, 0) || 0;
                  });
              }

              // Calculate days since last order
              let daysDiff = 0;
              if (index > 0) {
                  const prevOrder = userOrders[index - 1];
                  daysDiff = differenceInDays(order.createdAt, prevOrder.createdAt);
              }
              
              if (!orderNumStats[orderNum]) {
                  orderNumStats[orderNum] = { 
                      sumItems: 0, 
                      count: 0, 
                      sumTotal: 0,
                      sumDaysDiff: 0,
                      daysCount: 0
                  };
              }

              orderNumStats[orderNum].sumItems += itemCount;
              orderNumStats[orderNum].sumTotal += Number(order.grandTotal || 0);
              orderNumStats[orderNum].count += 1;
              
              if (index > 0) {
                  orderNumStats[orderNum].sumDaysDiff += daysDiff;
                  orderNumStats[orderNum].daysCount += 1;
              }
          });
      });

      return Object.entries(orderNumStats).map(([num, data], index, array) => {
          const orderNum = Number(num);
          const avgTotal = (data.sumTotal / data.count);
          const prevRow = array.find(([n]) => Number(n) === orderNum - 1);
          
          // Retention: (Current Count / Previous Count) * 100
          let retention = null;
          if (prevRow) {
              const prevCount = prevRow[1].count;
              if (prevCount > 0) {
                  retention = ((data.count / prevCount) * 100).toFixed(1) + '%';
              }
          }

          // Avg Days since last
          let avgDays = '-';
          if (data.daysCount > 0) {
              avgDays = (data.sumDaysDiff / data.daysCount).toFixed(1);
          }

          return {
              orderNum: num,
              avgItems: (data.sumItems / data.count).toFixed(1),
              avgTotal: avgTotal.toFixed(0),
              count: data.count,
              retention: retention || '-',
              avgDays: avgDays
          };
      });
  }, [orders]);

  return (
    <div className="bg-white p-6 rounded-lg shadow h-full">
        <h3 className="text-lg font-bold mb-4 text-gray-800">התפתחות לקוח (Customer Journey)</h3>
        <div className="text-sm text-gray-500 mb-4">ניתוח התנהגות צרכנים לפי מספר ההזמנה שלהם</div>
        <div className="overflow-y-auto max-h-[400px]">
            <table className="min-w-full text-sm text-center">
                <thead>
                    <tr className="bg-gray-50 sticky top-0 z-10">
                        <th className="p-2 whitespace-nowrap">מס' הזמנה</th>
                        <th className="p-2 whitespace-nowrap">לקוחות</th>
                        <th className="p-2 whitespace-nowrap">שיעור חזרה</th>
                        <th className="p-2 whitespace-nowrap">ממוצע ימים</th>
                        <th className="p-2 whitespace-nowrap">ממוצע פריטים</th>
                        <th className="p-2 whitespace-nowrap">שווי ממוצע</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row) => (
                        <tr key={row.orderNum} className="border-b hover:bg-gray-50 transition-colors">
                            <td className="p-2 font-medium">#{row.orderNum}</td>
                            <td className="p-2 text-gray-600">{row.count}</td>
                            <td className={`p-2 font-medium ${row.retention !== '-' && parseFloat(row.retention) > 50 ? 'text-green-600' : 'text-gray-600'}`}>
                                {row.retention}
                            </td>
                            <td className="p-2 text-gray-600">
                                {row.avgDays !== '-' ? `${row.avgDays} ימים` : '-'}
                            </td>
                            <td className="p-2">{row.avgItems}</td>
                            <td className="p-2 font-medium">₪{row.avgTotal}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default CustomerJourney;