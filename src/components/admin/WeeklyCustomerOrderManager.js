import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDocs, runTransaction, updateDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import usePickupSpots from '../../hooks/usePickupSpots';
import { getEstimatedLineTotal } from '../../utils/pricing';
import { isSuccessfulRegularCustomerOrder } from '../../utils/customerOrderUtils';
import { transferCustomerOrderQuantity } from '../../utils/customerOrderTransferUtils';
import { ensureLineIdsInBreakdown } from '../adminV5/deliveryWeighingV5/v7/orderDraftUtils';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

const CANCELLED_STATUSES = new Set(['cancelled', 'cancelled_by_admin']);

const getCreatedDate = (createdAt) => {
  if (!createdAt) return null;
  if (typeof createdAt === 'string') {
    const dt = new Date(createdAt);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (typeof createdAt?.toDate === 'function') {
    return createdAt.toDate();
  }
  return null;
};

const toWeekKey = (date) => {
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  sunday.setHours(0, 0, 0, 0);
  return sunday.toISOString().split('T')[0];
};

const sumItemsTotal = (orderBreakdown = {}) => {
  let total = 0;
  Object.values(orderBreakdown).forEach((businessOrder) => {
    (businessOrder?.items || []).forEach((item) => {
      const lineTotal = item?.estimatedLineTotal != null
        ? Number(item.estimatedLineTotal)
        : getEstimatedLineTotal(item);
      total += Number.isFinite(lineTotal) ? lineTotal : 0;
    });
  });
  return Math.round(total * 100) / 100;
};

const buildUpdatedItemWithQuantity = (item, newQuantity) => {
  const quantity = Number(newQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const nextItem = {
    ...item,
    quantity,
  };
  nextItem.estimatedLineTotal = getEstimatedLineTotal(nextItem);
  return nextItem;
};

const getOrderStatusLabel = (order) => {
  if (order.source === 'customerOrdersDelayed') {
    if (CANCELLED_STATUSES.has((order.paymentStatus || '').toLowerCase())) return 'בוטלה';
    if ((order.delayedOrderStatus || '').toLowerCase() === 'abandoned') return 'נטושה';
    return order.delayedOrderStatus || order.paymentStatus || 'לא ידוע';
  }
  if (CANCELLED_STATUSES.has((order.paymentStatus || '').toLowerCase())) return 'בוטלה';
  return order.paymentStatus || 'לא ידוע';
};

const isOrderActive = (orderData, source) => {
  const paymentStatus = String(orderData.paymentStatus || '').toLowerCase();
  const delayedStatus = String(orderData.delayedOrderStatus || '').toLowerCase();

  if (paymentStatus === 'abandoned') return false;
  if (CANCELLED_STATUSES.has(paymentStatus)) return false;
  if (source === 'customerOrdersDelayed' && delayedStatus === 'abandoned') return false;
  if (source === 'customerOrdersDelayed' && CANCELLED_STATUSES.has(delayedStatus)) return false;

  return true;
};

const WeeklyCustomerOrderManager = () => {
  const { currentUser } = useAuth();
  const { pickupSpots } = usePickupSpots();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [tempSelectedWeek, setTempSelectedWeek] = useState('');
  const [selectedCommunities, setSelectedCommunities] = useState(new Set());
  const [tempSelectedCommunities, setTempSelectedCommunities] = useState(new Set());
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const [ordersByPickupSpot, setOrdersByPickupSpot] = useState({});
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [communityUpdates, setCommunityUpdates] = useState({});
  const [transferDrafts, setTransferDrafts] = useState({});
  const [transferCatalog, setTransferCatalog] = useState({ businesses: [], productsByBusiness: {} });
  const [savingActionKey, setSavingActionKey] = useState('');
  const communityDropdownRef = useRef(null);

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
      setError('You are not authorized to view this page');
      setLoading(false);
      return;
    }
    fetchAvailableWeeks();
    fetchTransferCatalog();
  }, [currentUser]);

  const fetchTransferCatalog = async () => {
    try {
      const [businessSnap, productSnap, ordersSnap] = await Promise.all([
        getDocs(collection(db, 'businesses')),
        getDocs(collection(db, 'Products')),
        getDocs(collection(db, 'Orders')),
      ]);
      const productsByBusiness = {};
      productSnap.docs.forEach((productDoc) => {
        const product = { id: productDoc.id, ...productDoc.data() };
        const businessId = product.Owner_ID;
        if (!businessId) return;
        if (!productsByBusiness[businessId]) productsByBusiness[businessId] = [];
        productsByBusiness[businessId].push(product);
      });
      Object.values(productsByBusiness).forEach((products) => {
        products.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he'));
      });

      const latestOrderByBusiness = {};
      ordersSnap.docs.forEach((orderDoc) => {
        const data = orderDoc.data() || {};
        if (!data.businessId) return;
        const timestamp = getCreatedDate(data.Order_Time || data.createdAt)?.getTime() || 0;
        const previous = latestOrderByBusiness[data.businessId];
        if (!previous || timestamp >= previous.timestamp) {
          latestOrderByBusiness[data.businessId] = {
            orderKey: orderDoc.id,
            timestamp,
            selectedProducts: new Set(data.selectedProducts || []),
          };
        }
      });

      const businesses = businessSnap.docs
        .map((businessDoc) => {
          const data = businessDoc.data() || {};
          const orderMeta = latestOrderByBusiness[businessDoc.id];
          return {
            id: businessDoc.id,
            ...data,
            businessName: data.businessName || data.name || data.displayName || businessDoc.id,
            orderKey: orderMeta?.orderKey || `admin-transfer-${businessDoc.id}`,
            selectedProducts: orderMeta?.selectedProducts || new Set(),
          };
        })
        .filter((business) => (productsByBusiness[business.id] || []).length > 0)
        .sort((a, b) => a.businessName.localeCompare(b.businessName, 'he'));
      setTransferCatalog({ businesses, productsByBusiness });
    } catch (err) {
      console.error('Error loading transfer catalog:', err);
    }
  };

  useEffect(() => {
    if (selectedWeek) {
      fetchWeeklyOrders();
    }
  }, [selectedWeek, selectedCommunities]);

  const allOrders = useMemo(
    () => Object.values(ordersByPickupSpot).flat(),
    [ordersByPickupSpot]
  );

  const getOrderCommunityKey = (order) => `${order.source}::${order.id}`;

  const fetchAvailableWeeks = async () => {
    setLoading(true);
    try {
      const [regularSnap, delayedSnap] = await Promise.all([
        getDocs(collection(db, 'customerOrders')),
        getDocs(collection(db, 'customerOrdersDelayed'))
      ]);

      const weeksSet = new Set();
      [...regularSnap.docs, ...delayedSnap.docs].forEach((orderDoc) => {
        const createdDate = getCreatedDate(orderDoc.data()?.createdAt);
        if (!createdDate) return;
        weeksSet.add(toWeekKey(createdDate));
      });

      const sorted = Array.from(weeksSet).sort((a, b) => new Date(b) - new Date(a));
      setAvailableWeeks(sorted);
      if (sorted.length > 0) {
        setTempSelectedWeek(sorted[0]);
      }
    } catch (err) {
      console.error('Error fetching available weeks:', err);
      setError('Failed to load weeks data');
    } finally {
      setLoading(false);
    }
  };

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

      const [regularSnap, delayedSnap] = await Promise.all([
        getDocs(collection(db, 'customerOrders')),
        getDocs(collection(db, 'customerOrdersDelayed'))
      ]);

      const grouped = {};
      const allDocs = [
        ...regularSnap.docs.map((d) => ({ doc: d, source: 'customerOrders' })),
        ...delayedSnap.docs.map((d) => ({ doc: d, source: 'customerOrdersDelayed' }))
      ];

      allDocs.forEach(({ doc: orderDoc, source }) => {
        const orderData = orderDoc.data();
        if (!isOrderActive(orderData, source)) return;

        const createdDate = getCreatedDate(orderData.createdAt);
        if (!createdDate) return;

        const createdDateISO = createdDate.toISOString();
        if (createdDateISO < startISO || createdDateISO > endISO) return;

        const pickupSpot = orderData.customerDetails?.pickupSpot || 'לא צוין';
        if (selectedCommunities.size > 0 && !selectedCommunities.has(pickupSpot)) return;

        if (!grouped[pickupSpot]) grouped[pickupSpot] = [];
        const normalizedBreakdown = ensureLineIdsInBreakdown(
          orderDoc.id,
          orderData.orderBreakdown || {},
        ).breakdown;
        grouped[pickupSpot].push({
          id: orderDoc.id,
          source,
          createdDate,
          ...orderData,
          orderBreakdown: normalizedBreakdown,
        });
      });

      Object.keys(grouped).forEach((spot) => {
        grouped[spot].sort((a, b) => b.createdDate - a.createdDate);
      });

      setOrdersByPickupSpot(grouped);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError('Failed to load order data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitFilters = () => {
    setSelectedWeek(tempSelectedWeek);
    setSelectedCommunities(tempSelectedCommunities);
  };

  const toggleCommunity = (community) => {
    setTempSelectedCommunities((prev) => {
      const next = new Set(prev);
      if (next.has(community)) next.delete(community);
      else next.add(community);
      return next;
    });
  };

  const updateOrderInState = (sourceSpot, orderId, nextOrder, removeOrder = false) => {
    setOrdersByPickupSpot((prev) => {
      const next = { ...prev };
      const currentSpotOrders = [...(next[sourceSpot] || [])];
      const idx = currentSpotOrders.findIndex((o) => o.id === orderId);
      if (idx === -1) return prev;

      if (removeOrder) {
        currentSpotOrders.splice(idx, 1);
      } else {
        currentSpotOrders[idx] = nextOrder;
      }

      if (currentSpotOrders.length === 0) delete next[sourceSpot];
      else next[sourceSpot] = currentSpotOrders;
      return next;
    });
  };

  const persistOrderBreakdown = async (order, nextBreakdown) => {
    const hasItemsLeft = Object.values(nextBreakdown).some(
      (businessOrder) => Array.isArray(businessOrder?.items) && businessOrder.items.length > 0
    );
    if (!hasItemsLeft) {
      window.alert('לא נשארו פריטים בהזמנה. השתמש/י בכפתור ביטול הזמנה מלאה.');
      return false;
    }

    const orderRef = doc(db, order.source, order.id);
    const deliveryFee = Number(order.customerDetails?.deliveryDetails?.deliveryFee) || 0;
    const nextGrandTotal = Math.round((sumItemsTotal(nextBreakdown) + deliveryFee) * 100) / 100;
    const nextBusinessIds = Array.from(
      new Set(Object.values(nextBreakdown).map((businessOrder) => businessOrder.businessId).filter(Boolean))
    );

    await updateDoc(orderRef, {
      orderBreakdown: nextBreakdown,
      businessIds: nextBusinessIds,
      grandTotal: nextGrandTotal,
      adminEditedAt: new Date().toISOString(),
    });

    updateOrderInState(order.customerDetails?.pickupSpot || 'לא צוין', order.id, {
      ...order,
      orderBreakdown: nextBreakdown,
      businessIds: nextBusinessIds,
      grandTotal: nextGrandTotal,
    }, false);

    return true;
  };

  const updateTransferDraft = (orderId, patch) => {
    setTransferDrafts((prev) => ({
      ...prev,
      [orderId]: { ...(prev[orderId] || {}), ...patch },
    }));
  };

  const resolveTargetBusinessOrderKey = (orderBreakdown, targetBusiness) => {
    const existingEntry = Object.entries(orderBreakdown || {}).find(
      ([, businessOrder]) => businessOrder?.businessId === targetBusiness.id,
    );
    if (existingEntry) return existingEntry[0];
    return targetBusiness.orderKey;
  };

  const transferProductQuantity = async (order) => {
    const draft = transferDrafts[order.id] || {};
    const sourceLine = Object.values(order.orderBreakdown || {})
      .flatMap((businessOrder) => businessOrder.items || [])
      .find((item) => item.lineId === draft.sourceLineId);
    const targetBusiness = transferCatalog.businesses.find(
      (business) => business.id === draft.targetBusinessId,
    );
    const targetProduct = (transferCatalog.productsByBusiness[draft.targetBusinessId] || [])
      .find((product) => product.id === draft.targetProductId);
    const quantity = Number(draft.quantity);
    if (!sourceLine || !targetBusiness || !targetProduct || !Number.isFinite(quantity) || quantity <= 0) {
      window.alert('יש לבחור פריט מקור, כמות, עסק יעד ומוצר יעד.');
      return;
    }

    const approved = window.confirm(
      `להעביר ${quantity} יחידות מ"${sourceLine.productName}" ל"${targetProduct.name}" אצל ${targetBusiness.businessName}?`,
    );
    if (!approved) return;

    const actionKey = `${order.id}-transfer`;
    setSavingActionKey(actionKey);
    try {
      const orderRef = doc(db, order.source, order.id);
      const transferId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let updatedOrder;
      await runTransaction(db, async (transaction) => {
        const freshSnap = await transaction.get(orderRef);
        if (!freshSnap.exists()) throw new Error('Order no longer exists');
        const freshOrder = freshSnap.data() || {};
        if (!isSuccessfulRegularCustomerOrder(freshOrder)) {
          throw new Error('ניתן להעביר מוצרים רק בהזמנה רגילה ששולמה');
        }
        const targetBusinessOrderKey = resolveTargetBusinessOrderKey(
          freshOrder.orderBreakdown,
          targetBusiness,
        );
        const result = transferCustomerOrderQuantity({
          orderId: order.id,
          orderBreakdown: freshOrder.orderBreakdown,
          sourceLineId: draft.sourceLineId,
          quantity,
          targetBusinessOrderKey,
          targetBusiness,
          targetProduct,
          transferId,
          deliveryFee: freshOrder.customerDetails?.deliveryDetails?.deliveryFee,
        });
        const auditEntry = {
          ...result.audit,
          transferredAt: new Date().toISOString(),
          transferredBy: currentUser.uid,
        };
        transaction.update(orderRef, {
          orderBreakdown: result.orderBreakdown,
          businessIds: result.businessIds,
          grandTotal: result.grandTotal,
          transferAudit: [...(freshOrder.transferAudit || []), auditEntry],
          adminEditedAt: auditEntry.transferredAt,
        });
        updatedOrder = {
          ...order,
          ...freshOrder,
          orderBreakdown: result.orderBreakdown,
          businessIds: result.businessIds,
          grandTotal: result.grandTotal,
          transferAudit: [...(freshOrder.transferAudit || []), auditEntry],
        };
      });
      updateOrderInState(
        order.customerDetails?.pickupSpot || 'לא צוין',
        order.id,
        updatedOrder,
        false,
      );
      setTransferDrafts((prev) => ({ ...prev, [order.id]: {} }));
    } catch (err) {
      console.error('Error transferring product quantity:', err);
      window.alert(err.message || 'שגיאה בהעברת המוצר');
    } finally {
      setSavingActionKey('');
    }
  };

  const cancelEntireOrder = async (order) => {
    const approved = window.confirm(`לבטל את הזמנה ${order.id} עבור ${order.customerDetails?.name || 'לקוח'}?`);
    if (!approved) return;

    const actionKey = `${order.id}-cancel`;
    setSavingActionKey(actionKey);
    try {
      const orderRef = doc(db, order.source, order.id);
      const payload = {
        paymentStatus: 'cancelled',
        adminCancelledAt: new Date().toISOString()
      };
      if (order.source === 'customerOrdersDelayed') {
        payload.delayedOrderStatus = 'cancelled_by_admin';
      }

      await updateDoc(orderRef, payload);
      updateOrderInState(order.customerDetails?.pickupSpot || 'לא צוין', order.id, null, true);
    } catch (err) {
      console.error('Error cancelling order:', err);
      window.alert('שגיאה בביטול ההזמנה');
    } finally {
      setSavingActionKey('');
    }
  };

  const changeItemQuantityInOrder = async (order, businessOrderKey, itemIndex, quantityDelta) => {
    const targetBusiness = order.orderBreakdown?.[businessOrderKey];
    const item = targetBusiness?.items?.[itemIndex];
    if (!item) return;

    const currentQty = Number(item.quantity) || 0;
    const removeCount = Math.abs(Number(quantityDelta) || 0);
    if (removeCount <= 0) return;

    const isPartialRemoval = removeCount < currentQty;
    const confirmMessage = isPartialRemoval
      ? `להסיר ${removeCount} מתוך ${currentQty} מההזמנה?`
      : 'להסיר את הפריט מההזמנה?';
    const approved = window.confirm(confirmMessage);
    if (!approved) return;

    const actionKey = `${order.id}-qty-${businessOrderKey}-${itemIndex}-${removeCount}`;
    setSavingActionKey(actionKey);
    try {
      const nextBreakdown = { ...(order.orderBreakdown || {}) };
      const businessOrder = nextBreakdown[businessOrderKey];
      if (!businessOrder || !Array.isArray(businessOrder.items)) {
        throw new Error('Business order not found');
      }

      const newQty = currentQty - removeCount;
      let nextItems;
      if (newQty <= 0) {
        nextItems = businessOrder.items.filter((_, idx) => idx !== itemIndex);
      } else {
        const updatedItem = buildUpdatedItemWithQuantity(item, newQty);
        if (!updatedItem) {
          nextItems = businessOrder.items.filter((_, idx) => idx !== itemIndex);
        } else {
          nextItems = [...businessOrder.items];
          nextItems[itemIndex] = updatedItem;
        }
      }

      if (nextItems.length === 0) {
        delete nextBreakdown[businessOrderKey];
      } else {
        nextBreakdown[businessOrderKey] = {
          ...businessOrder,
          items: nextItems,
        };
      }

      await persistOrderBreakdown(order, nextBreakdown);
    } catch (err) {
      console.error('Error updating item quantity:', err);
      window.alert('שגיאה בעדכון כמות הפריט');
    } finally {
      setSavingActionKey('');
    }
  };

  const removeItemFromOrder = async (order, businessOrderKey, itemIndex) => {
    const item = order.orderBreakdown?.[businessOrderKey]?.items?.[itemIndex];
    if (!item) return;
    const currentQty = Number(item.quantity) || 0;
    await changeItemQuantityInOrder(order, businessOrderKey, itemIndex, currentQty);
  };

  const changeOrderCommunity = async (order) => {
    const selectedSpot = communityUpdates[getOrderCommunityKey(order)];
    if (!selectedSpot || selectedSpot === (order.customerDetails?.pickupSpot || 'לא צוין')) return;

    const approved = window.confirm(`להעביר את ההזמנה לקהילה "${selectedSpot}"?`);
    if (!approved) return;

    const actionKey = `${order.id}-community`;
    setSavingActionKey(actionKey);
    try {
      const orderRef = doc(db, order.source, order.id);
      await updateDoc(orderRef, {
        'customerDetails.pickupSpot': selectedSpot,
        adminEditedAt: new Date().toISOString()
      });

      const previousSpot = order.customerDetails?.pickupSpot || 'לא צוין';
      const updatedOrder = {
        ...order,
        customerDetails: {
          ...(order.customerDetails || {}),
          pickupSpot: selectedSpot
        }
      };

      updateOrderInState(previousSpot, order.id, null, true);
      if (selectedCommunities.size === 0 || selectedCommunities.has(selectedSpot)) {
        setOrdersByPickupSpot((prev) => {
          const next = { ...prev };
          if (!next[selectedSpot]) next[selectedSpot] = [];
          next[selectedSpot] = [updatedOrder, ...next[selectedSpot]].sort((a, b) => b.createdDate - a.createdDate);
          return next;
        });
      }
    } catch (err) {
      console.error('Error changing order community:', err);
      window.alert('שגיאה בעדכון הקהילה');
    } finally {
      setSavingActionKey('');
    }
  };

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
      <h1 className="text-3xl font-bold text-center mb-8">ניהול הזמנות לקוחות לפי שבוע וקהילה</h1>

      <div className="mb-6 bg-white p-6 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">בחר שבוע:</label>
            <select
              value={tempSelectedWeek}
              onChange={(e) => setTempSelectedWeek(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {availableWeeks.map((week) => {
                const sunday = new Date(week);
                const friday = new Date(sunday);
                friday.setDate(sunday.getDate() + 5);
                return (
                  <option key={week} value={week}>
                    {format(sunday, 'dd/MM/yyyy')} - {format(friday, 'dd/MM/yyyy')}
                  </option>
                );
              })}
            </select>
          </div>

          <div ref={communityDropdownRef}>
            <label className="block text-gray-700 text-sm font-medium mb-2">בחר קהילות:</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCommunityDropdown((open) => !open)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {tempSelectedCommunities.size === 0 ? 'כל הקהילות' : `${tempSelectedCommunities.size} קהילות נבחרו`}
              </button>
              {showCommunityDropdown && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-2 max-h-80 overflow-auto">
                  <div className="flex gap-2 mb-2 pb-2 border-b">
                    <button
                      onClick={() => setTempSelectedCommunities(new Set(pickupSpots))}
                      className="text-xs px-2 py-1 bg-indigo-500 text-white rounded"
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
                        id={`manage-com-${spot}`}
                        checked={tempSelectedCommunities.has(spot)}
                        onChange={() => toggleCommunity(spot)}
                        className="ml-2"
                      />
                      <label htmlFor={`manage-com-${spot}`} className="text-sm cursor-pointer flex-1">
                        {spot}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={handleSubmitFilters}
            className="px-8 py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold rounded-lg transition-all transform hover:scale-105 shadow-lg"
          >
            טען הזמנות
          </button>
        </div>

        {selectedWeek && (
          <p className="text-center text-gray-600 mt-4">
            מציג הזמנות פעילות מ-{dateRange.start} עד {dateRange.end}
            {selectedCommunities.size > 0 && ` עבור ${selectedCommunities.size} קהילות`}
          </p>
        )}
      </div>

      {allOrders.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded text-center">
          לא נמצאו הזמנות פעילות עבור השבוע והקהילות שנבחרו
        </div>
      ) : (
        <>
          <div className="mb-6 bg-indigo-50 p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-3 text-indigo-800">סיכום</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded shadow">
                <p className="text-gray-500 text-sm">סה"כ הזמנות פעילות</p>
                <p className="text-2xl font-bold">{allOrders.length}</p>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <p className="text-gray-500 text-sm">סכום הזמנות</p>
                <p className="text-2xl font-bold">
                  ₪{allOrders.reduce((sum, order) => sum + (Number(order.grandTotal) || 0), 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <p className="text-gray-500 text-sm">מספר קהילות</p>
                <p className="text-2xl font-bold">{Object.keys(ordersByPickupSpot).length}</p>
              </div>
            </div>
          </div>

          {Object.entries(ordersByPickupSpot).map(([pickupSpot, orders]) => (
            <div key={pickupSpot} className="mb-8 bg-white p-6 rounded-lg shadow">
              <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
                <h3 className="text-lg font-semibold text-gray-800">{pickupSpot}</h3>
                <span className="text-sm text-gray-500">{orders.length} הזמנות</span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">לקוח</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">סטטוס</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">פריטים</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">סה"כ</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">עדכון קהילה</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {orders.map((order) => {
                      const pickupValue = order.customerDetails?.pickupSpot || 'לא צוין';
                      const communityKey = getOrderCommunityKey(order);
                      const transferDraft = transferDrafts[order.id] || {};
                      const sourceLine = Object.values(order.orderBreakdown || {})
                        .flatMap((businessOrder) => businessOrder.items || [])
                        .find((item) => item.lineId === transferDraft.sourceLineId);
                      const sourceBusinessId = Object.values(order.orderBreakdown || {})
                        .find((businessOrder) => (businessOrder.items || [])
                          .some((item) => item.lineId === transferDraft.sourceLineId))
                        ?.businessId;
                      const targetProducts = transferCatalog.productsByBusiness[transferDraft.targetBusinessId] || [];
                      const canTransfer = order.source === 'customerOrders'
                        && isSuccessfulRegularCustomerOrder(order);
                      return (
                        <tr key={`${order.source}-${order.id}`} className="hover:bg-gray-50 align-top">
                          <td className="px-4 py-4 min-w-[210px]">
                            <div className="text-sm font-semibold text-gray-900">{order.customerDetails?.name || 'לא צוין'}</div>
                            <div className="text-xs text-gray-500">{order.customerDetails?.phone || 'אין טלפון'}</div>
                            <div className="text-xs text-gray-400 mt-1">{order.id}</div>
                            <div className="text-xs text-gray-400">{format(order.createdDate, 'dd/MM/yyyy HH:mm')}</div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-700 min-w-[130px]">
                            {getOrderStatusLabel(order)}
                            <div className="text-xs text-gray-400 mt-1">
                              {order.source === 'customerOrdersDelayed' ? 'דחוי' : 'רגיל'}
                            </div>
                          </td>
                          <td className="px-4 py-4 min-w-[320px]">
                            <ul className="space-y-1 text-sm">
                              {Object.entries(order.orderBreakdown || {}).map(([businessKey, businessOrder]) => (
                                <li key={businessKey} className="border border-gray-100 rounded p-2">
                                  <div className="text-xs text-gray-500 mb-1">{businessOrder.businessName}</div>
                                  {(businessOrder.items || []).map((item, itemIndex) => {
                                    const itemQty = Number(item.quantity) || 0;
                                    const canRemovePartial = itemQty > 1;
                                    const actionBaseKey = `${order.id}-qty-${businessKey}-${itemIndex}`;
                                    const isSaving = savingActionKey.startsWith(actionBaseKey);
                                    return (
                                    <div key={`${businessKey}-${itemIndex}`} className="flex justify-between items-start gap-2 mb-1">
                                      <span>
                                        {item.quantity} × {item.productName}
                                        {item.selectedOption && item.selectedOption !== 'None' && item.selectedOption !== 'ללא אופציות' ? ` (${item.selectedOption})` : ''}
                                      </span>
                                      <div className="flex flex-wrap gap-1 shrink-0">
                                        {canRemovePartial && (
                                          <button
                                            type="button"
                                            onClick={() => changeItemQuantityInOrder(order, businessKey, itemIndex, 1)}
                                            disabled={isSaving}
                                            className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded hover:bg-amber-200 disabled:opacity-50"
                                          >
                                            הסר 1
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => removeItemFromOrder(order, businessKey, itemIndex)}
                                          disabled={isSaving}
                                          className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200 disabled:opacity-50"
                                        >
                                          {canRemovePartial ? 'הסר הכל' : 'הסר'}
                                        </button>
                                      </div>
                                    </div>
                                    );
                                  })}
                                </li>
                              ))}
                            </ul>
                            {canTransfer && (
                              <div className="mt-3 rounded border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                                <div className="text-xs font-bold text-indigo-900">העברת מוצר לעסק אחר</div>
                                <select
                                  value={transferDraft.sourceLineId || ''}
                                  onChange={(e) => updateTransferDraft(order.id, {
                                    sourceLineId: e.target.value,
                                    quantity: '',
                                    targetBusinessId: '',
                                    targetProductId: '',
                                  })}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                                >
                                  <option value="">בחר פריט מקור</option>
                                  {Object.entries(order.orderBreakdown || {}).flatMap(([businessKey, businessOrder]) => (
                                    (businessOrder.items || []).map((item) => (
                                      <option key={item.lineId} value={item.lineId}>
                                        {businessOrder.businessName}: {item.productName} ({item.quantity})
                                      </option>
                                    ))
                                  ))}
                                </select>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <input
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    max={sourceLine?.quantity || ''}
                                    value={transferDraft.quantity || ''}
                                    onChange={(e) => updateTransferDraft(order.id, { quantity: e.target.value })}
                                    placeholder="כמות"
                                    className="px-2 py-1 border border-gray-300 rounded text-xs"
                                  />
                                  <select
                                    value={transferDraft.targetBusinessId || ''}
                                    onChange={(e) => updateTransferDraft(order.id, {
                                      targetBusinessId: e.target.value,
                                      targetProductId: '',
                                    })}
                                    className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                                  >
                                    <option value="">עסק יעד</option>
                                    {transferCatalog.businesses
                                      .filter((business) => business.id !== sourceBusinessId)
                                      .map((business) => (
                                        <option key={business.id} value={business.id}>{business.businessName}</option>
                                      ))}
                                  </select>
                                  <select
                                    value={transferDraft.targetProductId || ''}
                                    onChange={(e) => updateTransferDraft(order.id, { targetProductId: e.target.value })}
                                    disabled={!transferDraft.targetBusinessId}
                                    className="px-2 py-1 border border-gray-300 rounded text-xs bg-white disabled:bg-gray-100"
                                  >
                                    <option value="">מוצר יעד</option>
                                    {targetProducts.map((product) => (
                                      <option key={product.id} value={product.id}>
                                        {product.name} — ₪{Number(product.price || 0).toFixed(2)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => transferProductQuantity(order)}
                                  disabled={savingActionKey === `${order.id}-transfer`}
                                  className="w-full px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50"
                                >
                                  {savingActionKey === `${order.id}-transfer` ? 'מעביר...' : 'בצע העברה'}
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-sm font-semibold text-gray-900 whitespace-nowrap">
                            ₪{(Number(order.grandTotal) || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-4 min-w-[210px]">
                            <div className="flex flex-col gap-2">
                              <select
                                value={communityUpdates[communityKey] ?? pickupValue}
                                onChange={(e) => setCommunityUpdates((prev) => ({ ...prev, [communityKey]: e.target.value }))}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              >
                                {[...pickupSpots, 'לא צוין'].map((spot) => (
                                  <option key={`${order.id}-${spot}`} value={spot}>
                                    {spot}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => changeOrderCommunity(order)}
                                disabled={savingActionKey === `${order.id}-community`}
                                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                שמור קהילה
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-4 min-w-[140px]">
                            <button
                              onClick={() => cancelEntireOrder(order)}
                              disabled={savingActionKey === `${order.id}-cancel`}
                              className="px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              בטל הזמנה
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default WeeklyCustomerOrderManager;
