import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import LoadingSpinner from '../LoadingSpinner';
import Swal from 'sweetalert2';
import { acceptCommunityPayment, cancelCommunityPayment } from '../../services/independentAdminService';

const currency = (n) => `₪${Number(n || 0).toFixed(2)}`;

const IndependentOrdersAdmin = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, open, closed, canceled
  const [sortBy, setSortBy] = useState('createdAt'); // createdAt, endingTime, businessName, orderName
  const [sortOrder, setSortOrder] = useState('desc'); // asc, desc

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'IndependentOrders'),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOrders(data);
    } catch (error) {
      console.error('Error fetching independent orders:', error);
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'לא ניתן לטעון את רשימת ההזמנות'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptCommunity = async (order, community) => {
    const heldKey = `totalHeldByCommunity.${community}`;
    const minKey = `minAmountByCommunity.${community}`;
    const held = Number(order[heldKey] ?? 0);
    const min = Number(order[minKey] ?? order.minAmount ?? 0);

    if (held < min) {
      Swal.fire({
        icon: 'info',
        title: 'לא ניתן לאשר',
        text: `הסכום המוחזק (${currency(held)}) קטן מהמינימום (${currency(min)})`
      });
      return;
    }

    const result = await Swal.fire({
      icon: 'question',
      title: 'אישור קהילה',
      text: `לאשר את הקהילה ${community} בהזמנה "${order.orderName}"?`,
      showCancelButton: true,
      confirmButtonText: 'אשר',
      cancelButtonText: 'ביטול',
      confirmButtonColor: '#16a34a'
    });

    if (!result.isConfirmed) return;

    try {
      setBusy({ ...busy, [`${order.id}_${community}`]: true });
      await acceptCommunityPayment({ orderId: order.id, community });
      Swal.fire({
        icon: 'success',
        title: 'אושר',
        text: `הקהילה ${community} אושרה בהצלחה`,
        timer: 2000
      });
      await fetchOrders();
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'האישור נכשל'
      });
    } finally {
      setBusy({ ...busy, [`${order.id}_${community}`]: false });
    }
  };

  const handleCancelCommunity = async (order, community) => {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'ביטול קהילה',
      html: `
        <p>האם לבטל את הקהילה <strong>${community}</strong> בהזמנה <strong>"${order.orderName}"</strong>?</p>
        <p class="text-sm text-gray-600 mt-2">פעולה זו תבטל את כל ההזמנות בקהילה</p>
      `,
      input: 'text',
      inputLabel: 'סיבת הביטול (אופציונלי)',
      inputPlaceholder: 'למשל: לא הגיע למינימום',
      showCancelButton: true,
      confirmButtonText: 'בטל קהילה',
      cancelButtonText: 'חזור',
      confirmButtonColor: '#dc2626'
    });

    if (!result.isConfirmed) return;

    try {
      setBusy({ ...busy, [`${order.id}_${community}`]: true });
      await cancelCommunityPayment({
        orderId: order.id,
        community,
        reason: result.value || undefined
      });
      Swal.fire({
        icon: 'success',
        title: 'בוטל',
        text: `הקהילה ${community} בוטלה בהצלחה`,
        timer: 2000
      });
      await fetchOrders();
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'הביטול נכשל'
      });
    } finally {
      setBusy({ ...busy, [`${order.id}_${community}`]: false });
    }
  };

  const filteredAndSortedOrders = useMemo(() => {
    let filtered = [...orders];

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        order =>
          order.orderName?.toLowerCase().includes(term) ||
          order.businessName?.toLowerCase().includes(term) ||
          order.id.toLowerCase().includes(term) ||
          order.pickupSpots?.some(spot => spot.toLowerCase().includes(term))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => {
        if (statusFilter === 'open') return order.status === 'open';
        if (statusFilter === 'closed') return order.status === 'closed';
        if (statusFilter === 'canceled') return order.status === 'canceled';
        return true;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal, bVal;

      if (sortBy === 'createdAt') {
        aVal = a.createdAt?.toDate?.() || new Date(0);
        bVal = b.createdAt?.toDate?.() || new Date(0);
      } else if (sortBy === 'endingTime') {
        aVal = a.endingTime?.toDate?.() || new Date(0);
        bVal = b.endingTime?.toDate?.() || new Date(0);
      } else if (sortBy === 'businessName') {
        aVal = (a.businessName || '').toLowerCase();
        bVal = (b.businessName || '').toLowerCase();
      } else if (sortBy === 'orderName') {
        aVal = (a.orderName || '').toLowerCase();
        bVal = (b.orderName || '').toLowerCase();
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [orders, searchTerm, statusFilter, sortBy, sortOrder]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">ניהול מודעות חקלאים עצמאיים</h1>
          <p className="text-gray-600">סה"כ {orders.length} מודעות במערכת</p>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">חיפוש</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="שם מודעה, חקלאי, קהילה..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">הכל</option>
                <option value="open">פתוח</option>
                <option value="closed">סגור</option>
                <option value="canceled">מבוטל</option>
              </select>
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">מיון לפי</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="createdAt">תאריך יצירה</option>
                <option value="endingTime">תאריך סיום</option>
                <option value="businessName">שם חקלאי</option>
                <option value="orderName">שם מודעה</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סדר</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="desc">יורד</option>
                <option value="asc">עולה</option>
              </select>
            </div>
          </div>

          {/* Results Count */}
          <div className="mt-3 text-sm text-gray-600">
            מציג {filteredAndSortedOrders.length} מתוך {orders.length} מודעות
          </div>
        </div>

        {/* Orders List */}
        {filteredAndSortedOrders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-600">לא נמצאו מודעות התואמות את החיפוש</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAndSortedOrders.map((order) => {
              const isOrderFinished = order.status && order.status !== 'open';
              const canceledCommunities = order.canceledCommunities || [];
              const communities = Object.keys(order.customerOrderIdsByCommunity || {});
              const totalHeld = Number(order.totalHeld || 0);
              const numHeld = Number(order.numHeld || 0);
              const endingTime = order.endingTime?.toDate?.();
              const isExpired = endingTime && endingTime < new Date();

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-lg shadow-md overflow-hidden ${
                    isOrderFinished ? 'opacity-75' : ''
                  }`}
                >
                  {/* Order Header */}
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 border-b">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-xl font-bold text-gray-900">{order.orderName || 'ללא שם'}</h3>
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              order.status === 'open'
                                ? 'bg-green-100 text-green-700'
                                : order.status === 'closed'
                                ? 'bg-gray-100 text-gray-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {order.status === 'open' ? 'פתוח' : order.status === 'closed' ? 'סגור' : 'מבוטל'}
                          </span>
                          {isExpired && (
                            <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700">
                              פג תוקף
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">חקלאי: {order.businessName || 'לא ידוע'}</p>
                        <p className="text-sm text-gray-600">מזהה: {order.id}</p>
                      </div>
                      <button
                        onClick={() => navigate(`/admin/independent-order/${order.id}`)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                      >
                        פרטים מלאים
                      </button>
                    </div>
                  </div>

                  {/* Order Stats */}
                  <div className="p-4 bg-gray-50 border-b">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">סך הכל מוחזק</p>
                        <p className="font-semibold text-lg">{currency(totalHeld)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">לקוחות מוחזקים</p>
                        <p className="font-semibold text-lg">{numHeld}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">קהילות פעילות</p>
                        <p className="font-semibold text-lg">{communities.length}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">תאריך סיום</p>
                        <p className="font-semibold text-sm">
                          {endingTime ? endingTime.toLocaleDateString('he-IL') : 'לא הוגדר'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Communities */}
                  <div className="p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">קהילות ({communities.length})</h4>
                    {communities.length === 0 ? (
                      <p className="text-sm text-gray-500">אין קהילות עם הזמנות</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {communities.map((community) => {
                          const heldKey = `totalHeldByCommunity.${community}`;
                          const numKey = `numHeldByCommunity.${community}`;
                          const minKey = `minAmountByCommunity.${community}`;
                          const held = Number(order[heldKey] ?? 0);
                          const num = Number(order[numKey] ?? 0);
                          const min = Number(order[minKey] ?? order.minAmount ?? 0);
                          const isCanceled = canceledCommunities.includes(community);
                          const isLoading = busy[`${order.id}_${community}`];
                          const canAccept = held >= min;

                          return (
                            <div
                              key={community}
                              className={`border rounded-lg p-3 ${
                                isCanceled ? 'bg-gray-50 opacity-60' : 'bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="font-medium text-gray-900">{community}</div>
                                {isCanceled && (
                                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                                    בוטל
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-600 space-y-0.5 mb-2">
                                <div>מוחזק: {currency(held)}</div>
                                <div>מינימום: {currency(min)}</div>
                                <div>לקוחות: {num}</div>
                              </div>
                              <div className="flex gap-1">
                                {isLoading ? (
                                  <div className="flex justify-center w-full py-1">
                                    <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                                  </div>
                                ) : (
                                  <>
                                    {/* <button
                                      disabled={!canAccept || isOrderFinished || isCanceled}
                                      onClick={() => handleAcceptCommunity(order, community)}
                                      className={`flex-1 px-2 py-1 rounded text-xs font-medium ${
                                        canAccept && !isOrderFinished && !isCanceled
                                          ? 'bg-green-600 hover:bg-green-700 text-white'
                                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                      }`}
                                    >
                                      אשר
                                    </button> */}
                                    <button
                                      disabled={isOrderFinished || isCanceled}
                                      onClick={() => handleCancelCommunity(order, community)}
                                      className={`flex-1 px-2 py-1 rounded text-xs font-medium ${
                                        isOrderFinished || isCanceled
                                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                          : 'bg-red-600 hover:bg-red-700 text-white'
                                      }`}
                                    >
                                      {isCanceled ? 'בוטל' : 'בטל'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default IndependentOrdersAdmin;

