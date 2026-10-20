import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { format, parseISO } from 'date-fns';
import { pickupSpots } from '../../data/pickupSpots';
import { buildRecentWeekKeys, fetchDocsByCreatedAtRange } from '../../utils/customerOrderDateQueries';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2', 'Q0bohhVCdmeMhgBbDknvLxbEzW53'];

const SUCCESSFUL_DELAYED_STATUSES = ['pending_weighing', 'settled', 'completed', 'charged'];

const parseCreatedAt = (ca) => {
  if (typeof ca === 'string') {
    const dt = new Date(ca);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (ca?.toDate) return ca.toDate();
  return null;
};

const resolveDateRange = (week, specificStart, specificEnd) => {
  if (specificStart || specificEnd) {
    const parsedStart = parseISO(specificStart || specificEnd);
    const parsedEnd = parseISO(specificEnd || specificStart);
    const [from, to] = parsedStart <= parsedEnd ? [parsedStart, parsedEnd] : [parsedEnd, parsedStart];
    const startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
  }
  const startDate = parseISO(week);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 5);
  endDate.setHours(23, 59, 59, 999);
  return { startDate, endDate };
};

const getStatusLabel = (order) => {
  if (order.source === 'regular') {
    if (order.paymentStatus === 'pending') return 'ממתין לתשלום';
    return order.paymentStatus || 'לא ידוע';
  }
  const ds = order.delayedOrderStatus || '';
  const ps = order.paymentStatus || '';
  if (ds === 'abandoned' || ps === 'abandoned') return 'ננטש';
  if (ds === 'created_in_fe' && ps === 'pending_payment') return 'נוצר - לא שולם';
  if (
    ps === 'pending_payment'
    || ps === 'awaiting_customer_authorization'
    || ds === 'awaiting_customer_authorization'
  ) return 'ממתין לאישור תשלום';
  return `${ds || '?'} / ${ps || '?'}`;
};

const getStatusColor = (order) => {
  if (order.source === 'regular') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  const ds = order.delayedOrderStatus || '';
  const ps = order.paymentStatus || '';
  if (ds === 'abandoned' || ps === 'abandoned') return 'bg-red-100 text-red-800 border-red-300';
  if (ds === 'created_in_fe') return 'bg-orange-100 text-orange-800 border-orange-300';
  return 'bg-gray-100 text-gray-800 border-gray-300';
};

const formatPhone = (phone) => {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('0')) cleaned = '972' + cleaned.slice(1);
  else if (!cleaned.startsWith('972') && !cleaned.startsWith('+972')) cleaned = '972' + cleaned;
  return cleaned.replace('+', '');
};

