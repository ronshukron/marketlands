import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import LoadingSpinner from '../LoadingSpinner';
import Swal from 'sweetalert2';
import { acceptCommunityPayment, cancelCommunityPayment } from '../../services/independentAdminService';

const currency = (n) => `₪${Number(n || 0).toFixed(2)}`;

const isHeldLike = (co) => {
  const status = co?.paymentStatus || co?.orderBreakdown?.paymentStatus || '';
  const code = String(co?.holdStatusCode || '');
  const heldStatuses = new Set(['held', 'pending_payment', 'pending', 'authorized']);
  if (heldStatuses.has(String(status).toLowerCase())) return true;
  if (code === '11') return true; // payment gateway code for authorized/held
  return false;
};

const IndependentOrderDetail = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});

  // Per-community computed data
  const [communityOrdersMap, setCommunityOrdersMap] = useState({}); // { community: [customerOrderDocs] }
  const [itemsByCommunity, setItemsByCommunity] = useState({}); // { community: [{name, option, qty, amount}] }
  const [statsByCommunity, setStatsByCommunity] = useState({}); // { community: { totalHeld, numHeld, min, totalAmount, totalCount } }

  const refreshOrder = async () => {
    setLoading(true);
    try {
      const orderRef = doc(db, 'IndependentOrders', id);
      const snap = await getDoc(orderRef);
      if (!snap.exists()) { setOrder(null); setLoading(false); return; }
      const data = { id: snap.id, ...snap.data() };
      setOrder(data);
    } catch (e) {
      console.error('Failed load order', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    refreshOrder();
  }, [id]);

  // Helper: aggregate items
  const aggregateItems = (customerOrders = []) => {
    const map = new Map(); // key: name|option -> { name, option, qty, amount }
    for (const co of customerOrders) {
      const items = Array.isArray(co.items) ? co.items : [];
      for (const it of items) {
        if (it.isShipping) continue;
        const option = it.selectedOption || '';
        const name = it.productName || it.name || 'פריט';
        const key = `${name}|${option}`;
        const prev = map.get(key) || { name, option, qty: 0, amount: 0 };
        const qty = Number(it.quantity || 0);
        const lineTotal = Number(it.price || 0) * qty;
        prev.qty += qty;
        prev.amount += lineTotal;
        map.set(key, prev);
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  };

  // Load all customer orders per community and compute items + fallback stats
  useEffect(() => {
    const compute = async () => {
      if (!order) return;
      console.log('Order data:', order);
      console.log('totalHeldByCommunity:', order.totalHeldByCommunity);
      console.log('numHeldByCommunity:', order.numHeldByCommunity);
      
      const byCommunityRaw = order.customerOrderIdsByCommunity || {};

      const mapCO = {};
      const mapItems = {};
      const mapStats = {};

      // Build normalized community map also using pickupSpot fallback
      const allEntries = Object.entries(byCommunityRaw);
      for (const [community, ids] of allEntries) {
        const idList = Array.isArray(ids) ? ids : [];
        const fetches = idList.map(coId => getDoc(doc(db, 'IndepentCustomerOrders', coId)).catch(() => null));
        const snaps = await Promise.all(fetches);
        const coDocs = snaps.filter(s => s && s.exists()).map(s => ({ id: s.id, ...s.data() }));

        // In case some CO belong to a different community because of late updates, include them
        const normalized = {};
        for (const co of coDocs) {
          const spot = co?.customerDetails?.pickupSpot || community;
          if (!normalized[spot]) normalized[spot] = [];
          normalized[spot].push(co);
        }

        // Reduce per normalized community
        for (const [normCommunity, list] of Object.entries(normalized)) {
          const prevList = mapCO[normCommunity] || [];
          mapCO[normCommunity] = prevList.concat(list);
        }
      }

      // Compute items and stats per final community key
      // Fix: Access nested Firestore objects properly
      const preHeldMap = order.totalHeldByCommunity || {};
      const preNumMap = order.numHeldByCommunity || {};
      const minByCommunity = order.minAmountByCommunity || {};

      console.log('Communities found:', Object.keys(mapCO));
      console.log('preHeldMap:', preHeldMap);
      console.log('preNumMap:', preNumMap);

      for (const [community, coList] of Object.entries(mapCO)) {
        mapItems[community] = aggregateItems(coList);

        // Stats: prefer precomputed totals, else derive
        const preHeld = Number(preHeldMap[community] ?? NaN);
        const preNum = Number(preNumMap[community] ?? NaN);
        console.log(`Community ${community}: preHeld=${preHeld}, preNum=${preNum}`);
        
        let totalHeld = Number.isFinite(preHeld) ? preHeld : coList.reduce((sum, co) => {
          return sum + (isHeldLike(co) ? Number(co.holdSum || co.grandTotal || 0) : 0);
        }, 0);
        let numHeld = Number.isFinite(preNum) ? preNum : coList.reduce((acc, co) => acc + (isHeldLike(co) ? 1 : 0), 0);
        const totalAmount = coList.reduce((sum, co) => sum + Number(co.grandTotal || co.holdSum || 0), 0);
        const totalCount = coList.length;
        const min = Number(minByCommunity[community] ?? order.minAmount ?? order.minCommunityTotal ?? 0);

        console.log(`Final stats for ${community}:`, { totalHeld, numHeld, min, totalAmount, totalCount });
        mapStats[community] = { totalHeld, numHeld, min, totalAmount, totalCount };
      }

      setCommunityOrdersMap(mapCO);
      setItemsByCommunity(mapItems);
      setStatsByCommunity(mapStats);
    };
    compute();
  }, [order]);

  const volunteersByCommunity = useMemo(() => {
    const out = {};
    const arr = Array.isArray(order?.volunteers) ? order.volunteers : [];
    for (const v of arr) {
      const c = v.community || 'אחר';
      if (!out[c]) out[c] = [];
      out[c].push(v);
    }
    return out;
  }, [order]);

  const handleAccept = async (community) => {
    if (!order) return;
    const min = statsByCommunity?.[community]?.min ?? 0;
    const held = statsByCommunity?.[community]?.totalHeld ?? 0;
    if (Number(held) < Number(min)) {
      Swal.fire({ icon: 'info', title: 'לא ניתן לאשר', text: 'הסכום המוחזק בקהילה קטן מהמינימום שנקבע.' });
      return;
    }
    try {
      setBusy((b) => ({ ...b, [community]: true }));
      await acceptCommunityPayment({ orderId: order.id, community });
      Swal.fire({ icon: 'success', title: 'אושר', text: 'התשלום לקהילה אושר.' });
      await refreshOrder();
    } catch (e) {
      console.error(e);
      Swal.fire({ icon: 'error', title: 'שגיאה', text: 'האישור נכשל.' });
    } finally {
      setBusy((b) => ({ ...b, [community]: false }));
    }
  };

  const handleCancel = async (community) => {
    if (!order) return;
    try {
      setBusy((b) => ({ ...b, [community]: true }));
      await cancelCommunityPayment({ orderId: order.id, community });
      Swal.fire({ icon: 'success', title: 'בוטל', text: 'התשלום לקהילה בוטל.' });
      await refreshOrder();
    } catch (e) {
      console.error(e);
      Swal.fire({ icon: 'error', title: 'שגיאה', text: 'הביטול נכשל.' });
    } finally {
      setBusy((b) => ({ ...b, [community]: false }));
    }
  };

  if (loading || !order) return <LoadingSpinner />;

  const byCommunity = Object.keys(statsByCommunity).length > 0 ? statsByCommunity : (order.customerOrderIdsByCommunity || {});
  const sortedCommunities = Object.keys(byCommunity).sort((a, b) => a.localeCompare(b));

  return (
    <div dir="rtl" className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">{order.orderName || order.id}</h1>
      <div className="text-gray-600 mb-6">פירוט לפי קהילה</div>

      {sortedCommunities.length === 0 ? (
        <div className="bg-white rounded shadow p-6">אין הזמנות לפי קהילה</div>
      ) : (
                  <div className="space-y-6">
            {sortedCommunities.map((community) => {
              const stats = statsByCommunity[community] || { totalHeld: 0, numHeld: 0, min: order.minAmount ?? order.minCommunityTotal ?? 0, totalAmount: 0, totalCount: 0 };
              const canAccept = Number(stats.totalHeld) >= Number(stats.min);
            const volunteerList = volunteersByCommunity[community] || [];
            const items = itemsByCommunity[community] || [];
            return (
              <div key={community} className="bg-white rounded shadow p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold">{community}</div>
                    <div className="text-sm text-gray-600">מינימום: {currency(stats.min)} | מוחזק: {currency(stats.totalHeld)} | לקוחות מוחזקים: {stats.numHeld} | לקוחות סה"כ: {stats.totalCount}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={!canAccept || busy[community]}
                      onClick={() => handleAccept(community)}
                      className={`px-3 py-1 rounded text-sm text-white ${canAccept ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300 cursor-not-allowed'}`}
                    >אשר</button>
                    <button
                      disabled={busy[community]}
                      onClick={() => handleCancel(community)}
                      className={`px-3 py-1 rounded text-sm text-white ${busy[community] ? 'bg-gray-300' : 'bg-red-600 hover:bg-red-700'}`}
                    >בטל</button>
                  </div>
                </div>

                {/* Volunteers */}
                <div className="mt-3">
                  <div className="text-sm font-semibold mb-1">מתנדבים</div>
                  {volunteerList.length === 0 ? (
                    <div className="text-xs text-gray-500">אין מתנדבים בקהילה זו</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {volunteerList.map((v) => (
                        <div key={v.id} className="border rounded p-3 text-sm">
                          <div className="font-medium">{v.fullName || 'מתנדב'}</div>
                          <div className="text-gray-600">טלפון: {v.phone || '-'}</div>
                          <div className="text-gray-600">כתובת: {v.address || '-'}</div>
                          {v.locationInstructions ? (
                            <div className="text-gray-600">הנחיות: {v.locationInstructions}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Items summary */}
                <div className="mt-4">
                  <div className="text-sm font-semibold mb-2">סיכום פריטים להזמנה בקהילה</div>
                  {items.length === 0 ? (
                    <div className="text-xs text-gray-500">אין פריטים להצגה</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="text-gray-600">
                            <th className="text-right py-2 pr-2">פריט</th>
                            <th className="text-right py-2 pr-2">אופציה</th>
                            <th className="text-right py-2 pr-2">כמות</th>
                            <th className="text-right py-2 pr-2">סכום</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((row, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="py-1 pr-2">{row.name}</td>
                              <td className="py-1 pr-2">{row.option || '-'}</td>
                              <td className="py-1 pr-2">{row.qty}</td>
                              <td className="py-1 pr-2">{currency(row.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default IndependentOrderDetail; 