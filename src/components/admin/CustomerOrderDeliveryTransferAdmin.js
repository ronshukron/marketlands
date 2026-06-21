import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { pickupSpots } from '../../data/pickupSpots';
import {
  fetchAvailableDeliveryWeekKeys,
  fetchTransferableOrdersByDeliveryWeek,
  lookupTransferableOrder,
  transferCustomerOrderDelivery,
} from '../../services/customerOrderTransferService';
import {
  generateAvailableDeliveryDates,
  getRecentWeekKeys,
  getWeekKey,
  toLocalDateKey,
} from '../../utils/deliveryScheduleUtils';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const formatWeekLabel = (weekKey) => {
  const sunday = new Date(weekKey);
  const friday = new Date(sunday);
  friday.setDate(sunday.getDate() + 5);
  return `${format(sunday, 'dd/MM/yyyy')} – ${format(friday, 'dd/MM/yyyy')}`;
};

const formatDateKeyLabel = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${DAY_NAMES[date.getDay()]} ${format(date, 'dd/MM/yyyy')}`;
};

const getOrderStatusLabel = (order) => {
  if (order.source === 'customerOrdersDelayed') {
    return order.delayedOrderStatus || order.paymentStatus || 'לא ידוע';
  }
  return order.paymentStatus || 'לא ידוע';
};

const CustomerOrderDeliveryTransferAdmin = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [targetDeliveryDates, setTargetDeliveryDates] = useState([]);
  const [draftSourceWeek, setDraftSourceWeek] = useState('');
  const [sourceWeek, setSourceWeek] = useState('');
  const [draftTargetDate, setDraftTargetDate] = useState('');
  const [targetDeliveryDate, setTargetDeliveryDate] = useState('');
  const [draftCommunities, setDraftCommunities] = useState(new Set());
  const [selectedCommunities, setSelectedCommunities] = useState(new Set());
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const [orders, setOrders] = useState([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [lookupOrderId, setLookupOrderId] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [transferring, setTransferring] = useState(false);
  const [transferringOrderId, setTransferringOrderId] = useState('');
  const communityDropdownRef = useRef(null);

  useEffect(() => {
    const handler = (event) => {
      if (communityDropdownRef.current && !communityDropdownRef.current.contains(event.target)) {
        setShowCommunityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
      setError('You are not authorized to view this page');
      setLoading(false);
      return;
    }
    loadInitialData();
  }, [currentUser]);

  const loadInitialData = async () => {
    setLoading(true);
    setError('');
    try {
      const [weeksFromOrders, schedulesSnapshot] = await Promise.all([
        fetchAvailableDeliveryWeekKeys(),
        getDocs(collection(db, 'deliverySchedules')),
      ]);

      const weeksSet = new Set([...getRecentWeekKeys(12), ...weeksFromOrders]);
      const sortedWeeks = Array.from(weeksSet).sort((a, b) => new Date(b) - new Date(a));
      setAvailableWeeks(sortedWeeks);

      const deliveryDates = new Set();
      schedulesSnapshot.docs.forEach((scheduleSnap) => {
        generateAvailableDeliveryDates(scheduleSnap.data(), { includePastCutoff: true })
          .forEach((dateKey) => deliveryDates.add(dateKey));
      });
      weeksFromOrders.forEach((weekKey) => {
        const sunday = new Date(weekKey);
        for (let offset = 0; offset <= 6; offset += 1) {
          const date = new Date(sunday);
          date.setDate(sunday.getDate() + offset);
          deliveryDates.add(toLocalDateKey(date));
        }
      });

      const sortedDates = Array.from(deliveryDates).sort();
      setTargetDeliveryDates(sortedDates);

      const todayKey = toLocalDateKey(new Date());
      const defaultTarget = sortedDates.find((dateKey) => dateKey >= todayKey)
        || sortedDates[sortedDates.length - 1]
        || '';
      setDraftTargetDate(defaultTarget);

      const defaultSource = sortedWeeks.find((weekKey) => weekKey !== getWeekKey(new Date()))
        || sortedWeeks[0]
        || '';
      setDraftSourceWeek(defaultSource);
    } catch (err) {
      console.error('Error loading transfer admin data:', err);
      setError('טעינת הנתונים נכשלה');
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    if (!sourceWeek) return;
    setLoading(true);
    setError('');
    setSuccessMessage('');
    setLookupResult(null);
    try {
      const loaded = await fetchTransferableOrdersByDeliveryWeek(
        sourceWeek,
        { communities: Array.from(selectedCommunities) },
      );
      setOrders(loaded);
      setSelectedOrderIds(new Set());
    } catch (err) {
      console.error('Error loading orders:', err);
      setError('טעינת ההזמנות נכשלה');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    setSourceWeek(draftSourceWeek);
    setTargetDeliveryDate(draftTargetDate);
    setSelectedCommunities(new Set(draftCommunities));
  };

  useEffect(() => {
    if (sourceWeek) {
      loadOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceWeek, selectedCommunities]);

  const handleLookup = async () => {
    const trimmedId = lookupOrderId.trim();
    if (!trimmedId) return;

    setLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      const order = await lookupTransferableOrder(trimmedId);
      if (!order) {
        setLookupResult(null);
        setError('ההזמנה לא נמצאה');
        return;
      }
      setLookupResult(order);
      setOrders([order]);
      setSelectedOrderIds(new Set([order.id]));
      setDraftSourceWeek(order.deliveryWeekKey);
      setSourceWeek(order.deliveryWeekKey);
    } catch (err) {
      setLookupResult(null);
      setError(err.message || 'חיפוש ההזמנה נכשל');
    } finally {
      setLoading(false);
    }
  };

  const toggleOrderSelection = (orderId) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.size === orders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(orders.map((order) => order.id)));
    }
  };

  const toggleCommunity = (community) => {
    setDraftCommunities((prev) => {
      const next = new Set(prev);
      if (next.has(community)) next.delete(community);
      else next.add(community);
      return next;
    });
  };

  const runTransfer = async (ordersToTransfer, newDeliveryDateKey) => {
    if (!newDeliveryDateKey) {
      setError('יש לבחור תאריך משלוח יעד');
      return;
    }
    if (ordersToTransfer.length === 0) {
      setError('לא נבחרו הזמנות');
      return;
    }

    const sameDateOrders = ordersToTransfer.filter((order) => order.deliveryDateKey === newDeliveryDateKey);
    if (sameDateOrders.length === ordersToTransfer.length) {
      setError('תאריך היעד זהה לתאריך המשלוח הנוכחי');
      return;
    }

    const confirmed = window.confirm(
      `להעביר ${ordersToTransfer.length} הזמנות לתאריך ${formatDateKeyLabel(newDeliveryDateKey)}?`,
    );
    if (!confirmed) return;

    setTransferring(true);
    setError('');
    setSuccessMessage('');

    const results = [];
    const failures = [];

    for (const order of ordersToTransfer) {
      if (order.deliveryDateKey === newDeliveryDateKey) continue;
      setTransferringOrderId(order.id);
      try {
        const result = await transferCustomerOrderDelivery({
          orderId: order.id,
          customerOrderSource: order.source,
          newDeliveryDateKey,
          adminUid: currentUser?.uid || null,
        });
        results.push(result);
      } catch (err) {
        failures.push({ orderId: order.id, message: err.message || 'שגיאה' });
      }
    }

    setTransferring(false);
    setTransferringOrderId('');

    if (results.length > 0) {
      setSuccessMessage(`הועברו בהצלחה ${results.length} הזמנות ל-${formatDateKeyLabel(newDeliveryDateKey)}`);
      await loadOrders();
      setSelectedOrderIds(new Set());
    }
    if (failures.length > 0) {
      setError(`נכשלו ${failures.length} הזמנות: ${failures.map((f) => f.orderId).join(', ')}`);
    }
  };

  const handleBatchTransfer = () => {
    const selected = orders.filter((order) => selectedOrderIds.has(order.id));
    runTransfer(selected, targetDeliveryDate || draftTargetDate);
  };

  const targetDatesByWeek = useMemo(() => {
    return targetDeliveryDates.reduce((acc, dateKey) => {
      const weekKey = getWeekKey(dateKey);
      if (!acc[weekKey]) acc[weekKey] = [];
      acc[weekKey].push(dateKey);
      return acc;
    }, {});
  }, [targetDeliveryDates]);

  if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
    return (
      <div className="container mx-auto p-8 text-center" dir="rtl">
        <p className="text-red-600 font-semibold">אין הרשאה לצפות בדף זה</p>
      </div>
    );
  }

  if (loading && orders.length === 0 && !sourceWeek) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl" dir="rtl">
      <div className="mb-6">
        <Link to="/admin" className="text-sm text-blue-600 hover:underline">← חזרה ללוח ניהול</Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-2">העברת הזמנות בין שבועות משלוח</h1>
        <p className="text-gray-600 mt-2">
          העברת הזמנות חנות קבועה (always-on) מתאריך משלוח אחד לאחר — מעדכן את כל שדות המשלוח ב-Firestore.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">{error}</div>
      )}
      {successMessage && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 p-4 rounded-lg">{successMessage}</div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">חיפוש לפי מזהה הזמנה</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={lookupOrderId}
            onChange={(e) => setLookupOrderId(e.target.value)}
            placeholder="הדבק מזהה הזמנה (customerOrders / customerOrdersDelayed)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={handleLookup}
            disabled={transferring}
            className="px-5 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 disabled:opacity-50"
          >
            חפש הזמנה
          </button>
        </div>
        {lookupResult && (
          <p className="text-sm text-gray-600 mt-3">
            נמצאה הזמנה של {lookupResult.customerDetails?.name || 'לקוח'} —
            משלוח נוכחי: {formatDateKeyLabel(lookupResult.deliveryDateKey)}
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">סינון לפי שבוע משלוח מקור</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">שבוע משלוח מקור:</label>
            <select
              value={draftSourceWeek}
              onChange={(e) => setDraftSourceWeek(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {availableWeeks.map((weekKey) => (
                <option key={weekKey} value={weekKey}>
                  {formatWeekLabel(weekKey)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">תאריך משלוח יעד:</label>
            <select
              value={draftTargetDate}
              onChange={(e) => setDraftTargetDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {Object.entries(targetDatesByWeek).map(([weekKey, dates]) => (
                <optgroup key={weekKey} label={`שבוע ${formatWeekLabel(weekKey)}`}>
                  {dates.map((dateKey) => (
                    <option key={dateKey} value={dateKey}>
                      {formatDateKeyLabel(dateKey)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div ref={communityDropdownRef}>
            <label className="block text-gray-700 text-sm font-medium mb-2">קהילות (אופציונלי):</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCommunityDropdown((open) => !open)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {draftCommunities.size === 0 ? 'כל הקהילות' : `${draftCommunities.size} קהילות נבחרו`}
              </button>
              {showCommunityDropdown && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-2 max-h-80 overflow-auto">
                  <div className="flex gap-2 mb-2 pb-2 border-b">
                    <button
                      type="button"
                      onClick={() => setDraftCommunities(new Set(pickupSpots))}
                      className="text-xs px-2 py-1 bg-indigo-500 text-white rounded"
                    >
                      בחר הכל
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftCommunities(new Set())}
                      className="text-xs px-2 py-1 bg-gray-300 text-gray-700 rounded"
                    >
                      נקה הכל
                    </button>
                  </div>
                  {pickupSpots.map((spot) => (
                    <div key={spot} className="flex items-center px-2 py-1 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        id={`transfer-com-${spot}`}
                        checked={draftCommunities.has(spot)}
                        onChange={() => toggleCommunity(spot)}
                        className="ml-2"
                      />
                      <label htmlFor={`transfer-com-${spot}`} className="text-sm cursor-pointer flex-1">
                        {spot}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={handleApplyFilters}
            disabled={transferring}
            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg disabled:opacity-50"
          >
            טען הזמנות
          </button>
          <button
            type="button"
            onClick={handleBatchTransfer}
            disabled={transferring || selectedOrderIds.size === 0}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg disabled:opacity-50"
          >
            {transferring
              ? `מעביר${transferringOrderId ? ` (${transferringOrderId.slice(0, 8)}…)` : '...'}`
              : `העבר ${selectedOrderIds.size} נבחרות ליעד`}
          </button>
        </div>

        {sourceWeek && (
          <p className="text-center text-gray-600 mt-4 text-sm">
            מציג הזמנות עם תאריך משלוח בשבוע {formatWeekLabel(sourceWeek)}
            {selectedCommunities.size > 0 && ` · ${selectedCommunities.size} קהילות`}
            {targetDeliveryDate && ` · יעד: ${formatDateKeyLabel(targetDeliveryDate)}`}
          </p>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg mb-6 text-sm">
        <strong>שימו לב:</strong> השינוי מעדכן תאריך משלוח, שבוע משלוח, fulfillment ו-orderBreakdown.
        דוחות הכנסות לפי תאריך יצירה (createdAt) לא יושפעו.
        הזמנות קלאסיות ללא תאריך משלוח מפורש לא יופיעו כאן.
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : orders.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded text-center">
          לא נמצאו הזמנות עם תאריך משלוח מפורש לשבוע שנבחר
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
            <span className="font-semibold text-gray-800">{orders.length} הזמנות</span>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedOrderIds.size === orders.length && orders.length > 0}
                onChange={toggleSelectAll}
              />
              בחר הכל
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">בחירה</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">לקוח</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">קהילה</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">משלוח נוכחי</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">סטטוס</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">סה״כ</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">פעולה</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr key={`${order.source}-${order.id}`} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.has(order.id)}
                        onChange={() => toggleOrderSelection(order.id)}
                      />
                    </td>
                    <td className="px-4 py-4 min-w-[200px]">
                      <div className="text-sm font-semibold text-gray-900">
                        {order.customerDetails?.name || 'לא צוין'}
                      </div>
                      <div className="text-xs text-gray-500">{order.customerDetails?.phone || ''}</div>
                      <div className="text-xs text-gray-400 mt-1">{order.id}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">{order.community}</td>
                    <td className="px-4 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {formatDateKeyLabel(order.deliveryDateKey)}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {getOrderStatusLabel(order)}
                      <div className="text-xs text-gray-400 mt-1">
                        {order.source === 'customerOrdersDelayed' ? 'דחוי' : 'רגיל'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold whitespace-nowrap">
                      ₪{(Number(order.grandTotal) || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => runTransfer([order], targetDeliveryDate || draftTargetDate)}
                        disabled={transferring || order.deliveryDateKey === (targetDeliveryDate || draftTargetDate)}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        העבר ליעד
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerOrderDeliveryTransferAdmin;
