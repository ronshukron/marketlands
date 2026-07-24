// Financial summary V5 — every number is derived from charged-line reconciliation.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import { pickupSpots } from '../../data/pickupSpots';
import LoadingSpinner from '../LoadingSpinner';
import {
  isPaidWeeklySummaryOrder,
  reconcileChargedOrder,
  reconcileWeeklyOrders,
} from '../../utils/weeklySummaryChargedLines';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

function toDate(value) {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return value?.toDate ? value.toDate() : null;
}

function weekStart(value) {
  const date = new Date(value);
  date.setDate(date.getDate() - date.getDay());
  date.setHours(0, 0, 0, 0);
  return date;
}

function displayQuantity(line) {
  if (line.measurementType === 'package' || line.measurementType === 'unit') {
    return `${Number(line.actualQuantity || 0).toFixed(line.measurementType === 'package' ? 0 : 2)} יח'`;
  }
  return `${Number(line.actualQuantity || 0).toFixed(3)} ק"ג`;
}

function aggregateBusinesses(orders) {
  const businesses = {};
  orders.forEach((order) => {
    order.lines.forEach((line) => {
      const parsedBusiness = order.orderBreakdown?.[line.businessOrderKey] || {};
      const businessKey = line.businessId || line.businessOrderKey || (line.isIntroductionBasket ? 'baskets' : 'unassigned');
      if (!businesses[businessKey]) {
        businesses[businessKey] = {
          businessName: line.businessName
            || parsedBusiness.businessName
            || (line.isIntroductionBasket ? 'סלי היכרות' : 'פריטים נוספים בשקילה'),
          products: {},
          totalRevenue: 0,
        };
      }
      const productKey = `${line.productId || line.productName}_${line.selectedOption || ''}`;
      if (!businesses[businessKey].products[productKey]) {
        businesses[businessKey].products[productKey] = {
          productName: line.productName,
          selectedOption: line.selectedOption,
          measurementType: line.measurementType,
          quantity: 0,
          totalRevenue: 0,
        };
      }
      businesses[businessKey].products[productKey].quantity += Number(line.actualQuantity) || 0;
      businesses[businessKey].products[productKey].totalRevenue += line.chargedTotal;
      businesses[businessKey].totalRevenue += line.chargedTotal;
    });
  });
  return businesses;
}

