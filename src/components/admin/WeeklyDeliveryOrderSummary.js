import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import { pickupSpots } from '../../data/pickupSpots';
import { getEstimatedLineTotal } from '../../utils/pricing';
import {
  getDateRangeFromWeekKey,
  getOrderCommunity,
  getOrderDeliveryDate,
  getWeekKey,
  isOrderDeliveryDateFallback,
  normalizeDateRange,
} from '../../utils/deliveryScheduleUtils';
import LoadingSpinner from '../LoadingSpinner';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

const WeeklyDeliveryOrderSummary = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCommunities, setSelectedCommunities] = useState(new Set());
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const [orders, setOrders] = useState([]);
  const [businessSummary, setBusinessSummary] = useState({});
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
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
    fetchAvailableWeeks();
  }, [currentUser]);

  useEffect(() => {
    if (selectedWeek || startDate || endDate) {
      fetchOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, startDate, endDate, selectedCommunities]);

  const fetchAvailableWeeks = async () => {
    setLoading(true);
    try {
      const [ordersSnapshot, delayedSnapshot] = await Promise.all([
        getDocs(collection(db, 'customerOrders')),
        getDocs(collection(db, 'customerOrdersDelayed')),
      ]);

      const weeks = new Set();
      [...ordersSnapshot.docs, ...delayedSnapshot.docs].forEach((docSnap) => {
        const deliveryDate = getOrderDeliveryDate(docSnap.data());
        const weekKey = getWeekKey(deliveryDate);
        if (weekKey) weeks.add(weekKey);
      });

      const sorted = Array.from(weeks).sort((a, b) => new Date(b) - new Date(a));
      setAvailableWeeks(sorted);
      if (sorted.length > 0) setSelectedWeek(sorted[0]);
    } catch (err) {
      console.error('Error fetching delivery weeks:', err);
      setError('Failed to load delivery weeks');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const window = normalizeDateRange(startDate, endDate) || getDateRangeFromWeekKey(selectedWeek);
      if (!window) {
        setOrders([]);
        setBusinessSummary({});
        return;
      }

      setDateRange({
        start: format(window.start, 'dd/MM/yyyy'),
        end: format(window.end, 'dd/MM/yyyy'),
      });

      const [ordersSnapshot, delayedSnapshot] = await Promise.all([
        getDocs(collection(db, 'customerOrders')),
        getDocs(collection(db, 'customerOrdersDelayed')),
      ]);

      const nextOrders = [];
      const nextBusinessSummary = {};
      const allDocs = [
        ...ordersSnapshot.docs.map((docSnap) => ({ docSnap, source: 'customerOrders' })),
        ...delayedSnapshot.docs.map((docSnap) => ({ docSnap, source: 'customerOrdersDelayed' })),
      ];

      allDocs.forEach(({ docSnap, source }) => {
        const orderData = docSnap.data() || {};
        const isDelayed = source === 'customerOrdersDelayed';

        if (!isDelayed && orderData.paymentStatus !== 'completed') return;
        if (isDelayed) {
          const delayedStatus = String(orderData.delayedOrderStatus || '').toLowerCase();
          const paymentStatus = String(orderData.paymentStatus || '').toLowerCase();
          if (['abandoned', 'cancelled', 'cancelled_by_admin'].includes(delayedStatus)) return;
          if (['abandoned', 'cancelled'].includes(paymentStatus)) return;
        }

        const deliveryDate = getOrderDeliveryDate(orderData);
        if (!deliveryDate || deliveryDate < window.start || deliveryDate > window.end) return;

        const community = getOrderCommunity(orderData);
        if (selectedCommunities.size > 0 && !selectedCommunities.has(community)) return;

        const orderWithMeta = {
          id: docSnap.id,
          source,
          ...orderData,
          deliveryDate,
          deliveryDateLabel: format(deliveryDate, 'dd/MM/yyyy'),
          deliveryWeekKey: getWeekKey(deliveryDate),
          deliveryDateIsFallback: isOrderDeliveryDateFallback(orderData),
          community,
        };
        nextOrders.push(orderWithMeta);

        if (orderData.orderBreakdown) {
          Object.values(orderData.orderBreakdown).forEach((businessOrder) => {
            const businessId = businessOrder.businessId || businessOrder.businessName || 'unknown';
            if (!nextBusinessSummary[businessId]) {
              nextBusinessSummary[businessId] = {
                businessName: businessOrder.businessName || 'Unknown Business',
                products: {},
                totalRevenue: 0,
              };
            }

            (businessOrder.items || []).forEach((item) => {
              const productKey = `${item.productId || item.id || item.productName}_${item.selectedOption || ''}`;
              if (!nextBusinessSummary[businessId].products[productKey]) {
                nextBusinessSummary[businessId].products[productKey] = {
                  productName: item.productName || item.name || 'פריט',
                  selectedOption: item.selectedOption || '',
                  quantity: 0,
                  totalRevenue: 0,
                  unitSize: item.unitSize || 1,
                  measurementType: item.measurementType || 'kg',
                };
              }

              const totalPrice = item.estimatedLineTotal != null
                ? Number(item.estimatedLineTotal)
                : getEstimatedLineTotal(item);
              nextBusinessSummary[businessId].products[productKey].quantity += Number(item.quantity) || 0;
              nextBusinessSummary[businessId].products[productKey].totalRevenue += totalPrice;
              nextBusinessSummary[businessId].totalRevenue += totalPrice;
            });
          });
        }
      });

      nextOrders.sort((a, b) => b.deliveryDate - a.deliveryDate);
      setOrders(nextOrders);
      setBusinessSummary(nextBusinessSummary);
    } catch (err) {
      console.error('Error fetching delivery orders:', err);
      setError('Failed to load delivery orders');
    } finally {
      setLoading(false);
    }
  };

  const ordersByCommunity = useMemo(() => {
    return orders.reduce((acc, order) => {
      if (!acc[order.community]) acc[order.community] = [];
      acc[order.community].push(order);
      return acc;
    }, {});
  }, [orders]);

  const toggleCommunity = (community) => {
    setSelectedCommunities((prev) => {
      const next = new Set(prev);
      if (next.has(community)) next.delete(community);
      else next.add(community);
      return next;
    });
  };

  const copySupplierOrder = async (business) => {
    const lines = Object.values(business.products)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .map((product) => {
        const isUnitBased = product.measurementType === 'package' || product.measurementType === 'unit';
        const quantity = isUnitBased ? Math.round(product.quantity) : Number(product.quantity).toFixed(1);
        const unit = isUnitBased ? "יח'" : 'ק"ג';
        return `* ${product.productName}${product.selectedOption ? ` ${product.selectedOption}` : ''} - ${quantity} ${unit}`;
      });
    await navigator.clipboard.writeText([`הזמנה לטווח משלוח ${dateRange.start}-${dateRange.end}:`, '', ...lines].join('\n'));
    alert('הזמנת הספק הועתקה');
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div className="max-w-4xl mx-auto p-6 text-red-600">{error}</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6" dir="rtl">
      <h1 className="text-2xl font-bold mb-6">סיכום הזמנות לפי שבוע משלוח</h1>

      <div className="bg-white rounded-lg shadow p-5 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <label>
          <span className="block text-sm font-medium text-gray-700 mb-1">שבוע משלוח</span>
          <select
            value={selectedWeek}
            onChange={(event) => {
              setSelectedWeek(event.target.value);
              setStartDate('');
              setEndDate('');
            }}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          >
            {availableWeeks.map((week) => (
              <option key={week} value={week}>{week}</option>
            ))}
          </select>
        </label>

        <label>
          <span className="block text-sm font-medium text-gray-700 mb-1">מתאריך משלוח</span>
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </label>
        <label>
          <span className="block text-sm font-medium text-gray-700 mb-1">עד תאריך משלוח</span>
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </label>

        <div className="relative" ref={communityDropdownRef}>
          <span className="block text-sm font-medium text-gray-700 mb-1">קהילות</span>
          <button
            type="button"
            onClick={() => setShowCommunityDropdown((prev) => !prev)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-right"
          >
            {selectedCommunities.size === 0 ? 'כל הקהילות' : `${selectedCommunities.size} נבחרו`}
          </button>
          {showCommunityDropdown && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-72 overflow-auto p-2">
              <button
                type="button"
                onClick={() => setSelectedCommunities(new Set())}
                className="w-full text-right px-2 py-1 text-sm hover:bg-gray-50 rounded"
              >
                כל הקהילות
              </button>
              {pickupSpots.map((spot) => (
                <label key={spot} className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-50 rounded">
                  <input
                    type="checkbox"
                    checked={selectedCommunities.has(spot)}
                    onChange={() => toggleCommunity(spot)}
                  />
                  <span>{spot}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mb-6 text-gray-600">
        מציג הזמנות לפי טווח משלוח {dateRange.start} - {dateRange.end}. הזמנות ללא תאריך משלוח מסומנות כנתוני עבר ומשתמשות ב-`createdAt`.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-4 rounded shadow">
          <p className="text-gray-500 text-sm">מספר הזמנות</p>
          <p className="text-2xl font-bold">{orders.length}</p>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <p className="text-gray-500 text-sm">סה"כ הכנסות</p>
          <p className="text-2xl font-bold">₪{orders.reduce((sum, order) => sum + (Number(order.grandTotal) || 0), 0).toFixed(2)}</p>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <p className="text-gray-500 text-sm">עסקים</p>
          <p className="text-2xl font-bold">{Object.keys(businessSummary).length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <section className="bg-white rounded-lg shadow p-5">
          <h2 className="text-xl font-semibold mb-4">הזמנות לפי קהילה</h2>
          {Object.entries(ordersByCommunity).map(([community, communityOrders]) => (
            <div key={community} className="mb-5">
              <h3 className="font-semibold text-lg mb-2">{community} ({communityOrders.length})</h3>
              <div className="space-y-2">
                {communityOrders.map((order) => (
                  <div key={order.id} className="border border-gray-200 rounded-md p-3">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-medium">{order.customerDetails?.name || 'לקוח'}</p>
                        <p className="text-sm text-gray-600">{order.customerDetails?.phone || ''}</p>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold">₪{Number(order.grandTotal || 0).toFixed(2)}</p>
                        <p className="text-xs text-gray-600">משלוח: {order.deliveryDateLabel}</p>
                        {order.deliveryDateIsFallback && (
                          <p className="text-xs text-yellow-700">נתוני עבר - לפי תאריך יצירה</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="bg-white rounded-lg shadow p-5">
          <h2 className="text-xl font-semibold mb-4">סיכום ספקים</h2>
          <div className="space-y-4">
            {Object.entries(businessSummary)
              .sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue)
              .map(([businessId, business]) => (
                <div key={businessId} className="border border-gray-200 rounded-md p-3">
                  <div className="flex justify-between gap-3 mb-2">
                    <div>
                      <h3 className="font-semibold">{business.businessName}</h3>
                      <p className="text-sm text-gray-600">₪{business.totalRevenue.toFixed(2)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copySupplierOrder(business)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm"
                    >
                      העתק לספק
                    </button>
                  </div>
                  <ul className="text-sm list-disc list-inside">
                    {Object.values(business.products).map((product) => (
                      <li key={`${product.productName}-${product.selectedOption}`}>
                        {product.productName} {product.selectedOption || ''} - {Number(product.quantity).toFixed(1)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default WeeklyDeliveryOrderSummary;
