import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { format } from 'date-fns';

const CustomerInsights = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);

  const [targetOrderCount, setTargetOrderCount] = useState(2);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

  useEffect(() => {
    if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
      setError('אין לך הרשאה לצפות בדף זה');
      setLoading(false);
      return;
    }
    fetchOrders();
  }, [currentUser]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const ref = collection(db, 'customerOrders');
      const q = query(ref, orderBy('createdAt', 'asc'));
      const snap = await getDocs(q);

      const data = snap.docs.map(doc => {
        const raw = doc.data();
        const createdAt = raw.createdAt?.toDate ? raw.createdAt.toDate() : new Date(raw.createdAt);
        return {
          id: doc.id,
          ...raw,
          createdAt,
          grandTotal: Number(raw.grandTotal || 0)
        };
      });

      setOrders(data);
    } catch (e) {
      console.error('Failed to load customer orders', e);
      setError('שגיאה בטעינת נתוני לקוחות');
    } finally {
      setLoading(false);
    }
  };

  // Aggregate per customer
  const customersMap = useMemo(() => {
    const map = {};

    orders.forEach(order => {
      const details = order.customerDetails || {};
      // Use stable customer key: prefer email, then phone, then userId
      const key =
        details.email ||
        details.phone ||
        order.userId ||
        null;

      if (!key) return;

      if (!map[key]) {
        map[key] = {
          id: key,
          name: details.name || 'ללא שם',
          email: details.email || '',
          phone: details.phone || '',
          completedCount: 0,
          abandonedCount: 0,
          totalSpent: 0,
          totalItems: 0,
          firstOrderDate: null,
          lastOrderDate: null,
          orders: [],
          abandonedOrders: []
        };
      }

      const entry = map[key];

      // Calculate item count for this order
      let itemCount = 0;
      if (order.orderBreakdown) {
        Object.values(order.orderBreakdown).forEach(biz => {
          biz.items?.forEach(item => {
            itemCount += item.quantity || 0;
          });
        });
      }

      const orderSummary = {
        id: order.id,
        createdAt: order.createdAt,
        paymentStatus: order.paymentStatus,
        grandTotal: order.grandTotal,
        itemCount,
        pickupSpot: details.pickupSpot || '',
        orderBreakdown: order.orderBreakdown || {}
      };

      if (order.paymentStatus === 'completed') {
        entry.completedCount += 1;
        entry.totalSpent += order.grandTotal;
        entry.totalItems += itemCount;
        entry.orders.push(orderSummary);
      } else {
        entry.abandonedCount += 1;
        entry.abandonedOrders.push(orderSummary);
      }

      if (!entry.firstOrderDate || order.createdAt < entry.firstOrderDate) {
        entry.firstOrderDate = order.createdAt;
      }
      if (!entry.lastOrderDate || order.createdAt > entry.lastOrderDate) {
        entry.lastOrderDate = order.createdAt;
      }
    });

    // Sort orders per customer by date
    Object.values(map).forEach(c => {
      c.orders.sort((a, b) => a.createdAt - b.createdAt);
      c.abandonedOrders.sort((a, b) => a.createdAt - b.createdAt);
    });

    return map;
  }, [orders]);

  const customersList = useMemo(
    () =>
      Object.values(customersMap).sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      ),
    [customersMap]
  );

  // Customers by number of orders
  const filteredByOrderCount = useMemo(() => {
    if (!targetOrderCount || targetOrderCount <= 0) return [];
    return customersList.filter(
      c => c.completedCount === Number(targetOrderCount)
    );
  }, [customersList, targetOrderCount]);

  const selectedCustomer =
    selectedCustomerId && customersMap[selectedCustomerId]
      ? customersMap[selectedCustomerId]
      : null;

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          ניתוח לקוחות ופעילות אישית
        </h1>

        {/* Section 1: Customers by number of orders */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">
                לקוחות לפי מספר הזמנות
              </h2>
              <p className="text-sm text-gray-500">
                בחר מספר הזמנות כדי לראות מי הם הלקוחות שביצעו בדיוק מספר זה של
                הזמנות שהושלמו.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">מספר הזמנות:</label>
              <input
                type="number"
                min="1"
                value={targetOrderCount}
                onChange={e =>
                  setTargetOrderCount(Number(e.target.value) || 1)
                }
                className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-right">שם</th>
                  <th className="p-2 text-right">אימייל</th>
                  <th className="p-2 text-right">טלפון</th>
                  <th className="p-2 text-right">הזמנות שהושלמו</th>
                  <th className="p-2 text-right">עגלות נטושות</th>
                  <th className="p-2 text-right">סה״כ פריטים</th>
                  <th className="p-2 text-right">סה״כ הוצאה</th>
                  <th className="p-2 text-right">הזמנה ראשונה</th>
                  <th className="p-2 text-right">הזמנה אחרונה</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredByOrderCount.map(c => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedCustomerId(c.id)}
                  >
                    <td className="p-2 font-medium text-gray-900">{c.name}</td>
                    <td className="p-2 text-gray-700">{c.email}</td>
                    <td className="p-2 text-gray-700">{c.phone}</td>
                    <td className="p-2 text-center">{c.completedCount}</td>
                    <td className="p-2 text-center">{c.abandonedCount}</td>
                    <td className="p-2 text-center">{c.totalItems}</td>
                    <td className="p-2 text-right text-green-700 font-semibold">
                      ₪{c.totalSpent.toFixed(2)}
                    </td>
                    <td className="p-2 text-gray-500">
                      {c.firstOrderDate
                        ? format(c.firstOrderDate, 'dd/MM/yy')
                        : '-'}
                    </td>
                    <td className="p-2 text-gray-500">
                      {c.lastOrderDate
                        ? format(c.lastOrderDate, 'dd/MM/yy')
                        : '-'}
                    </td>
                  </tr>
                ))}
                {filteredByOrderCount.length === 0 && (
                  <tr>
                    <td
                      colSpan="9"
                      className="p-4 text-center text-gray-400 text-sm"
                    >
                      לא נמצאו לקוחות עם מספר הזמנות זה.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Single-customer detail view */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">
                פרופיל לקוח מפורט
              </h2>
              <p className="text-sm text-gray-500">
                בחר לקוח מהרשימה כדי לראות את כל ההיסטוריה שלו: הזמנות, עגלות
                נטושות, פריטים וסכומים.
              </p>
            </div>
            <div className="w-full md:w-80">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                בחר לקוח
              </label>
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
              >
                <option value="">בחר לקוח...</option>
                {customersList.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.email ? `(${c.email})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!selectedCustomer && (
            <div className="text-gray-400 text-sm text-center py-8">
              בחר לקוח כדי לראות פירוט.
            </div>
          )}

          {selectedCustomer && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded p-4">
                  <h3 className="font-bold text-gray-800 mb-2">פרטי לקוח</h3>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">שם: </span>
                    {selectedCustomer.name}
                  </p>
                  {selectedCustomer.email && (
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">אימייל: </span>
                      {selectedCustomer.email}
                    </p>
                  )}
                  {selectedCustomer.phone && (
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">טלפון: </span>
                      {selectedCustomer.phone}
                    </p>
                  )}
                </div>

                <div className="bg-gray-50 rounded p-4">
                  <h3 className="font-bold text-gray-800 mb-2">סטטיסטיקות</h3>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">הזמנות שהושלמו: </span>
                    {selectedCustomer.completedCount}
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">עגלות נטושות: </span>
                    {selectedCustomer.abandonedCount}
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">סה״כ פריטים: </span>
                    {selectedCustomer.totalItems}
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">סה״כ הוצאה: </span>
                    ₪{selectedCustomer.totalSpent.toFixed(2)}
                  </p>
                  {selectedCustomer.completedCount > 0 && (
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">ממוצע להזמנה: </span>
                      ₪
                      {(
                        selectedCustomer.totalSpent /
                        selectedCustomer.completedCount
                      ).toFixed(2)}
                    </p>
                  )}
                </div>

                <div className="bg-gray-50 rounded p-4">
                  <h3 className="font-bold text-gray-800 mb-2">ציר זמן</h3>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">הזמנה ראשונה: </span>
                    {selectedCustomer.firstOrderDate
                      ? format(selectedCustomer.firstOrderDate, 'dd/MM/yy HH:mm')
                      : '-'}
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">הזמנה אחרונה: </span>
                    {selectedCustomer.lastOrderDate
                      ? format(selectedCustomer.lastOrderDate, 'dd/MM/yy HH:mm')
                      : '-'}
                  </p>
                </div>
              </div>

              {/* Completed Orders */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">
                  הזמנות שהושלמו
                </h3>
                <div className="overflow-x-auto border rounded">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-right">תאריך</th>
                        <th className="p-2 text-right">מס' הזמנה</th>
                        <th className="p-2 text-right">קהילה</th>
                        <th className="p-2 text-right">מס' פריטים</th>
                        <th className="p-2 text-right">סכום</th>
                        <th className="p-2 text-right">פירוט</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedCustomer.orders.map(o => (
                        <tr key={o.id} className="align-top">
                          <td className="p-2 text-gray-700 whitespace-nowrap">
                            {format(o.createdAt, 'dd/MM/yy HH:mm')}
                          </td>
                          <td className="p-2 text-gray-700">{o.id}</td>
                          <td className="p-2 text-gray-700">
                            {o.pickupSpot || '-'}
                          </td>
                          <td className="p-2 text-center">{o.itemCount}</td>
                          <td className="p-2 text-right text-green-700 font-semibold">
                            ₪{o.grandTotal.toFixed(2)}
                          </td>
                          <td className="p-2 text-xs text-gray-600">
                            {o.orderBreakdown &&
                              Object.values(o.orderBreakdown).map(
                                (biz, idx) => (
                                  <div key={idx} className="mb-1">
                                    <div className="font-medium text-gray-800">
                                      {biz.businessName}
                                    </div>
                                    <ul className="list-disc list-inside pr-3">
                                      {biz.items?.map((item, i) => (
                                        <li key={i}>
                                          {item.quantity}× {item.productName}{' '}
                                          {item.selectedOption &&
                                            item.selectedOption !== 'None' &&
                                            `(${item.selectedOption})`}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )
                              )}
                          </td>
                        </tr>
                      ))}
                      {selectedCustomer.orders.length === 0 && (
                        <tr>
                          <td
                            colSpan="6"
                            className="p-4 text-center text-gray-400"
                          >
                            אין הזמנות שהושלמו.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Abandoned Carts */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">
                  עגלות נטושות
                </h3>
                <div className="overflow-x-auto border rounded">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-right">תאריך</th>
                        <th className="p-2 text-right">מס' הזמנה</th>
                        <th className="p-2 text-right">סטטוס</th>
                        <th className="p-2 text-right">מס' פריטים</th>
                        <th className="p-2 text-right">סכום</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedCustomer.abandonedOrders.map(o => (
                        <tr key={o.id}>
                          <td className="p-2 text-gray-700 whitespace-nowrap">
                            {format(o.createdAt, 'dd/MM/yy HH:mm')}
                          </td>
                          <td className="p-2 text-gray-700">{o.id}</td>
                          <td className="p-2 text-gray-700">
                            {o.paymentStatus || 'לא הושלם'}
                          </td>
                          <td className="p-2 text-center">{o.itemCount}</td>
                          <td className="p-2 text-right text-gray-700">
                            {o.grandTotal
                              ? `₪${o.grandTotal.toFixed(2)}`
                              : '-'}
                          </td>
                        </tr>
                      ))}
                      {selectedCustomer.abandonedOrders.length === 0 && (
                        <tr>
                          <td
                            colSpan="5"
                            className="p-4 text-center text-gray-400"
                          >
                            אין עגלות נטושות ללקוח זה.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerInsights;


