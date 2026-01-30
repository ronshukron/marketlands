import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, runTransaction } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../../firebase/firebase';
import { useAuth } from '../../../contexts/authContext';
import LoadingSpinner from '../../LoadingSpinner';
import { pickupSpots } from '../../../data/pickupSpots';
import { fetchDelayedOrdersForDeliveryV5, handleSuspendedPaymentV5 } from './api';
import WeighItemModal from './WeighItemModal';
import { loadWeighingState, upsertOrderWeighing } from './storage';
import ScaleConnectionPanel from '../../scale/ScaleConnectionPanel';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

// Buffer line catalog number (must match OrderConfirmationDelayed.js)
// This line should NOT be included in the J4 settlement invoice.
const BUFFER_LINE_CATALOG_NUMBER = process.env.REACT_APP_BUFFER_LINE_CATALOG_NUMBER || '999003';

function weekKeyToRangeLabel(weekKey) {
  const sunday = new Date(weekKey);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return `${format(sunday, 'dd/MM/yyyy')} - ${format(saturday, 'dd/MM/yyyy')}`;
}

function getNextUnweighedIndex(items = [], weightsByLineId = {}, removedLineIds = {}) {
  for (let i = 0; i < items.length; i++) {
    const lineId = items[i]?.lineId;
    if (!lineId) continue;
    // Skip removed items
    if (removedLineIds[lineId]) continue;
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

  const [weighModalOpen, setWeighModalOpen] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(0);

  // Thai workers helpers: product images + Thai name, and customer numbering (like V4)
  const [productDetails, setProductDetails] = useState({});
  const [permanentNumbersMap, setPermanentNumbersMap] = useState({});

  // Scale panel visibility
  const [showScalePanel, setShowScalePanel] = useState(false);

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

  const fetchPermanentCustomerNumbers = async (customersList) => {
    if (!customersList || customersList.length === 0) return {};
    const mapping = {};
    const missing = [];

    await Promise.all(customersList.map(async (c) => {
      const id = c?.id;
      if (!id) return;
      const ref = doc(db, 'customerNumbers', id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        mapping[id] = snap.data()?.number;
      } else {
        missing.push(c);
      }
    }));

    if (missing.length === 0) return mapping;

    const configRef = doc(db, 'customerNumbers', '_config');
    await runTransaction(db, async (tx) => {
      const configSnap = await tx.get(configRef);
      let currentMax = 0;
      if (configSnap.exists()) currentMax = Number(configSnap.data()?.maxNumber || 0);

      let next = currentMax;
      for (const m of missing) {
        const id = m?.id;
        if (!id) continue;
        next += 1;
        const newRef = doc(db, 'customerNumbers', id);
        tx.set(newRef, { number: next, name: m?.name || '', assignedAt: new Date() });
        mapping[id] = next;
      }
      tx.set(configRef, { maxNumber: next }, { merge: true });
    });

    return mapping;
  };

  const fetchProductDetails = async (productIds) => {
    const ids = Array.from(new Set((productIds || []).filter(Boolean)));
    if (ids.length === 0) return {};
    const map = {};
    await Promise.all(ids.map(async (productId) => {
      try {
        const ref = doc(db, 'Products', productId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        const d = snap.data() || {};
        map[productId] = {
          images: Array.isArray(d.images) ? d.images : [],
          thaiName: d.thaiName || '',
          name: d.name || '',
          measurementType: d.measurementType || 'kg', // default to kg if not set
          unitSize: d.unitSize || 1, // kg per cart click (default 1)
        };
      } catch (e) {
        // non-fatal
      }
    }));
    return map;
  };

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

        // Fetch Thai names/images + customer numbers for Thai workers UI
        const productIds = new Set();
        const customers = [];
        hydrated.forEach((o) => {
          (o.items || []).forEach((it) => {
            if (it?.productId) productIds.add(it.productId);
          });
          const cid = o?.customerDetails?.phone || o?.customerDetails?.email || null;
          if (cid) customers.push({ id: cid, name: o?.customerDetails?.name || '' });
        });
        const [pd, numbers] = await Promise.all([
          fetchProductDetails(Array.from(productIds)),
          fetchPermanentCustomerNumbers(customers),
        ]);
        setProductDetails(pd);
        setPermanentNumbersMap(numbers);
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
  const removedLineIds = selectedOrderSaved.removedLineIds || {};

  const items = useMemo(() => {
    const base = selectedOrder?.items || [];
    return base.map((it) => {
      const pd = it?.productId ? productDetails[it.productId] : null;
      return {
        ...it,
        thaiName: pd?.thaiName || it?.thaiName || '',
        images: pd?.images || it?.images || [],
        measurementType: pd?.measurementType || it?.measurementType || 'kg', // default to kg
        unitSize: pd?.unitSize || it?.unitSize || 1, // kg per cart click (default 1)
      };
    });
  }, [selectedOrder, productDetails]);
  // Count non-removed items
  const activeItems = useMemo(() => items.filter((it) => !removedLineIds[it.lineId]), [items, removedLineIds]);
  const nextIdx = useMemo(() => getNextUnweighedIndex(items, weightsByLineId, removedLineIds), [items, weightsByLineId, removedLineIds]);
  const canComplete = activeItems.length > 0 && nextIdx === -1;

  useEffect(() => {
    if (!selectedOrder) return;
    const suggested = nextIdx >= 0 ? nextIdx : 0;
    setActiveItemIndex(suggested);
  }, [selectedOrderId, nextIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const openWeighForIndex = (idx) => {
    if (!selectedOrder) return;
    const it = items[idx];
    if (!it) return;
    // Don't open modal for removed items
    if (removedLineIds[it.lineId]) return;

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

  const removeItem = (lineId) => {
    if (!selectedOrder || !lineId) return;
    const updated = upsertOrderWeighing({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      patch: {
        removedLineIds: {
          ...removedLineIds,
          [lineId]: true,
        },
      },
    });
    setWeighingState(updated);
  };

  const restoreItem = (lineId) => {
    if (!selectedOrder || !lineId) return;
    const newRemoved = { ...removedLineIds };
    delete newRemoved[lineId];
    const updated = upsertOrderWeighing({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      patch: {
        removedLineIds: newRemoved,
      },
    });
    setWeighingState(updated);
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

  const useOrderedQuantities = () => {
    if (!selectedOrder) return;
    if (!items || items.length === 0) return;
    const ok = window.confirm('למלא את כל הפריטים לפי הכמות שהוזמנה (כגיבוי כאשר המשקל לא עובד)? זה ידרוס שקילות קיימות להזמנה זו.');
    if (!ok) return;

    const nextWeights = {};
    for (const it of items) {
      if (!it?.lineId) continue;
      nextWeights[it.lineId] = {
        actualQuantity: Number(it.requestedQuantity || 0),
        source: 'ordered_default',
      };
    }

    const updated = upsertOrderWeighing({
      weekKey: selectedWeek,
      orderId: selectedOrder.id,
      patch: {
        status: 'weighed',
        weightsByLineId: nextWeights,
      },
    });
    setWeighingState(updated);
    setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'weighed' } : o)));
  };

  const computeTotals = () => {
    let requestedTotal = 0;
    let actualTotal = 0;
    let requestedSum = 0;
    let actualSum = 0;

    for (const it of items) {
      // Skip removed items
      if (removedLineIds[it.lineId]) continue;

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

  const totals = useMemo(() => computeTotals(), [items, weightsByLineId, removedLineIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const completeOrder = async () => {
    if (!selectedOrder) return;
    if (!canComplete) {
      alert('לא ניתן להשלים: יש פריטים שלא נשקלו עדיין.');
      return;
    }
    if (!window.confirm('לסמן כהושלם ולחייב את הלקוח (handleSuspendedPayment)?')) return;

    setLoading(true);
    try {
      // Mark as "settling" while the request is in-flight (do NOT mark completed yet).
      const updatedSettling = upsertOrderWeighing({
        weekKey: selectedWeek,
        orderId: selectedOrder.id,
        patch: { status: 'settling' },
      });
      setWeighingState(updatedSettling);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'settling' } : o)));

      // Build final invoice lines: real products with weighed quantities, excluding buffer line and removed items.
      // No rounding here - send precise values (up to 10 decimals), backend will round.
      const finalInvoiceLines = items
        .filter((it) => it.catalogNumber !== BUFFER_LINE_CATALOG_NUMBER && !removedLineIds[it.lineId])
        .map((it) => {
          const weighed = weightsByLineId[it.lineId];
          const actualQty = weighed?.actualQuantity ?? it.requestedQuantity;
          const linePrice = actualQty * (it.pricePerUnit || 0); // NO ROUNDING - backend rounds
          const measurementType = it.measurementType || 'kg'; // default to kg
          const weighSource = weighed?.source || 'manual'; // track source for description logic
          return {
            lineId: it.lineId,
            productId: it.productId,
            productName: it.productName,
            catalogNumber: it.catalogNumber || '',
            vatType: it.vatType ?? 3,
            requestedQuantity: it.requestedQuantity,
            actualQuantity: actualQty,
            pricePerUnit: it.pricePerUnit || 0,
            linePrice,
            measurementType, // 'kg' or 'unit'
            weighSource, // 'manual' | 'scale' | 'scale_placeholder' | 'unit' | 'ordered_default'
          };
        });

      // Calculate final sum based on weighed quantities - NO ROUNDING, backend will round
      const finalSum = finalInvoiceLines.reduce((acc, li) => acc + li.linePrice, 0);

      // Build productData for Grow receipt.
      // Grow doesn't support decimal quantities, so we use:
      // - quantity: 1
      // - price: linePrice (total for this item)
      // - itemDescription: "productName X.XXX ק"ג" or "productName X יח'" (includes actual qty in name)
      //   EXCEPTION: If a weight item used the "use ordered quantity" button (source = 'ordered_default' or 'unit'),
      //   we don't include the weight in the description since it wasn't actually weighed.
      const productDataForGrow = {};
      finalInvoiceLines.forEach((li, idx) => {
        let descriptionWithQty;
        if (li.measurementType === 'unit') {
          // Unit items: show as "productName X יח'"
          descriptionWithQty = `${li.productName} ${Number(li.actualQuantity)} יח'`;
        } else {
          // Weight items: check if it was actually weighed or used ordered quantity
          const usedOrderedQty = li.weighSource === 'ordered_default' || li.weighSource === 'unit';
          if (usedOrderedQty) {
            // Item used "השתמש בכמות שהוזמנה" - don't show weight in description
            descriptionWithQty = li.productName;
          } else {
            // Item was actually weighed - show as "productName X.XXX ק"ג"
            const weightStr = Number(li.actualQuantity).toFixed(3);
            descriptionWithQty = `${li.productName} ${weightStr} ק"ג`;
          }
        }
        productDataForGrow[`productData[${idx}][catalogNumber]`] = li.catalogNumber;
        productDataForGrow[`productData[${idx}][quantity]`] = 1; // Always 1 (Grow doesn't support decimals)
        productDataForGrow[`productData[${idx}][price]`] = li.linePrice; // LINE TOTAL
        productDataForGrow[`productData[${idx}][itemDescription]`] = descriptionWithQty;
        productDataForGrow[`productData[${idx}][vatType]`] = li.vatType;
      });

      console.log('=== handleSuspendedPayment DEBUG ===');
      console.log('orderId:', selectedOrder.id);
      console.log('weightsByLineId:', weightsByLineId);
      console.log('removedLineIds:', removedLineIds);
      console.log('finalInvoiceLines:', finalInvoiceLines);
      console.log('finalSum (should charge this amount):', finalSum);
      console.log('productDataForGrow (pass to Grow J4):', productDataForGrow);
      console.log('====================================');

      const res = await handleSuspendedPaymentV5({
        orderId: selectedOrder.id,
        weightsByLineId,
        removedLineIds,
        finalInvoiceLines,
        finalSum,
        productDataForGrow,
      });
      console.log('handleSuspendedPayment response', res);

      // Only now mark as completed.
      const updatedCompleted = upsertOrderWeighing({
        weekKey: selectedWeek,
        orderId: selectedOrder.id,
        patch: { status: 'completed' },
      });
      setWeighingState(updatedCompleted);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'completed' } : o)));

      alert('הושלם! (השרת אישר את הפעולה)');
    } catch (e) {
      console.error(e);
      // Revert back to weighed so admin can retry.
      const updatedRevert = upsertOrderWeighing({
        weekKey: selectedWeek,
        orderId: selectedOrder.id,
        patch: { status: 'weighed' },
      });
      setWeighingState(updatedRevert);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, status: 'weighed' } : o)));

      alert('שגיאה בהשלמת ההזמנה. לא סומן כהושלם (אפשר לנסות שוב). בדוק קונסול.');
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
      settling: { label: 'מחייב…', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
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
              דף חדש ועצמאי: שוקלים פריטים לפני השלמת חיוב.
            </p>
          </div>
          <button
            onClick={() => setShowScalePanel(!showScalePanel)}
            className={`px-4 py-2 rounded-lg font-bold transition-colors ${
              showScalePanel 
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            ⚖️ {showScalePanel ? 'הסתר משקל' : 'הצג משקל (BEP)'}
          </button>
        </div>

        {/* Scale Connection Panel */}
        {showScalePanel && (
          <div className="mb-6">
            <ScaleConnectionPanel className="max-w-md" />
          </div>
        )}

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
                const customerId = o?.customerDetails?.phone || o?.customerDetails?.email || null;
                const customerNumber = customerId && permanentNumbersMap[customerId] ? permanentNumbersMap[customerId] : '-';
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedOrderId(o.id)}
                    className={`w-full text-right p-4 hover:bg-gray-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-500 text-white font-bold flex items-center justify-center">
                          {customerNumber}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{o.customerDetails?.name || 'לקוח'}</div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            {o.customerDetails?.pickupSpot || o.pickupSpot || 'קהילה'} • {o.customerDetails?.phone || ''}
                          </div>
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
                      {(() => {
                        const customerId = selectedOrder?.customerDetails?.phone || selectedOrder?.customerDetails?.email || null;
                        const customerNumber = customerId && permanentNumbersMap[customerId] ? permanentNumbersMap[customerId] : '-';
                        return (
                          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-yellow-500 text-white font-bold">
                            {customerNumber}
                          </span>
                        );
                      })()}
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
                      onClick={useOrderedQuantities}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold rounded-md border"
                      title="ממלא את כל הפריטים לפי הכמות שהוזמנה (fallback)"
                    >
                      השתמש בכמות שהוזמנה
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
                    <div className="bg-gray-100 px-4 py-2 text-sm font-bold text-gray-800">פריטים ({activeItems.length}/{items.length})</div>
                    <div className="divide-y">
                      {items.map((it, idx) => {
                        const weighed = weightsByLineId?.[it.lineId]?.actualQuantity;
                        const isRemoved = !!removedLineIds[it.lineId];
                        const isNext = nextIdx === idx;
                        const isActive = activeItemIndex === idx;
                        const title = it.thaiName ? it.thaiName : it.productName;
                        return (
                          <div
                            key={it.lineId || idx}
                            className={`w-full text-right px-4 py-3 transition-colors ${
                              isRemoved ? 'bg-red-50 opacity-60' : isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => !isRemoved && openWeighForIndex(idx)}
                                disabled={isRemoved}
                                className="flex items-start gap-4 flex-1 text-right"
                              >
                                {it.images && it.images.length > 0 ? (
                                  <img
                                    src={it.images[0]}
                                    alt={title}
                                    className={`w-24 h-24 rounded-lg object-cover border border-gray-200 flex-shrink-0 ${isRemoved ? 'grayscale' : ''}`}
                                  />
                                ) : (
                                  <div className="w-24 h-24 rounded-lg bg-gray-100 border border-gray-200 flex-shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <div className={`font-bold ${isRemoved ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                    {title}
                                    {isRemoved && (
                                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-red-100 border border-red-200 text-red-700 no-underline">
                                        הוסר / ลบแล้ว
                                      </span>
                                    )}
                                    {!isRemoved && isNext && (
                                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-yellow-100 border border-yellow-200 text-yellow-900">
                                        הבא לשקילה
                                      </span>
                                    )}
                                  </div>
                                  {it.thaiName && (
                                    <div className={`text-xs mt-0.5 ${isRemoved ? 'text-gray-400 line-through' : 'text-gray-500'}`}>{it.productName}</div>
                                  )}
                                  <div className={`text-xs mt-1 ${isRemoved ? 'text-gray-400' : 'text-gray-600'}`}>
                                    {it.measurementType === 'unit' ? (
                                      <>
                                        הוזמן: <span className="font-semibold">{Number(it.requestedQuantity || 0)}</span> יח'
                                        {' '}• מחיר ליחידה: <span className="font-semibold">₪{Number(it.pricePerUnit || 0).toFixed(2)}</span>
                                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">יחידה</span>
                                      </>
                                    ) : (
                                      <>
                                        הוזמן: <span className="font-semibold">{Number(it.requestedQuantity || 0).toFixed(3)}</span> ק"ג
                                        {it.unitSize && it.unitSize !== 1 && (
                                          <span className="text-gray-400 ml-1">({Math.round((it.requestedQuantity || 0) / it.unitSize)} × {it.unitSize} ק"ג)</span>
                                        )}
                                        {' '}• מחיר לק"ג: <span className="font-semibold">₪{Number(it.pricePerUnit || 0).toFixed(2)}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </button>
                              <div className="text-right flex flex-col items-end gap-2">
                                {!isRemoved && (
                                  <>
                                    <div className={`text-sm font-bold ${weighed ? 'text-green-700' : 'text-gray-500'}`}>
                                      {weighed 
                                        ? (it.measurementType === 'unit' 
                                            ? `${Number(weighed)} יח'` 
                                            : `${Number(weighed).toFixed(3)} ק"ג`)
                                        : (it.measurementType === 'unit' ? 'לא אושר' : 'לא נשקל')}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {weighed ? (
                                        weightsByLineId?.[it.lineId]?.source === 'scale_placeholder'
                                          ? 'סקייל (placeholder)'
                                          : weightsByLineId?.[it.lineId]?.source === 'ordered_default'
                                            ? 'כמות שהוזמנה'
                                            : weightsByLineId?.[it.lineId]?.source === 'unit'
                                              ? 'יחידה (אושר)'
                                              : 'ידני'
                                      ) : ''}
                                    </div>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isRemoved) {
                                      restoreItem(it.lineId);
                                    } else {
                                      if (window.confirm(`להסיר את "${it.productName}" מההזמנה?\nลบ "${title}" ออกจากคำสั่งซื้อ?`)) {
                                        removeItem(it.lineId);
                                      }
                                    }
                                  }}
                                  className={`text-xs px-2 py-1 rounded ${
                                    isRemoved
                                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                                  }`}
                                >
                                  {isRemoved ? 'החזר / กู้คืน' : 'הסר / ลบ'}
                                </button>
                              </div>
                            </div>
                          </div>
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


