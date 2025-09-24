import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';

const formatDate = (value) => {
  if (!value) return 'No date';
  const d = value?.toDate ? value.toDate() : new Date(value);
  return isNaN(d.getTime()) ? 'No date' : d.toLocaleString('he-IL');
};

const isHeldLike = (co) => {
  const status = co?.paymentStatus || co?.orderBreakdown?.paymentStatus || '';
  const code = String(co?.holdStatusCode || '');
  const heldStatuses = new Set(['held', 'pending_payment', 'pending', 'authorized']);
  if (heldStatuses.has(String(status).toLowerCase())) return true;
  if (code === '11') return true; // treat 11 as held/authorized
  return false;
};

const IndependentBusinessDashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prepTotalsByOrder, setPrepTotalsByOrder] = useState({});
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    const load = async () => {
      if (!currentUser?.uid) { setLoading(false); return; }
      setLoading(true);
      try {
        const qy = query(collection(db, 'IndependentOrders'), where('businessId', '==', currentUser.uid));
        const snap = await getDocs(qy);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setOrders(list);
      } catch (e) {
        console.error('Failed loading independent orders for business', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser?.uid]);


  const CO_COLLECTION = 'IndepentCustomerOrders'; 
  // Aggregate per-order item totals (total vs held) across all communities
  useEffect(() => {
    let cancelled = false;
  
    const aggregate = async () => {
      if (!orders || orders.length === 0) {
        if (!cancelled) setPrepTotalsByOrder({});
        return;
      }
  
      const result = {};
  
      try {
        // Query customer orders per independent order by foreign key (more robust)
        for (const order of orders) {
          const qsnap = await getDocs(
            query(
              collection(db, CO_COLLECTION),
              where('independentOrderId', '==', order.id)
            )
          );
  
          const coDocs = qsnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  
          // Aggregate totals per product (name + option)
          const totalsAll = new Map(); // key -> { name, option, qtyTotal, amountTotal, qtyHeld, amountHeld }
  
          for (const co of coDocs) {
            const held = isHeldLike(co);
            const items = Array.isArray(co.items) ? co.items : [];
            for (const it of items) {
              if (it.isShipping) continue;
              const name = it.productName || it.name || 'פריט';
              const option = it.selectedOption || '';
              const key = `${name}|${option}`;
  
              const row =
                totalsAll.get(key) ||
                { name, option, qtyTotal: 0, amountTotal: 0, qtyHeld: 0, amountHeld: 0 };
  
              const qty = Number(it.quantity || 0);
              const price = Number(it.price || 0);
              const lineTotal = price * qty;
  
              row.qtyTotal += qty;
              row.amountTotal += lineTotal;
  
              if (held) {
                row.qtyHeld += qty;
                row.amountHeld += lineTotal;
              }
  
              totalsAll.set(key, row);
            }
          }
  
          result[order.id] = Array.from(totalsAll.values()).sort((a, b) =>
            (a.name || '').localeCompare(b.name || '')
          );
        }
  
        if (!cancelled) setPrepTotalsByOrder(result);
      } catch (err) {
        console.error('Failed aggregating prep totals', err);
        if (!cancelled) setPrepTotalsByOrder({});
      }
    };
  
    aggregate();
    return () => {
      cancelled = true;
    };
  }, [orders]);

  const rows = useMemo(() => {
    const enriched = orders.map(o => {
      const mapByCommunity = o.customerOrderIdsByCommunity || {};
      const customerCount = Object.values(mapByCommunity).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
      const endDate = o.endingTime;
      const isActive = (() => {
        if (!endDate) return true;
        const d = endDate.toDate ? endDate.toDate() : new Date(endDate);
        return new Date() < d && (o.status || 'open') === 'open';
      })();
      return { ...o, customerCount, isActive };
    });
    // Sort: active first, then by ending time ascending, then by name
    enriched.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const ad = a.endingTime?.toDate ? a.endingTime.toDate() : new Date(a.endingTime || 0);
      const bd = b.endingTime?.toDate ? b.endingTime.toDate() : new Date(b.endingTime || 0);
      if (ad && bd && ad.getTime() !== bd.getTime()) return ad.getTime() - bd.getTime();
      return (a.orderName || '').localeCompare(b.orderName || '');
    });
    return enriched;
  }, [orders]);

  const toggleExpand = (orderId) => {
    setExpanded(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div dir="rtl" className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">הזמנות עצמאיות</h1>
        <p className="text-gray-600">ניהול הזמנות עצמאיות של העסק</p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h2 className="text-xl font-semibold p-6 border-b">ההזמנות שלך</h2>
        {rows.length === 0 ? (
          <div className="text-center py-16 text-gray-500">אין הזמנות עצמאיות</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">שם</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">תאריך סיום</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">לקוחות</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">סטטוס</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">פעולות</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map(order => (
                  <React.Fragment key={order.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{order.orderName || order.id}</div>
                        <div className="text-xs text-gray-500">{Array.isArray(order.pickupSpots) ? order.pickupSpots.join(', ') : ''}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDate(order.endingTime)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.customerCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${order.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {order.isActive ? 'פעיל' : (order.status === 'canceled' ? 'בוטל' : 'הסתיים')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex gap-2 justify-end">
                        <button onClick={() => navigate(`/independent-orders/${order.id}`)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors">צפה</button>
                        <button onClick={() => toggleExpand(order.id)} className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded text-xs font-medium transition-colors">
                          {expanded[order.id] ? 'סגור פרטי הכנה' : 'פרטי הכנה'}
                        </button>
                      </td>
                    </tr>
                    {expanded[order.id] && (
                      <tr>
                        <td colSpan={5} className="bg-gray-50 px-6 py-4">
                          <div className="text-sm font-semibold mb-2">סיכום פריטים להכנה</div>
                          {Array.isArray(prepTotalsByOrder[order.id]) && prepTotalsByOrder[order.id].length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-xs">
                                <thead>
                                  <tr className="text-gray-600">
                                    <th className="text-right py-2 pr-2">פריט</th>
                                    <th className="text-right py-2 pr-2">אופציה</th>
                                    <th className="text-right py-2 pr-2">כמות (סה"כ)</th>
                                    <th className="text-right py-2 pr-2">סכום (סה"כ)</th>
                                    <th className="text-right py-2 pr-2">כמות מוחזקת</th>
                                    <th className="text-right py-2 pr-2">סכום מוחזק</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {prepTotalsByOrder[order.id].map((row, idx) => (
                                    <tr key={idx} className="border-t">
                                      <td className="py-1 pr-2">{row.name}</td>
                                      <td className="py-1 pr-2">{row.option || '-'}</td>
                                      <td className="py-1 pr-2">{row.qtyTotal}</td>
                                      <td className="py-1 pr-2">₪{row.amountTotal.toFixed(2)}</td>
                                      <td className="py-1 pr-2">{row.qtyHeld}</td>
                                      <td className="py-1 pr-2">₪{row.amountHeld.toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-gray-500">אין נתוני פריטים להצגה</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default IndependentBusinessDashboard; 