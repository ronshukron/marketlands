// src/components/admin/WeeklyOrderSummaryV4.js
// Financial summary — shows actual amounts paid by customers and revenue received.
// No PDF/printing, no order copy, no cost calculator.
import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { format } from 'date-fns';
import { pickupSpots } from '../../data/pickupSpots';
import { getEstimatedLineTotal } from '../../utils/pricing';

const WeeklyOrderSummaryV4 = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [businessSummary, setBusinessSummary] = useState({});
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [ordersByPickupSpot, setOrdersByPickupSpot] = useState({});

  // Week selection
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');

  // Community selection
  const [selectedCommunities, setSelectedCommunities] = useState(new Set());
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);

  // Temporary filter states (before submit)
  const [tempSelectedWeek, setTempSelectedWeek] = useState('');
  const [tempSelectedCommunities, setTempSelectedCommunities] = useState(new Set());

  const communityDropdownRef = useRef(null);

  // Admin UIDs
  const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (communityDropdownRef.current && !communityDropdownRef.current.contains(e.target)) {
        setShowCommunityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
      setError("You are not authorized to view this page");
      setLoading(false);
      return;
    }
    fetchAvailableWeeks();
  }, [currentUser]);

  useEffect(() => {
    if (selectedWeek) fetchWeeklyOrders();
  }, [selectedWeek, selectedCommunities]);

  // ─── Fetch available weeks ───────────────────────────────────────────
  const fetchAvailableWeeks = async () => {
    setLoading(true);
    try {
      const ordersRef = collection(db, 'Orders');
      const delayedOrdersRef = collection(db, 'customerOrdersDelayed');
      const [ordersSnap, delayedSnap] = await Promise.all([
        getDocs(ordersRef),
        getDocs(delayedOrdersRef)
      ]);

      const weeksSet = new Set();

      ordersSnap.docs.forEach(d => {
        const data = d.data();
        const endingTime = data.Ending_Time || data.endingTime;
        if (endingTime) {
          const endDate = endingTime.toDate ? endingTime.toDate() : new Date(endingTime);
          const sun = new Date(endDate);
          sun.setDate(endDate.getDate() - endDate.getDay());
          sun.setHours(0, 0, 0, 0);
          weeksSet.add(sun.toISOString().split('T')[0]);
        }
      });

      delayedSnap.docs.forEach(d => {
        const data = d.data();
        const createdAt = data.createdAt;
        let dt;
        if (typeof createdAt === 'string') dt = new Date(createdAt);
        else if (createdAt?.toDate) dt = createdAt.toDate();
        else return;
        const sun = new Date(dt);
        sun.setDate(dt.getDate() - dt.getDay());
        sun.setHours(0, 0, 0, 0);
        weeksSet.add(sun.toISOString().split('T')[0]);
      });

      const sorted = Array.from(weeksSet).sort((a, b) => new Date(b) - new Date(a));
      setAvailableWeeks(sorted);
      if (sorted.length > 0) setTempSelectedWeek(sorted[0]);
    } catch (err) {
      console.error("Error fetching available weeks:", err);
      setError("Failed to load weeks data");
    } finally {
      setLoading(false);
    }
  };

  // ─── Actual amount paid helper ───────────────────────────────────────
  const getAmountPaid = (orderData) => {
    // Delayed settled orders: use finalSum from weighing data
    if (orderData.weighing?.finalSum != null) return Number(orderData.weighing.finalSum);
    if (orderData.finalSum != null) return Number(orderData.finalSum);
    // Fallback to grandTotal (exact for regular orders)
    return Number(orderData.grandTotal) || 0;
  };

  // ─── Fetch weekly orders (PAID only) ─────────────────────────────────
  const fetchWeeklyOrders = async () => {
    setLoading(true);
    try {
      const sunday = new Date(selectedWeek);
      const friday = new Date(sunday);
      friday.setDate(sunday.getDate() + 5);
      friday.setHours(23, 59, 59, 999);

      setDateRange({
        start: format(sunday, 'dd/MM/yyyy'),
        end: format(friday, 'dd/MM/yyyy')
      });

      const startISO = sunday.toISOString();
      const endISO = friday.toISOString();

      const [ordersSnap, delayedSnap] = await Promise.all([
        getDocs(collection(db, 'customerOrders')),
        getDocs(collection(db, 'customerOrdersDelayed'))
      ]);

      const filtered = [];
      const bizMap = {};
      const spotMap = {};

      const allDocs = [
        ...ordersSnap.docs.map(d => ({ doc: d, source: 'customerOrders' })),
        ...delayedSnap.docs.map(d => ({ doc: d, source: 'customerOrdersDelayed' }))
      ];

      allDocs.forEach(({ doc, source }) => {
        const data = doc.data();
        const isDelayed = source === 'customerOrdersDelayed';

        // ═══ V4 FILTERING: Only ACTUALLY PAID orders ═══
        if (!isDelayed) {
          // Regular orders: must have completed payment
          if (data.paymentStatus !== 'completed') return;
        } else {
          // Delayed orders: must be settled / charged / completed
          const ds = data.delayedOrderStatus || '';
          const ps = data.paymentStatus || '';
          const isPaid = ['settled', 'completed', 'charged'].includes(ds)
            || ['charged', 'completed', 'settled'].includes(ps);
          if (!isPaid) return;
        }

        // Date filter
        const ca = data.createdAt;
        let dt;
        if (typeof ca === 'string') dt = new Date(ca);
        else if (ca?.toDate) dt = ca.toDate();
        else return;

        const dtISO = dt.toISOString();
        if (dtISO < startISO || dtISO > endISO) return;

        // Community filter
        const spot = data.customerDetails?.pickupSpot || 'לא צוין';
        if (selectedCommunities.size > 0 && !selectedCommunities.has(spot)) return;

        // Compute actual paid amount
        const amountPaid = getAmountPaid(data);
        const deliveryFee = Number(data.customerDetails?.deliveryDetails?.deliveryFee) || 0;

        const order = {
          id: doc.id,
          ...data,
          createdDate: dt,
          amountPaid,
          deliveryFee,
          isDelayed
        };

        filtered.push(order);

        // Group by pickup spot
        if (!spotMap[spot]) spotMap[spot] = [];
        spotMap[spot].push(order);

        // ─── Business product aggregation (with weighing data when available) ───
        if (data.orderBreakdown) {
          // Build a lookup from finalInvoiceLines so we can use actual weights
          const weighLookup = {};
          if (isDelayed && data.weighing?.finalInvoiceLines) {
            data.weighing.finalInvoiceLines.forEach(line => {
              const parts = (line.lineId || '').split('::');
              const pId = parts[1] || line.productId || '';
              const opt = parts[2] || '';
              const key = `${pId}_${opt}`;
              if (!weighLookup[key]) weighLookup[key] = [];
              weighLookup[key].push(line);
            });
          }

          Object.values(data.orderBreakdown).forEach(bo => {
            const bid = bo.businessId;
            const bname = bo.businessName;

            if (!bizMap[bid]) {
              bizMap[bid] = { businessName: bname, products: {}, totalRevenue: 0 };
            }

            (bo.items || []).forEach(item => {
              let qty = item.quantity;
              let totalPrice = item.estimatedLineTotal != null
                ? Number(item.estimatedLineTotal)
                : getEstimatedLineTotal(item);

              // Use actual weighing data if available
              const lk = `${item.productId}_${item.selectedOption || ''}`;
              const wls = weighLookup[lk];
              if (wls && wls.length > 0) {
                const wl = wls.shift();
                qty = wl.actualQuantity;
                totalPrice = wl.linePrice;
              }

              const pk = `${item.productId}_${item.selectedOption}`;
              if (!bizMap[bid].products[pk]) {
                bizMap[bid].products[pk] = {
                  productName: item.productName,
                  selectedOption: item.selectedOption,
                  quantity: 0,
                  totalRevenue: 0,
                  unitSize: item.unitSize || 1,
                  measurementType: item.measurementType || 'kg'
                };
              }

              bizMap[bid].products[pk].quantity += qty;
              bizMap[bid].products[pk].totalRevenue += totalPrice;
              bizMap[bid].totalRevenue += totalPrice;
            });
          });
        }
      });

      filtered.sort((a, b) => b.createdDate - a.createdDate);
      Object.keys(spotMap).forEach(s => spotMap[s].sort((a, b) => b.createdDate - a.createdDate));

      setCustomerOrders(filtered);
      setBusinessSummary(bizMap);
      setOrdersByPickupSpot(spotMap);
    } catch (err) {
      console.error("Error fetching weekly orders:", err);
      setError("Failed to load order data");
    } finally {
      setLoading(false);
    }
  };

  // ─── Filter helpers ──────────────────────────────────────────────────
  const toggleCommunity = (community) => {
    setTempSelectedCommunities(prev => {
      const s = new Set(prev);
      s.has(community) ? s.delete(community) : s.add(community);
      return s;
    });
  };

  const handleSubmitFilters = () => {
    setSelectedWeek(tempSelectedWeek);
    setSelectedCommunities(tempSelectedCommunities);
  };

  const getOrderAnalysis = (order) => {
    const empty = { estimatedFulfilled: 0, actual: 0, missingEstimated: 0, missingItems: [] };
    if (!order.orderBreakdown) return empty;

    if (!order.isDelayed || !order.weighing?.finalInvoiceLines) {
      let est = 0;
      Object.values(order.orderBreakdown).forEach((bo) => {
        (bo.items || []).forEach((item) => {
          est += item.estimatedLineTotal != null
            ? Number(item.estimatedLineTotal)
            : getEstimatedLineTotal(item);
        });
      });
      return { estimatedFulfilled: est, actual: est, missingEstimated: 0, missingItems: [] };
    }

    const weighLookup = {};
    order.weighing.finalInvoiceLines.forEach((line) => {
      const parts = (line.lineId || '').split('::');
      const pId = parts[1] || line.productId || '';
      const opt = parts[2] || '';
      const key = `${pId}_${opt}`;
      if (!weighLookup[key]) weighLookup[key] = [];
      weighLookup[key].push(line);
    });

    let estimatedFulfilled = 0;
    let actual = 0;
    let missingEstimated = 0;
    const missingItems = [];

    Object.values(order.orderBreakdown).forEach((bo) => {
      (bo.items || []).forEach((item) => {
        const key = `${item.productId}_${item.selectedOption || ''}`;
        const wls = weighLookup[key];
        const itemEst = item.estimatedLineTotal != null
          ? Number(item.estimatedLineTotal)
          : getEstimatedLineTotal(item);

        if (wls && wls.length > 0) {
          const wl = wls.shift();
          estimatedFulfilled += itemEst;
          actual += Number(wl.linePrice) || 0;
        } else {
          missingEstimated += itemEst;
          missingItems.push({
            productName: item.productName,
            selectedOption: item.selectedOption,
            quantity: item.quantity,
            estimated: itemEst,
          });
        }
      });
    });

    return { estimatedFulfilled, actual, missingEstimated, missingItems };
  };

  // ─── Computed totals ─────────────────────────────────────────────────
  const totalPaid = customerOrders.reduce((s, o) => s + o.amountPaid, 0);
  const totalDeliveryFees = customerOrders.reduce((s, o) => s + o.deliveryFee, 0);
  const totalProductRevenue = Object.values(businessSummary).reduce((s, b) => s + b.totalRevenue, 0);
  const analysisTotals = customerOrders.reduce(
    (acc, o) => {
      const r = getOrderAnalysis(o);
      return {
        estimatedFulfilled: acc.estimatedFulfilled + r.estimatedFulfilled,
        actual: acc.actual + r.actual,
        missingEstimated: acc.missingEstimated + r.missingEstimated,
        missingItems: [...acc.missingItems, ...r.missingItems],
      };
    },
    { estimatedFulfilled: 0, actual: 0, missingEstimated: 0, missingItems: [] }
  );
  const weighingGap = analysisTotals.actual - analysisTotals.estimatedFulfilled;
  const weighingGapPct = analysisTotals.estimatedFulfilled > 0
    ? (weighingGap / analysisTotals.estimatedFulfilled) * 100
    : 0;

  const missingAggregated = {};
  analysisTotals.missingItems.forEach((m) => {
    const key = `${m.productName}_${m.selectedOption || ''}`;
    if (!missingAggregated[key]) {
      missingAggregated[key] = { ...m, count: 0, totalEstimated: 0 };
    }
    missingAggregated[key].count += m.quantity;
    missingAggregated[key].totalEstimated += m.estimated;
  });

  // ─── Render ──────────────────────────────────────────────────────────
  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <h1 className="text-3xl font-bold text-center mb-8">סיכום הכנסות שבועי</h1>

      {/* ── Week & Community Selection ────────────────────────────────── */}
      <div className="mb-6 bg-white p-6 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Week */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">בחר שבוע:</label>
            <select
              value={tempSelectedWeek}
              onChange={(e) => setTempSelectedWeek(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {availableWeeks.map(week => {
                const sun = new Date(week);
                const fri = new Date(sun);
                fri.setDate(sun.getDate() + 5);
                return (
                  <option key={week} value={week}>
                    {format(sun, 'dd/MM/yyyy')} - {format(fri, 'dd/MM/yyyy')}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Community */}
          <div ref={communityDropdownRef}>
            <label className="block text-gray-700 text-sm font-medium mb-2">בחר קהילות:</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCommunityDropdown(o => !o)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-right focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              >
                {tempSelectedCommunities.size === 0
                  ? 'כל הקהילות'
                  : `${tempSelectedCommunities.size} קהילות נבחרו`}
              </button>
              {showCommunityDropdown && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-2 max-h-80 overflow-auto">
                  <div className="flex gap-2 mb-2 pb-2 border-b">
                    <button
                      onClick={() => setTempSelectedCommunities(new Set(pickupSpots))}
                      className="text-xs px-2 py-1 bg-green-500 text-white rounded"
                    >
                      בחר הכל
                    </button>
                    <button
                      onClick={() => setTempSelectedCommunities(new Set())}
                      className="text-xs px-2 py-1 bg-gray-300 text-gray-700 rounded"
                    >
                      נקה הכל
                    </button>
                  </div>
                  {pickupSpots.map(spot => (
                    <div key={spot} className="flex items-center px-2 py-1 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        id={`v4-com-${spot}`}
                        checked={tempSelectedCommunities.has(spot)}
                        onChange={() => toggleCommunity(spot)}
                        className="ml-2"
                      />
                      <label htmlFor={`v4-com-${spot}`} className="text-sm cursor-pointer flex-1">{spot}</label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="mt-6 text-center">
          <button
            onClick={handleSubmitFilters}
            className="px-8 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            טען נתונים
          </button>
        </div>

        {selectedWeek && (
          <p className="text-center text-gray-600 mt-4">
            מציג הזמנות ששולמו מ-{dateRange.start} עד {dateRange.end}
            {selectedCommunities.size > 0 && ` עבור ${selectedCommunities.size} קהילות`}
          </p>
        )}
      </div>

      {/* ── No results ───────────────────────────────────────────────── */}
      {customerOrders.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded text-center">
          לא נמצאו הזמנות ששולמו עבור השבוע והקהילות שנבחרו
        </div>
      ) : (
        <>
          {/* ── Financial Summary Cards ───────────────────────────────── */}
          <div className="mb-8 bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4 text-green-800">סיכום כספי</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-lg shadow">
                <p className="text-gray-500 text-sm">סה"כ הזמנות</p>
                <p className="text-2xl font-bold text-gray-800">{customerOrders.length}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow border-r-4 border-green-500">
                <p className="text-gray-500 text-sm">סה"כ שולם (מה שקיבלתי)</p>
                <p className="text-2xl font-bold text-green-700">₪{totalPaid.toFixed(2)}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <p className="text-gray-500 text-sm">הכנסות מוצרים</p>
                <p className="text-2xl font-bold text-blue-700">₪{totalProductRevenue.toFixed(2)}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <p className="text-gray-500 text-sm">דמי משלוח</p>
                <p className="text-2xl font-bold text-gray-700">₪{totalDeliveryFees.toFixed(2)}</p>
              </div>
            </div>

            {/* ── Weighing analysis row ──────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="bg-white p-4 rounded-lg shadow border-r-4 border-blue-500">
                <p className="text-gray-500 text-sm">הכנסות צפויות (ללא חסרים)</p>
                <p className="text-2xl font-bold text-blue-700">₪{analysisTotals.estimatedFulfilled.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">סה"כ הערכה עבור פריטים שנמכרו בפועל</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow border-r-4 border-amber-500">
                <p className="text-gray-500 text-sm">שקילה מול הערכה</p>
                <p className="text-xs text-gray-500">
                  הערכה: ₪{analysisTotals.estimatedFulfilled.toFixed(2)} → בפועל: ₪{analysisTotals.actual.toFixed(2)}
                </p>
                <p className={`text-2xl font-bold ${weighingGap >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {weighingGap >= 0 ? '+' : '-'}₪{Math.abs(weighingGap).toFixed(2)} ({weighingGap >= 0 ? '+' : ''}{weighingGapPct.toFixed(1)}%)
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {weighingGap >= 0 ? 'קיבלתי יותר מהצפוי' : 'קיבלתי פחות מהצפוי'}
                </p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow border-r-4 border-red-400">
                <p className="text-gray-500 text-sm">פריטים חסרים</p>
                <p className="text-2xl font-bold text-red-600">₪{analysisTotals.missingEstimated.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {analysisTotals.missingItems.length} פריטים לא סופקו
                </p>
                {Object.keys(missingAggregated).length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-red-500 cursor-pointer hover:underline">
                      הצג פריטים חסרים
                    </summary>
                    <ul className="mt-1 text-xs text-gray-600 max-h-40 overflow-auto">
                      {Object.values(missingAggregated)
                        .sort((a, b) => b.totalEstimated - a.totalEstimated)
                        .map((m, i) => (
                          <li key={i} className="py-0.5 border-b border-gray-100">
                            {m.count}× {m.productName}
                            {m.selectedOption && m.selectedOption !== 'ללא אופציות' && m.selectedOption !== 'None' && (
                              <span className="text-gray-400"> ({m.selectedOption})</span>
                            )}
                            <span className="text-red-500 font-medium mr-1">₪{m.totalEstimated.toFixed(2)}</span>
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>

            {/* Mini breakdown */}
            <div className="mt-4 p-3 bg-white rounded-lg border border-green-200">
              <div className="flex flex-wrap gap-6 text-sm text-gray-600">
                <span>הזמנות רגילות: <strong>{customerOrders.filter(o => !o.isDelayed).length}</strong></span>
                <span>הזמנות נדחות (שולמו): <strong>{customerOrders.filter(o => o.isDelayed).length}</strong></span>
                <span>מספר עסקים: <strong>{Object.keys(businessSummary).length}</strong></span>
              </div>
            </div>
          </div>

          {/* ── Per Pickup Spot ───────────────────────────────────────── */}
          <div className="mt-10">
            <h2 className="text-xl font-semibold mb-6 text-green-800">הזמנות לפי נקודות איסוף</h2>

            {Object.entries(ordersByPickupSpot).map(([spot, orders]) => {
              const spotTotal = orders.reduce((s, o) => s + o.amountPaid, 0);
              return (
                <div key={spot} className="mb-8 bg-white p-6 rounded-lg shadow">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">{spot}</h3>
                    <div className="text-sm text-gray-500">
                      {orders.length} הזמנות&ensp;|&ensp;
                      סה"כ: <span className="font-bold text-green-700">₪{spotTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">לקוח</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">פריטים</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">סוג</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">שולם</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {orders.map((order, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            {/* Customer */}
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900">
                                {order.customerDetails?.name || 'לא צוין'}
                              </div>
                              <div className="text-xs text-gray-500">
                                {order.customerDetails?.phone || ''}
                              </div>
                            </td>

                            {/* Items */}
                            <td className="px-4 py-3">
                              <div className="text-sm text-gray-700">
                                {order.orderBreakdown ? (() => {
                                  // Build weighing lookup for delayed orders
                                  const wLookup = {};
                                  if (order.isDelayed && order.weighing?.finalInvoiceLines) {
                                    order.weighing.finalInvoiceLines.forEach(line => {
                                      const parts = (line.lineId || '').split('::');
                                      const pId = parts[1] || line.productId || '';
                                      const opt = parts[2] || '';
                                      const key = `${pId}_${opt}`;
                                      if (!wLookup[key]) wLookup[key] = [];
                                      wLookup[key].push(line);
                                    });
                                  }
                                  return (
                                    <ul className="list-disc list-inside">
                                      {Object.values(order.orderBreakdown).flatMap((bo, bi) =>
                                        (bo.items || []).map((item, ii) => {
                                          // Determine per-item paid amount
                                          const lk = `${item.productId}_${item.selectedOption || ''}`;
                                          const wls = wLookup[lk];
                                          let itemPaid;
                                          if (wls && wls.length > 0) {
                                            itemPaid = Number(wls.shift().linePrice) || 0;
                                          } else {
                                            itemPaid = item.estimatedLineTotal != null
                                              ? Number(item.estimatedLineTotal)
                                              : getEstimatedLineTotal(item);
                                          }
                                          return (
                                            <li key={`${bi}-${ii}`} className="mb-0.5">
                                              <span className="font-medium">{item.quantity}× {item.productName}</span>
                                              {item.selectedOption
                                                && item.selectedOption !== 'ללא אופציות'
                                                && item.selectedOption !== 'None' && (
                                                  <span className="text-gray-400"> ({item.selectedOption})</span>
                                                )}
                                              <span className="text-green-700 font-semibold mr-1">₪{itemPaid.toFixed(2)}</span>
                                            </li>
                                          );
                                        })
                                      )}
                                    </ul>
                                  );
                                })() : '-'}
                              </div>
                            </td>

                            {/* Order type badge */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                order.isDelayed
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-green-100 text-green-700'
                              }`}>
                                {order.isDelayed ? 'נדחית' : 'רגילה'}
                              </span>
                            </td>

                            {/* Amount paid */}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm font-bold text-green-700">
                                ₪{order.amountPaid.toFixed(2)}
                              </div>
                              {/* Show original total crossed out if it differs (weighing adjustment) */}
                              {order.isDelayed
                                && order.grandTotal
                                && Math.abs(order.amountPaid - Number(order.grandTotal)) > 0.5 && (
                                  <div className="text-xs text-gray-400 line-through">
                                    ₪{Number(order.grandTotal).toFixed(2)}
                                  </div>
                                )}
                              {order.deliveryFee > 0 && (
                                <div className="text-xs text-gray-400">
                                  כולל משלוח ₪{order.deliveryFee.toFixed(0)}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-green-50 font-bold">
                          <td colSpan="3" className="px-4 py-3 text-sm text-gray-800">
                            סה"כ {spot}
                          </td>
                          <td className="px-4 py-3 text-sm text-green-700">
                            ₪{spotTotal.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Business Summary ──────────────────────────────────────── */}
          <div className="mt-10">
            <h2 className="text-2xl font-semibold mb-4 text-green-800">
              סיכום לפי עסקים ({Object.keys(businessSummary).length})
            </h2>

            <div className="overflow-x-auto bg-white rounded-lg shadow">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">עסק</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">מוצרים</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">סה"כ הכנסה</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(businessSummary)
                    .sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue)
                    .map(([bid, biz]) => (
                      <tr key={bid} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {biz.businessName || 'עסק לא ידוע'}
                          </div>
                          <div className="text-xs text-gray-400">{bid}</div>
                        </td>
                        <td className="px-6 py-4">
                          <ul className="list-disc list-inside text-sm text-gray-700">
                            {Object.values(biz.products)
                              .sort((a, b) => b.totalRevenue - a.totalRevenue)
                              .map((p, i) => {
                                const isUnit = p.measurementType === 'package' || p.measurementType === 'unit';
                                const displayQty = isUnit
                                  ? `${Math.round(p.quantity)} יח'`
                                  : `${p.quantity.toFixed(1)} ק"ג`;
                                return (
                                  <li key={i} className="mb-1">
                                    <span className="font-medium">{p.productName}</span>
                                    {p.selectedOption
                                      && p.selectedOption !== 'ללא אופציות'
                                      && p.selectedOption !== 'None' && (
                                        <span className="text-gray-400"> ({p.selectedOption})</span>
                                      )}
                                    <span> – {displayQty} – ₪{p.totalRevenue.toFixed(2)}</span>
                                  </li>
                                );
                              })}
                          </ul>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-700">
                          ₪{biz.totalRevenue.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="bg-green-50 font-bold">
                    <td colSpan="2" className="px-6 py-3 text-sm text-gray-800">סה"כ כל העסקים</td>
                    <td className="px-6 py-3 text-sm text-green-700">₪{totalProductRevenue.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WeeklyOrderSummaryV4;