export default function WeeklyOrderSummaryV5() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [tempWeek, setTempWeek] = useState('');
  const [selectedWeek, setSelectedWeek] = useState('');
  const [tempCommunities, setTempCommunities] = useState(new Set());
  const [selectedCommunities, setSelectedCommunities] = useState(new Set());
  const [showCommunities, setShowCommunities] = useState(false);
  const [orders, setOrders] = useState([]);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const close = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setShowCommunities(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
      setError('You are not authorized to view this page');
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      getDocs(collection(db, 'Orders')),
      getDocs(collection(db, 'customerOrdersDelayed')),
    ]).then(([businessSnapshot, delayedSnapshot]) => {
      if (!active) return;
      const weeks = new Set();
      businessSnapshot.docs.forEach((document) => {
        const data = document.data();
        const date = toDate(data.Ending_Time || data.endingTime);
        if (date) weeks.add(weekStart(date).toISOString().split('T')[0]);
      });
      delayedSnapshot.docs.forEach((document) => {
        const date = toDate(document.data().createdAt);
        if (date) weeks.add(weekStart(date).toISOString().split('T')[0]);
      });
      const sorted = [...weeks].sort((a, b) => new Date(b) - new Date(a));
      setAvailableWeeks(sorted);
      setTempWeek(sorted[0] || '');
    }).catch((fetchError) => {
      console.error('Error fetching V5 weeks:', fetchError);
      if (active) setError('Failed to load weeks data');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [currentUser]);

  useEffect(() => {
    if (!selectedWeek) return undefined;
    let active = true;
    const start = new Date(selectedWeek);
    const end = new Date(start);
    end.setDate(start.getDate() + 5);
    end.setHours(23, 59, 59, 999);
    setLoading(true);
    Promise.all([
      getDocs(collection(db, 'customerOrders')),
      getDocs(collection(db, 'customerOrdersDelayed')),
    ]).then(([regularSnapshot, delayedSnapshot]) => {
      if (!active) return;
      const documents = [
        ...regularSnapshot.docs.map((document) => ({ document, isDelayed: false })),
        ...delayedSnapshot.docs.map((document) => ({ document, isDelayed: true })),
      ];
      const nextOrders = documents.flatMap(({ document, isDelayed }) => {
        const data = document.data();
        if (!isPaidWeeklySummaryOrder(data, isDelayed)) return [];
        const createdDate = toDate(data.createdAt);
        if (!createdDate || createdDate < start || createdDate > end) return [];
        const pickupSpot = data.customerDetails?.pickupSpot || 'לא צוין';
        if (selectedCommunities.size && !selectedCommunities.has(pickupSpot)) return [];
        return [reconcileChargedOrder({
          id: document.id,
          ...data,
          isDelayed,
          createdDate,
          pickupSpot,
        }, { isDelayed })];
      }).sort((a, b) => b.createdDate - a.createdDate);
      setOrders(nextOrders);
    }).catch((fetchError) => {
      console.error('Error fetching V5 orders:', fetchError);
      if (active) setError('Failed to load order data');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [selectedWeek, selectedCommunities]);

  const summary = useMemo(() => reconcileWeeklyOrders(orders), [orders]);
  const businesses = useMemo(() => aggregateBusinesses(summary.orders), [summary.orders]);
  const byPickupSpot = useMemo(() => summary.orders.reduce((groups, order) => {
    const spot = order.pickupSpot || 'לא צוין';
    if (!groups[spot]) groups[spot] = [];
    groups[spot].push(order);
    return groups;
  }, {}), [summary.orders]);
  const missingProducts = useMemo(() => summary.missingLines.reduce((groups, line) => {
    const key = `${line.productName}_${line.selectedOption || ''}`;
    if (!groups[key]) groups[key] = { ...line, count: 0, total: 0 };
    groups[key].count += Number(line.quantity) || 0;
    groups[key].total += line.estimatedTotal;
    return groups;
  }, {}), [summary.missingLines]);
  const actualGap = summary.actualProductTotal - summary.estimatedFulfilled;
  const gapPercent = summary.estimatedFulfilled
    ? (actualGap / summary.estimatedFulfilled) * 100
    : 0;

  const toggleCommunity = (spot) => {
    setTempCommunities((previous) => {
      const next = new Set(previous);
      if (next.has(spot)) next.delete(spot);
      else next.add(spot);
      return next;
    });
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="m-8 bg-red-100 border border-red-400 text-red-700 p-4 rounded">{error}</div>;

  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <h1 className="text-3xl font-bold text-center mb-8">סיכום הכנסות שבועי V5</h1>

      <div className="mb-6 bg-white p-6 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">בחר שבוע:</label>
            <select value={tempWeek} onChange={(event) => setTempWeek(event.target.value)} className="w-full px-3 py-2 border rounded">
              {availableWeeks.map((week) => {
                const sunday = new Date(week);
                const friday = new Date(sunday);
                friday.setDate(sunday.getDate() + 5);
                return <option key={week} value={week}>{format(sunday, 'dd/MM/yyyy')} - {format(friday, 'dd/MM/yyyy')}</option>;
              })}
            </select>
          </div>
          <div ref={dropdownRef}>
            <label className="block text-sm font-medium mb-2">בחר קהילות:</label>
            <div className="relative">
              <button type="button" onClick={() => setShowCommunities((value) => !value)} className="w-full px-3 py-2 border rounded text-right bg-white">
                {tempCommunities.size ? `${tempCommunities.size} קהילות נבחרו` : 'כל הקהילות'}
              </button>
              {showCommunities && (
                <div className="absolute z-20 mt-1 w-full bg-white border rounded shadow-lg p-2 max-h-80 overflow-auto">
                  <div className="flex gap-2 pb-2 mb-2 border-b">
                    <button type="button" onClick={() => setTempCommunities(new Set(pickupSpots))} className="text-xs px-2 py-1 bg-green-500 text-white rounded">בחר הכל</button>
                    <button type="button" onClick={() => setTempCommunities(new Set())} className="text-xs px-2 py-1 bg-gray-300 rounded">נקה הכל</button>
                  </div>
                  {pickupSpots.map((spot) => (
                    <label key={spot} className="flex items-center px-2 py-1 text-sm">
                      <input type="checkbox" checked={tempCommunities.has(spot)} onChange={() => toggleCommunity(spot)} className="ml-2" />
                      {spot}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="text-center mt-6">
          <button type="button" onClick={() => { setSelectedWeek(tempWeek); setSelectedCommunities(new Set(tempCommunities)); }} className="px-8 py-3 bg-green-600 text-white font-bold rounded-lg shadow">
            טען נתונים
          </button>
        </div>
      </div>

      {!summary.orders.length ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded text-center">לא נמצאו הזמנות ששולמו</div>
      ) : (
        <>
          <section className="mb-8 bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4 text-green-800">סיכום כספי מתואם</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                ['הזמנות מוצלחות', summary.successfulCount, 'text-gray-800'],
                ['חיובי מוצרים מדויקים', `₪${summary.productCharges.toFixed(2)}`, 'text-blue-700'],
                ['דמי משלוח', `₪${summary.deliveryFees.toFixed(2)}`, 'text-gray-700'],
                ['סה"כ שולם', `₪${summary.totalPaid.toFixed(2)}`, 'text-green-700'],
              ].map(([label, value, color]) => (
                <div key={label} className="bg-white p-4 rounded shadow">
                  <p className="text-gray-500 text-sm">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="bg-white p-4 rounded shadow">
                <p className="text-sm text-gray-500">הערכה לפריטים שחויבו</p>
                <p className="text-2xl font-bold text-blue-700">₪{summary.estimatedFulfilled.toFixed(2)}</p>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <p className="text-sm text-gray-500">בפועל מול הערכה</p>
                <p className={`text-2xl font-bold ${actualGap >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {actualGap >= 0 ? '+' : '-'}₪{Math.abs(actualGap).toFixed(2)} ({gapPercent.toFixed(1)}%)
                </p>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <p className="text-sm text-gray-500">שורות חסרות</p>
                <p className="text-2xl font-bold text-red-600">{summary.missingLines.length} / ₪{summary.missingEstimated.toFixed(2)}</p>
                {!!summary.missingLines.length && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-red-500">פירוט חסרים</summary>
                    {Object.values(missingProducts).map((line) => (
                      <div key={`${line.productName}-${line.selectedOption}`}>{line.count}× {line.productName} — ₪{line.total.toFixed(2)}</div>
                    ))}
                  </details>
                )}
              </div>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-semibold mb-6 text-green-800">הזמנות לפי נקודות איסוף</h2>
            {Object.entries(byPickupSpot).map(([spot, spotOrders]) => (
              <div key={spot} className="mb-8 bg-white p-6 rounded-lg shadow">
                <div className="flex justify-between mb-4">
                  <h3 className="font-semibold">{spot}</h3>
                  <span className="text-sm">{spotOrders.length} הזמנות | ₪{spotOrders.reduce((sum, order) => sum + order.totalPaid, 0).toFixed(2)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y">
                    <thead className="bg-gray-50"><tr>
                      <th className="p-3 text-right">לקוח</th><th className="p-3 text-right">חיובי פריטים מדויקים</th><th className="p-3 text-right">סוג</th><th className="p-3 text-right">שולם</th>
                    </tr></thead>
                    <tbody className="divide-y">
                      {spotOrders.map((order) => (
                        <tr key={order.id} className={order.hasDiscrepancy ? 'bg-red-50' : ''}>
                          <td className="p-3"><strong>{order.customerDetails?.name || 'לא צוין'}</strong><div className="text-xs text-gray-500">{order.customerDetails?.phone || ''}</div></td>
                          <td className="p-3 text-sm">
                            <ul className="list-disc list-inside">
                              {order.lines.map((line, index) => (
                                <li key={line.lineId || `${line.productName}-${index}`}>
                                  {displayQuantity(line)} {line.productName}
                                  {line.selectedOption && !['None', 'ללא אופציות'].includes(line.selectedOption) ? ` (${line.selectedOption})` : ''}
                                  <strong className="text-green-700 mr-1">₪{line.chargedTotal.toFixed(2)}</strong>
                                  {line.isAdditional && <span className="text-purple-600 mr-1">נוסף בשקילה</span>}
                                </li>
                              ))}
                            </ul>
                            {!!order.missingLines.length && <div className="text-xs text-red-600 mt-1">{order.missingLines.length} שורות חסרות (₪{order.missingEstimated.toFixed(2)})</div>}
                          </td>
                          <td className="p-3"><span className={`px-2 py-1 rounded-full text-xs ${order.isDelayed ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>{order.isDelayed ? 'נדחית' : 'רגילה'}</span></td>
                          <td className="p-3">
                            <strong className="text-green-700">₪{order.totalPaid.toFixed(2)}</strong>
                            <div className="text-xs text-gray-500">מוצרים ₪{order.productCharges.toFixed(2)} + משלוח ₪{order.deliveryFee.toFixed(2)}</div>
                            {order.hasDiscrepancy && <div className="text-xs font-bold text-red-600">פער התאמה {order.discrepancy >= 0 ? '+' : ''}₪{order.discrepancy.toFixed(2)}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-semibold mb-4 text-green-800">סיכום לפי עסקים ({Object.keys(businesses).length})</h2>
            <div className="overflow-x-auto bg-white rounded-lg shadow">
              <table className="min-w-full divide-y">
                <thead className="bg-gray-50"><tr><th className="p-3 text-right">עסק</th><th className="p-3 text-right">מוצרים שחויבו</th><th className="p-3 text-right">סה"כ</th></tr></thead>
                <tbody className="divide-y">
                  {Object.entries(businesses).sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue).map(([key, business]) => (
                    <tr key={key}>
                      <td className="p-3 font-medium">{business.businessName}</td>
                      <td className="p-3 text-sm">{Object.values(business.products).map((product) => (
                        <div key={`${product.productName}-${product.selectedOption}`}>{displayQuantity({ ...product, actualQuantity: product.quantity })} {product.productName} — ₪{product.totalRevenue.toFixed(2)}</div>
                      ))}</td>
                      <td className="p-3 font-bold text-green-700">₪{business.totalRevenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="bg-green-50 font-bold"><td colSpan="2" className="p-3">סה"כ כל העסקים</td><td className="p-3 text-green-700">₪{summary.productCharges.toFixed(2)}</td></tr></tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