const AbandonedCarts = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);

  const availableWeeks = useMemo(() => buildRecentWeekKeys(), []);
  const [selectedWeek, setSelectedWeek] = useState(availableWeeks[0]);
  const [tempSelectedWeek, setTempSelectedWeek] = useState(availableWeeks[0]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedSpecificStartDate, setSelectedSpecificStartDate] = useState('');
  const [selectedSpecificEndDate, setSelectedSpecificEndDate] = useState('');

  const [selectedCommunities, setSelectedCommunities] = useState(new Set());
  const [tempSelectedCommunities, setTempSelectedCommunities] = useState(new Set());
  const [tempSpecificStartDate, setTempSpecificStartDate] = useState('');
  const [tempSpecificEndDate, setTempSpecificEndDate] = useState('');
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);

  const [expandedOrders, setExpandedOrders] = useState(new Set());

  const communityDropdownRef = useRef(null);
  const latestRequestRef = useRef(0);

  const isAuthorized = Boolean(currentUser && ADMIN_UIDS.includes(currentUser.uid));

  useEffect(() => {
    const handler = (e) => {
      if (communityDropdownRef.current && !communityDropdownRef.current.contains(e.target)) {
        setShowCommunityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchAbandonedOrders = useCallback(async (week, specificStart, specificEnd, communities) => {
    const requestId = ++latestRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = resolveDateRange(week, specificStart, specificEnd);

      setDateRange({
        start: format(startDate, 'dd/MM/yyyy'),
        end: format(endDate, 'dd/MM/yyyy')
      });

      const [regularDocs, delayedDocs] = await Promise.all([
        fetchDocsByCreatedAtRange('customerOrders', startDate, endDate),
        fetchDocsByCreatedAtRange('customerOrdersDelayed', startDate, endDate)
      ]);

      if (requestId !== latestRequestRef.current) return;

      const inRange = (dt) => dt && dt >= startDate && dt <= endDate;

      // Normalized phones of customers who completed an order in the same range
      const successfulPhones = new Set();
      const abandoned = [];

      const collect = (docs, source, isSuccessful) => {
        docs.forEach((d) => {
          const data = d.data();
          const dt = parseCreatedAt(data.createdAt);
          if (!inRange(dt)) return;

          const ph = formatPhone(data.customerDetails?.phone);
          if (isSuccessful(data)) {
            if (ph) successfulPhones.add(ph);
            return;
          }

          const spot = data.customerDetails?.pickupSpot || 'לא צוין';
          if (communities.size > 0 && !communities.has(spot)) return;

          abandoned.push({ id: d.id, ...data, createdDate: dt, source, phoneKey: ph });
        });
      };

      collect(delayedDocs, 'delayed', (data) =>
        SUCCESSFUL_DELAYED_STATUSES.includes(data.delayedOrderStatus || '')
      );
      collect(regularDocs, 'regular', (data) => data.paymentStatus === 'completed');

      const result = abandoned
        .map(({ phoneKey, ...order }) => ({
          ...order,
          hasCompletedOrder: phoneKey ? successfulPhones.has(phoneKey) : false
        }))
        .sort((a, b) => b.createdDate - a.createdDate);

      setOrders(result);
    } catch (err) {
      if (requestId !== latestRequestRef.current) return;
      console.error('Error fetching abandoned orders:', err);
      setError('Failed to load orders');
    } finally {
      if (requestId === latestRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (!selectedWeek && !selectedSpecificStartDate && !selectedSpecificEndDate) return;
    fetchAbandonedOrders(selectedWeek, selectedSpecificStartDate, selectedSpecificEndDate, selectedCommunities);
  }, [
    authLoading,
    isAuthorized,
    selectedWeek,
    selectedCommunities,
    selectedSpecificStartDate,
    selectedSpecificEndDate,
    fetchAbandonedOrders
  ]);

  // ─── Filter helpers ─────────────────────────────────────────────────
  const toggleCommunity = (community) => {
    setTempSelectedCommunities((prev) => {
      const s = new Set(prev);
      s.has(community) ? s.delete(community) : s.add(community);
      return s;
    });
  };

  const handleSubmitFilters = () => {
    const hasSpecificDates = Boolean(tempSpecificStartDate || tempSpecificEndDate);
    setSelectedWeek(hasSpecificDates ? '' : tempSelectedWeek);
    setSelectedSpecificStartDate(tempSpecificStartDate);
    setSelectedSpecificEndDate(tempSpecificEndDate);
    setSelectedCommunities(tempSelectedCommunities);
  };

  const toggleExpand = (id) => {
    setExpandedOrders((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  // ─── Group by pickup spot ──────────────────────────────────────────
  const groupedOrders = useMemo(() => orders.reduce((acc, order) => {
    const spot = order.customerDetails?.pickupSpot || 'לא צוין';
    if (!acc[spot]) acc[spot] = [];
    acc[spot].push(order);
    return acc;
  }, {}), [orders]);

  // ─── Stats ──────────────────────────────────────────────────────────
  const totalAbandoned = orders.length;
  const delayedCount = orders.filter((o) => o.source === 'delayed').length;
  const regularCount = orders.filter((o) => o.source === 'regular').length;
  const totalLostRevenue = orders.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);
  const abandonedCount = orders.filter(
    (o) => o.delayedOrderStatus === 'abandoned' || o.paymentStatus === 'abandoned'
  ).length;
  const createdNotPaidCount = orders.filter(
    (o) => o.source === 'delayed' && o.delayedOrderStatus === 'created_in_fe'
  ).length;

  // ─── Render ─────────────────────────────────────────────────────────
  if (authLoading) return <LoadingSpinner />;

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="font-bold">שגיאה</p>
          <p>You are not authorized to view this page</p>
        </div>
      </div>
    );
  }

  const hasActiveFilter = Boolean(selectedWeek || selectedSpecificStartDate || selectedSpecificEndDate);
  const showResults = hasActiveFilter && !loading && !error;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8" dir="rtl">
      <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center">עגלות נטושות</h1>
      <p className="text-gray-500 text-center mb-8">הזמנות שלא הושלמו (רגילות + נדחות)</p>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Week */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">בחר שבוע:</label>
            <select
              value={tempSelectedWeek}
              onChange={(e) => setTempSelectedWeek(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              {availableWeeks.map((week) => {
                const sun = parseISO(week);
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
                onClick={() => setShowCommunityDropdown((o) => !o)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-right focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
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
                      className="text-xs px-2 py-1 bg-red-500 text-white rounded"
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
                  {pickupSpots.map((spot) => (
                    <div key={spot} className="flex items-center px-2 py-1 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        id={`ab-com-${spot}`}
                        checked={tempSelectedCommunities.has(spot)}
                        onChange={() => toggleCommunity(spot)}
                        className="ml-2"
                      />
                      <label htmlFor={`ab-com-${spot}`} className="text-sm cursor-pointer flex-1">
                        {spot}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 border-t pt-6">
          <p className="text-gray-700 text-sm font-medium mb-3">או בחר תאריכים ספציפיים:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 text-sm mb-2">מתאריך:</label>
              <input
                type="date"
                value={tempSpecificStartDate}
                onChange={(e) => setTempSpecificStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm mb-2">עד תאריך:</label>
              <input
                type="date"
                value={tempSpecificEndDate}
                onChange={(e) => setTempSpecificEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              אם נבחר לפחות תאריך אחד, הסינון יהיה לפי תאריכים ספציפיים (במקום שבוע).
            </p>
            <button
              type="button"
              onClick={() => {
                setTempSpecificStartDate('');
                setTempSpecificEndDate('');
              }}
              className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              נקה תאריכים
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={handleSubmitFilters}
            disabled={loading}
            className="px-8 py-3 disabled:opacity-60 disabled:cursor-wait bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            טען נתונים
          </button>
        </div>

        {selectedWeek && (
          <p className="text-center text-gray-600 mt-4">
            מציג הזמנות מ-{dateRange.start} עד {dateRange.end}
            {selectedCommunities.size > 0 && ` עבור ${selectedCommunities.size} קהילות`}
          </p>
        )}
        {!selectedWeek && (selectedSpecificStartDate || selectedSpecificEndDate) && (
          <p className="text-center text-gray-600 mt-4">
            מציג הזמנות בתאריכים {dateRange.start} - {dateRange.end}
            {selectedCommunities.size > 0 && ` עבור ${selectedCommunities.size} קהילות`}
          </p>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-red-200 border-t-red-600" />
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-8 text-center">
          <p className="font-bold">שגיאה</p>
          <p>{error}</p>
        </div>
      )}

      {/* ── Summary Stats ───────────────────────────────────────────── */}
      {showResults && (
        <div className="mb-8 bg-gradient-to-r from-red-50 to-orange-50 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4 text-red-800">סיכום עגלות נטושות</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-gray-500 text-sm">סה"כ עגלות נטושות</p>
              <p className="text-2xl font-bold text-gray-800">{totalAbandoned}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow border-r-4 border-red-500">
              <p className="text-gray-500 text-sm">הכנסה אבודה (משוער)</p>
              <p className="text-2xl font-bold text-red-700">{totalLostRevenue.toFixed(2)}&#8362;</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-gray-500 text-sm">נוצר ולא שולם</p>
              <p className="text-2xl font-bold text-orange-600">{createdNotPaidCount}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-gray-500 text-sm">ננטש במפורש</p>
              <p className="text-2xl font-bold text-red-600">{abandonedCount}</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-white rounded-lg border border-red-200">
            <div className="flex flex-wrap gap-6 text-sm text-gray-600">
              <span>
                הזמנות נדחות: <strong>{delayedCount}</strong>
              </span>
              <span>
                הזמנות רגילות: <strong>{regularCount}</strong>
              </span>
              <span>
                קהילות: <strong>{Object.keys(groupedOrders).length}</strong>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── No results ──────────────────────────────────────────────── */}
      {orders.length === 0 && showResults && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-6 rounded-lg text-center">
          <p className="text-lg font-medium">אין עגלות נטושות!</p>
          <p className="text-sm mt-1">לא נמצאו הזמנות שלא הושלמו בטווח התאריכים ובקהילות שנבחרו.</p>
        </div>
      )}

      {/* ── Orders grouped by pickup spot ───────────────────────────── */}
      <div className="space-y-8">
        {showResults && Object.entries(groupedOrders)
          .sort(([, a], [, b]) => b.length - a.length)
          .map(([spot, spotOrders]) => {
            const spotTotal = spotOrders.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);
            return (
              <div key={spot} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Spot header */}
                <div className="bg-gray-800 text-white px-6 py-4 flex justify-between items-center">
                  <h2 className="text-xl font-bold">{spot}</h2>
                  <div className="flex items-center gap-4">
                    <span className="text-red-300 text-sm font-medium">
                      {spotTotal.toFixed(2)}&#8362; אבוד
                    </span>
                    <span className="bg-gray-700 px-3 py-1 rounded-full text-sm">
                      {spotOrders.length} עגלות
                    </span>
                  </div>
                </div>

                {/* Orders table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          לקוח
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          סטטוס
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          סוג
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          סכום
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          הזמין גם?
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          נוצר
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          פעולות
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {spotOrders.map((order) => {
                        const isExpanded = expandedOrders.has(order.id);
                        const phone = order.customerDetails?.phone;
                        const waPhone = formatPhone(phone);

                        return (
                          <React.Fragment key={order.id}>
                            <tr
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => toggleExpand(order.id)}
                            >
                              {/* Customer */}
                              <td className="px-4 py-3">
                                <div className="text-sm font-medium text-gray-900">
                                  {order.customerDetails?.name || 'אורח'}
                                </div>
                                {phone && (
                                  <div className="text-xs text-gray-500">{phone}</div>
                                )}
                              </td>

                              {/* Status */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(order)}`}
                                >
                                  {getStatusLabel(order)}
                                </span>
                              </td>

                              {/* Type */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                    order.source === 'delayed'
                                      ? 'bg-purple-100 text-purple-700'
                                      : 'bg-blue-100 text-blue-700'
                                  }`}
                                >
                                  {order.source === 'delayed' ? 'נדחית' : 'רגילה'}
                                </span>
                              </td>

                              {/* Amount */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="text-sm font-bold text-red-700">
                                  {(Number(order.grandTotal) || 0).toFixed(2)}&#8362;
                                </div>
                              </td>

                              {/* Completed another order? */}
                              <td className="px-4 py-3 whitespace-nowrap text-center">
                                {order.hasCompletedOrder ? (
                                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 border border-green-300">
                                    כן
                                  </span>
                                ) : (
                                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 border border-red-300">
                                    לא
                                  </span>
                                )}
                              </td>

                              {/* Created */}
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {format(order.createdDate, 'dd/MM HH:mm')}
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                  {waPhone && (
                                    <a
                                      href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                                        `היי ${order.customerDetails?.name || ''}, ראינו שהתחלת הזמנה באתר ולא הספקת לסיים\nאני כאן אם תרצי עזרה או אם יש שאלות לפני השלמת ההזמנה.`
                                      )}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-green-500 text-white hover:bg-green-600 transition-colors"
                                    >
                                      WhatsApp
                                    </a>
                                  )}
                                  {phone && (
                                    <a
                                      href={`tel:${phone}`}
                                      className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                                    >
                                      התקשר
                                    </a>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Expanded cart details */}
                            {isExpanded && (
                              <tr>
                                <td colSpan="7" className="px-6 py-4 bg-gray-50">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Cart contents */}
                                    <div>
                                      <h4 className="font-semibold text-gray-700 mb-2">
                                        תוכן העגלה:
                                      </h4>
                                      {order.orderBreakdown ? (
                                        <ul className="space-y-2 text-sm text-gray-600">
                                          {Object.values(order.orderBreakdown).map(
                                            (bizOrder, idx) => (
                                              <li key={idx}>
                                                <span className="font-medium text-gray-800 block">
                                                  {bizOrder.businessName}:
                                                </span>
                                                <ul className="list-disc list-inside pr-3">
                                                  {bizOrder.items?.map((item, i) => (
                                                    <li key={i}>
                                                      {item.quantity}x {item.productName}
                                                      {item.selectedOption &&
                                                        item.selectedOption !== 'None' &&
                                                        item.selectedOption !== 'ללא אופציות' &&
                                                        ` (${item.selectedOption})`}
                                                      {item.estimatedLineTotal != null && (
                                                        <span className="text-gray-400 mr-1">
                                                          - {Number(item.estimatedLineTotal).toFixed(2)}&#8362;
                                                        </span>
                                                      )}
                                                    </li>
                                                  ))}
                                                </ul>
                                              </li>
                                            )
                                          )}
                                        </ul>
                                      ) : (
                                        <p className="text-gray-400 text-sm">אין פרטי מוצרים</p>
                                      )}
                                    </div>

                                    {/* Customer details */}
                                    <div>
                                      <h4 className="font-semibold text-gray-700 mb-2">
                                        פרטי לקוח:
                                      </h4>
                                      <div className="text-sm text-gray-600 space-y-1">
                                        {order.customerDetails?.email && (
                                          <p>
                                            <span className="font-medium">אימייל:</span>{' '}
                                            {order.customerDetails.email}
                                          </p>
                                        )}
                                        {order.customerDetails?.address && (
                                          <p>
                                            <span className="font-medium">כתובת:</span>{' '}
                                            {order.customerDetails.address}
                                          </p>
                                        )}
                                        {order.customerDetails?.deliveryOption && (
                                          <p>
                                            <span className="font-medium">אפשרות:</span>{' '}
                                            {order.customerDetails.deliveryOption === 'homeDelivery'
                                              ? 'משלוח לבית'
                                              : 'איסוף עצמי'}
                                          </p>
                                        )}
                                        {order.customerDetails?.directions && (
                                          <p>
                                            <span className="font-medium">הערות:</span>{' '}
                                            {order.customerDetails.directions}
                                          </p>
                                        )}
                                        <p className="pt-2 text-xs text-gray-400">
                                          מזהה: {order.id}
                                        </p>
                                        {order.source === 'delayed' && (
                                          <p className="text-xs text-gray-400">
                                            סטטוס תשלום: {order.paymentStatus || '-'} | סטטוס הזמנה:{' '}
                                            {order.delayedOrderStatus || '-'}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-red-50 font-bold">
                        <td colSpan="4" className="px-4 py-3 text-sm text-gray-800">
                          סה"כ {spot}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-700">
                          {spotTotal.toFixed(2)}&#8362;
                        </td>
                        <td colSpan="2" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default AbandonedCarts;
