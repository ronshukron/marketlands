import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../../firebase/firebase';
import { useAuth } from '../../../contexts/authContext';
import LoadingSpinner from '../../LoadingSpinner';
import { pickupSpots } from '../../../data/pickupSpots';
import { fetchDelayedOrdersForDeliveryV5, handleSuspendedPaymentV5 } from './api';
import WeighItemModal from './WeighItemModal';
import { loadWeighingState, upsertOrderWeighing } from './storage';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

function weekKeyToRangeLabel(weekKey) {
  const sunday = new Date(weekKey);
  const friday = new Date(sunday);
  friday.setDate(sunday.getDate() + 5);
  return `${format(sunday, 'dd/MM/yyyy')} - ${format(friday, 'dd/MM/yyyy')}`;
}

function getNextUnweighedIndex(items = [], weightsByLineId = {}) {
  for (let i = 0; i < items.length; i++) {
    const lineId = items[i]?.lineId;
    if (!lineId) continue;
    if (!weightsByLineId?.[lineId]?.actualQuantity) return i;
  }
  return -1;
}

export default function DeliveryManagementV5() {
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [tempSelectedWeek, setTempSelectedWeek] = useState('');
  const [selectedWeek, setSelectedWeek] = useState('');

  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const communityDropdownRef = useRef(null);
  const [tempSelectedCommunities, setTempSelectedCommunities] = useState(new Set());
  const [selectedCommunities, setSelectedCommunities] = useState(new Set());

  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const [weighingState, setWeighingState] = useState({ byOrderId: {} });
  const [isUsingMock, setIsUsingMock] = useState(false);

  const [weighModalOpen, setWeighModalOpen] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(0);

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
      setError('אין לך הרשאות לצפות בדף זה');
      setLoading(false);
      return;
    }
    fetchAvailableWeeks();
  }, [currentUser]);

  useEffect(() => {
    if (!selectedWeek) return;
    setWeighingState(loadWeighingState({ weekKey: selectedWeek }));
  }, [selectedWeek]);

  const fetchAvailableWeeks = async () => {
    setLoading(true);
    try {
      const ordersRef = collection(db, 'Orders');
      const snap = await getDocs(ordersRef);
      const weeksSet = new Set();
      snap.docs.forEach((d) => {
        const data = d.data();
        const endingTime = data.Ending_Time || data.endingTime;
        if (!endingTime) return;
        let endDate;
        if (endingTime?.toDate) endDate = endingTime.toDate();
        else endDate = new Date(endingTime);

        if (!endDate || Number.isNaN(endDate.getTime())) return;
        const sunday = new Date(endDate);
        sunday.setDate(endDate.getDate() - endDate.getDay());
        sunday.setHours(0, 0, 0, 0);
        weeksSet.add(sunday.toISOString().split('T')[0]);
      });
      const sortedWeeks = Array.from(weeksSet).sort((a, b) => new Date(b) - new Date(a));
      setAvailableWeeks(sortedWeeks);
      if (sortedWeeks.length > 0) setTempSelectedWeek(sortedWeeks[0]);
    } catch (e) {
      console.error(e);
      setError('Failed to load weeks');
    } finally {
      setLoading(false);
    }
  };

  const toggleCommunity = (community) => {
    setTempSelectedCommunities((prev) => {
      const next = new Set(prev);
      if (next.has(community)) next.delete(community);
      else next.add(community);
      return next;
    });
  };

  const selectAllCommunities = () => setTempSelectedCommunities(new Set(pickupSpots));
  const clearAllCommunities = () => setTempSelectedCommunities(new Set());

  const handleLoad = async () => {
    setSelectedWeek(tempSelectedWeek);
    setSelectedCommunities(new Set(tempSelectedCommunities));
  };

  useEffect(() => {
    const run = async () => {
      if (!selectedWeek) return;
      setLoading(true);
      setError(null);
      try {
        const communities = Array.from(selectedCommunities);
        const fetched = await fetchDelayedOrdersForDeliveryV5({ weekKey: selectedWeek, communities });
        setIsUsingMock(Array.isArray(fetched) && fetched.some((o) => o?.source === 'mock'));

        const persisted = loadWeighingState({ weekKey: selectedWeek });
        setWeighingState(persisted);

        const hydrated = (Array.isArray(fetched) ? fetched : []).map((o) => {
          const saved = persisted.byOrderId?.[o.id] || {};
          const savedStatus = saved.status || o.status || 'pending';
          return { ...o, status: savedStatus };
        });

        setOrders(hydrated);
        if (hydrated.length > 0 && (!selectedOrderId || !hydrated.some((o) => o.id === selectedOrderId))) {
          setSelectedOrderId(hydrated[0].id);
        }
      } catch (e) {
        console.error(e);
        setError('Failed to load delayed orders');
      } finally {
        setLoading(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, selectedCommunities]);

  const selectedOrder = useMemo(() => orders.find((o) => o.id === selectedOrderId) || null, [orders, selectedOrderId]);
  const selectedOrderSaved = useMemo(() => (selectedWeek && selectedOrderId ? (weighingState.byOrderId?.[selectedOrderId] || {}) : {}), [weighingState, selectedWeek, selectedOrderId]);
  const weightsByLineId = selectedOrderSaved.weightsByLineId || {};

  const items = selectedOrder?.items || [];
  const nextIdx = useMemo(() => getNextUnweighedIndex(items, weightsByLineId), [items, weightsByLineId]);
  const canComplete = items.length > 0 && nextIdx === -1;

  useEffect(() => {
    if (!selectedOrder) return;
    const suggested = nextIdx >= 0 ? nextIdx : 0;
    setActiveItemIndex(suggested);
  }, [selectedOrderId, nextIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const openWeighForIndex = (idx) => {
    if (!selectedOrder) return;
    const it = items[idx];
    if (!it) return;

    // mark in-progress
    const updated = upsertOrderWeighing({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      patch: { status: 'in_progress' },
    });
    setWeighingState(updated);
    setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'in_progress' } : o)));

    setActiveItemIndex(idx);
    setWeighModalOpen(true);
  };

  const confirmWeight = (payload) => {
    if (!selectedOrder) return;
    const it = items[activeItemIndex];
    if (!it?.lineId) return;

    const nextWeights = {
      ...(weightsByLineId || {}),
      [it.lineId]: {
        actualQuantity: payload.actualQuantity,
        source: payload.source || 'manual',
      },
    };

    const newStatus = getNextUnweighedIndex(items, nextWeights) === -1 ? 'weighed' : 'in_progress';
    const updated = upsertOrderWeighing({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      patch: {
        status: newStatus,
        weightsByLineId: nextWeights,
      },
    });
    setWeighingState(updated);
    setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: newStatus } : o)));

    setWeighModalOpen(false);

    const next = getNextUnweighedIndex(items, nextWeights);
    if (next >= 0) {
      // auto move to next item
      setTimeout(() => openWeighForIndex(next), 50);
    }
  };

  const computeTotals = () => {
    let requestedTotal = 0;
    let actualTotal = 0;
    let requestedSum = 0;
    let actualSum = 0;

    for (const it of items) {
      const req = Number(it.requestedQuantity || 0);
      const price = Number(it.pricePerUnit || 0);
      requestedTotal += req;
      requestedSum += req * price;

      const actual = Number(weightsByLineId?.[it.lineId]?.actualQuantity || 0);
      actualTotal += actual;
      actualSum += actual * price;
    }
    return {
      requestedTotal,
      actualTotal,
      requestedSum,
      actualSum,
    };
  };

  const totals = useMemo(() => computeTotals(), [items, weightsByLineId]); // eslint-disable-line react-hooks/exhaustive-deps

  const completeOrder = async () => {
    if (!selectedOrder) return;
    if (!canComplete) {
      alert('לא ניתן להשלים: יש פריטים שלא נשקלו עדיין.');
      return;
    }
    if (!window.confirm('לסמן כהושלם ולחייב את הלקוח (handleSuspendedPayment)?')) return;

    setLoading(true);
    try {
      const updated = upsertOrderWeighing({
        weekKey: selectedWeek,
        orderId: selectedOrder.id,
        patch: { status: 'completed' },
      });
      setWeighingState(updated);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'completed' } : o)));

      // Call backend to finalize/capture suspended payment.
      const res = await handleSuspendedPaymentV5({
        orderId: selectedOrder.id,
        weightsByLineId,
      });
      console.log('handleSuspendedPayment response', res);
      alert('הושלם! (הקריאה לשרת בוצעה. בדוק לוגים/תשובת שרת במידת הצורך)');
    } catch (e) {
      console.error(e);
      alert('שגיאה בהשלמת ההזמנה. יתכן שה-endpoint עדיין לא קיים. בדוק קונסול.');
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (status) => {
    const s = status || 'pending';
    const map = {
      pending: { label: 'ממתין', cls: 'bg-gray-100 text-gray-800 border-gray-200' },
      in_progress: { label: 'בהכנה', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
      weighed: { label: 'נשקל', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
      completed: { label: 'הושלם', cls: 'bg-green-100 text-green-800 border-green-200' },
    };
    const m = map[s] || map.pending;
    return <span className={`text-xs font-semibold px-2 py-1 rounded border ${m.cls}`}>{m.label}</span>;
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Delivery Management V5 — שקילת פריטים</h1>
            <p className="text-sm text-gray-600 mt-1">
              דף חדש ועצמאי: שוקלים פריטים לפני השלמת חיוב (כרגע עם קריאת משקל Placeholder + הזנה ידנית).
            </p>
            {isUsingMock && (
              <div className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded px-3 py-2">
                שים לב: לא נמצאו הזמנות מתאימות ב-`customerOrders` לשבוע/קהילות שנבחרו, ולכן מוצגים נתוני דמו (mock).
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שבוע:</label>
              <select
                value={tempSelectedWeek}
                onChange={(e) => setTempSelectedWeek(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableWeeks.map((wk) => (
                  <option key={wk} value={wk}>
                    {weekKeyToRangeLabel(wk)}
                  </option>
                ))}
              </select>
            </div>

            <div ref={communityDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">קהילות:</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCommunityDropdown((o) => !o)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-right focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {tempSelectedCommunities.size === 0 ? 'כל הקהילות' : `נבחרו ${tempSelectedCommunities.size} קהילות`}
                </button>
                {showCommunityDropdown && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-2 max-h-80 overflow-auto">
                    <div className="flex gap-2 mb-2 pb-2 border-b">
                      <button onClick={selectAllCommunities} className="text-xs px-2 py-1 bg-blue-500 text-white rounded">בחר הכל</button>
                      <button onClick={clearAllCommunities} className="text-xs px-2 py-1 bg-gray-300 text-gray-700 rounded">נקה</button>
                    </div>
                    {pickupSpots.map((spot) => (
                      <div key={spot} className="flex items-center px-2 py-1 hover:bg-gray-50 rounded">
                        <input
                          type="checkbox"
                          id={`delivery-v5-community-${spot}`}
                          checked={tempSelectedCommunities.has(spot)}
                          onChange={() => toggleCommunity(spot)}
                          className="ml-2"
                        />
                        <label htmlFor={`delivery-v5-community-${spot}`} className="text-sm cursor-pointer flex-1">
                          {spot}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleLoad}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-lg shadow"
              >
                טען הזמנות (Delayed)
              </button>
            </div>
          </div>

          {selectedWeek && (
            <div className="mt-3 text-sm text-gray-600">
              שבוע נבחר: <span className="font-semibold">{weekKeyToRangeLabel(selectedWeek)}</span>
              {selectedCommunities.size > 0 && (
                <> — קהילות: <span className="font-semibold">{Array.from(selectedCommunities).join(', ')}</span></>
              )}
            </div>
          )}
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Orders list */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-bold text-gray-900">הזמנות</div>
              <div className="text-xs text-gray-500">סה"כ: {orders.length}</div>
            </div>
            <div className="divide-y">
              {orders.length === 0 && (
                <div className="p-6 text-center text-gray-500">אין הזמנות להצגה.</div>
              )}
              {orders.map((o) => {
                const isActive = o.id === selectedOrderId;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedOrderId(o.id)}
                    className={`w-full text-right p-4 hover:bg-gray-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-gray-900">{o.customerDetails?.name || 'לקוח'}</div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {o.customerDetails?.pickupSpot || o.pickupSpot || 'קהילה'} • {o.customerDetails?.phone || ''}
                        </div>
                      </div>
                      {statusBadge(o.status)}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      {Array.isArray(o.items) ? `${o.items.length} פריטים` : '—'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Order workspace */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden">
            {!selectedOrder ? (
              <div className="p-8 text-center text-gray-600">בחר הזמנה כדי להתחיל.</div>
            ) : (
              <div>
                <div className="px-5 py-4 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="text-xl font-bold text-gray-900">{selectedOrder.customerDetails?.name}</div>
                      {statusBadge(selectedOrder.status)}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      קהילה: <span className="font-semibold">{selectedOrder.customerDetails?.pickupSpot || selectedOrder.pickupSpot}</span>
                      {selectedOrder.customerDetails?.phone ? <> • טלפון: <span className="font-semibold">{selectedOrder.customerDetails.phone}</span></> : null}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const idx = nextIdx >= 0 ? nextIdx : 0;
                        openWeighForIndex(idx);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md"
                    >
                      התחל שקילה
                    </button>
                    <button
                      type="button"
                      onClick={completeOrder}
                      disabled={!canComplete || selectedOrder.status === 'completed'}
                      className={`px-4 py-2 font-bold rounded-md ${
                        !canComplete || selectedOrder.status === 'completed'
                          ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      השלם + חיוב
                    </button>
                  </div>
                </div>

                <div className="p-5">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
                    <div className="bg-gray-50 border rounded-lg p-3">
                      <div className="text-xs text-gray-500">סה"כ הוזמן (ק"ג)</div>
                      <div className="text-lg font-bold">{totals.requestedTotal.toFixed(3)}</div>
                    </div>
                    <div className="bg-gray-50 border rounded-lg p-3">
                      <div className="text-xs text-gray-500">סה"כ נשקל (ק"ג)</div>
                      <div className="text-lg font-bold text-blue-700">{totals.actualTotal.toFixed(3)}</div>
                    </div>
                    <div className="bg-gray-50 border rounded-lg p-3">
                      <div className="text-xs text-gray-500">סה"כ מחיר לפי הזמנה (₪)</div>
                      <div className="text-lg font-bold">{totals.requestedSum.toFixed(2)}</div>
                    </div>
                    <div className="bg-gray-50 border rounded-lg p-3">
                      <div className="text-xs text-gray-500">סה"כ מחיר לפי שקילה (₪)</div>
                      <div className="text-lg font-bold text-green-700">{totals.actualSum.toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-100 px-4 py-2 text-sm font-bold text-gray-800">פריטים</div>
                    <div className="divide-y">
                      {items.map((it, idx) => {
                        const weighed = weightsByLineId?.[it.lineId]?.actualQuantity;
                        const isNext = nextIdx === idx;
                        const isActive = activeItemIndex === idx;
                        return (
                          <button
                            key={it.lineId || idx}
                            type="button"
                            onClick={() => openWeighForIndex(idx)}
                            className={`w-full text-right px-4 py-3 hover:bg-gray-50 transition-colors ${
                              isActive ? 'bg-blue-50' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-bold text-gray-900">
                                  {it.productName}
                                  {isNext && (
                                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-yellow-100 border border-yellow-200 text-yellow-900">
                                      הבא לשקילה
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">
                                  הוזמן: <span className="font-semibold">{Number(it.requestedQuantity || 0).toFixed(3)}</span> ק"ג
                                  {' '}• מחיר לק"ג: <span className="font-semibold">₪{Number(it.pricePerUnit || 0).toFixed(2)}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-sm font-bold ${weighed ? 'text-green-700' : 'text-gray-500'}`}>
                                  {weighed ? `${Number(weighed).toFixed(3)} ק"ג` : 'לא נשקל'}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {weighed ? (weightsByLineId?.[it.lineId]?.source === 'scale_placeholder' ? 'סקייל (placeholder)' : 'ידני') : ''}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <WeighItemModal
                  open={weighModalOpen}
                  item={items[activeItemIndex]}
                  existingValue={items[activeItemIndex]?.lineId ? weightsByLineId?.[items[activeItemIndex].lineId] : null}
                  onCancel={() => setWeighModalOpen(false)}
                  onConfirm={confirmWeight}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


