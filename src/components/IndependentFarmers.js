import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, getDoc, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import LoadingSpinner from './LoadingSpinner';
import { useNavigate } from 'react-router-dom';
import { pickupSpots } from '../data/pickupSpots';
import ThresholdProgressBar from './independent/components/ThresholdProgressBar';
import { useAuth } from '../contexts/authContext';
import { isVolunteerAvailableForCommunity, isAnyVolunteerAvailable } from '../services/volunteerService';

const IndependentFarmers = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const { userLoggedIn, currentUser } = useAuth();
  const [isMerchant, setIsMerchant] = useState(false);
  const [selectedPickupSpot, setSelectedPickupSpot] = useState(() => {
    return localStorage.getItem('selectedPickupSpot') || '';
  });
  const navigate = useNavigate();

  // Default to user's community if logged in and no explicit selection
  useEffect(() => {
    if (!selectedPickupSpot) {
      const userCommunity = (currentUser?.communityName || '').trim();
      const initial = userLoggedIn && userCommunity && userCommunity !== 'הכל' ? userCommunity : 'הכל';
      setSelectedPickupSpot(initial);
    }
  }, [userLoggedIn, currentUser, selectedPickupSpot]);

  useEffect(() => {
    if (selectedPickupSpot) {
      localStorage.setItem('selectedPickupSpot', selectedPickupSpot);
    } else {
      localStorage.removeItem('selectedPickupSpot');
    }
  }, [selectedPickupSpot]);

  useEffect(() => {
    const fetchIndependentOrders = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'IndependentOrders'));
        const qs = await getDocs(q);
        const items = [];
        const currentTime = new Date();
        
        for (const d of qs.docs) {
          const data = d.data();
          
          // Skip orders that are not open (canceled/closed/etc.)
          if (data.status && data.status !== 'open') {
            continue;
          }
          
          // Filter out orders that have passed their endingTime
          const endingTime = data.endingTime;
          let endDate = null;
          if (endingTime) {
            endDate = endingTime.toDate ? endingTime.toDate() : new Date(endingTime);
            if (endDate <= currentTime) {
              continue; // Skip expired orders
            }
          }
          
          // hydrate business
          let business = null;
          if (data.businessId) {
            const bizRef = doc(db, 'businesses', data.businessId);
            const bizSnap = await getDoc(bizRef);
            business = bizSnap.exists() ? bizSnap.data() : null;
          }
          // check volunteers across farmer commitments (any community) and ensure coverage through order ending
          const hasVolunteer = await isAnyVolunteerAvailable({ businessId: data.businessId, requiredEndIso: endDate ? endDate.toISOString() : undefined });

          // Compute price range for display (merchant-aware)
          let priceRange = null;
          try {
            const selectedProductIds = Array.isArray(data.selectedProducts) ? data.selectedProducts.slice(0, 10) : [];
            if (selectedProductIds.length > 0) {
              const productsSnap = await getDocs(query(collection(db, 'Products'), where('__name__', 'in', selectedProductIds)));
              const prices = [];
              productsSnap.forEach(pDoc => {
                const p = pDoc.data();
                const base = Number(p.price || 0);
                const m = p.merchantPrice != null ? Number(p.merchantPrice) : null;
                prices.push(isMerchant && m != null ? m : base);
              });
              if (prices.length > 0) {
                const minP = Math.min(...prices);
                const maxP = Math.max(...prices);
                priceRange = { min: minP, max: maxP };
              }
            }
          } catch (e) {
            // ignore pricing failures
          }

          items.push({ id: d.id, ...data, business, hasVolunteer, priceRange });
        }
        setOrders(items);
      } catch (e) {
        console.error('Error fetching independent orders: ', e);
      } finally {
        setLoading(false);
      }
    };
    fetchIndependentOrders();
  }, []);

  useEffect(() => {
    const fetchIsMerchant = async () => {
      try {
        if (!currentUser?.uid) { setIsMerchant(false); return; }
        const uRef = doc(db, 'users', currentUser.uid);
        const uSnap = await getDoc(uRef);
        setIsMerchant(Boolean(uSnap.exists() && uSnap.data().isMerchant === true));
      } catch {
        setIsMerchant(false);
      }
    };
    fetchIsMerchant();
  }, [currentUser]);

  // Refresh per-order volunteer status for the selected pickup spot
  useEffect(() => {
    const updateVolunteerBySpot = async () => {
      if (!selectedPickupSpot || selectedPickupSpot === 'הכל') {
        // Clear spot-specific flag
        setOrders(prev => prev.map(o => ({ ...o, hasVolunteerBySpot: undefined })));
        return;
      }
      try {
        const updated = [];
        for (const o of orders) {
          const endDate = o.endingTime?.toDate ? o.endingTime.toDate() : (o.endingTime ? new Date(o.endingTime) : null);
          const ok = await isVolunteerAvailableForCommunity({ businessId: o.businessId, community: selectedPickupSpot, orderId: o.id, orderEndingIso: endDate ? endDate.toISOString() : undefined });
          updated.push({ ...o, hasVolunteerBySpot: ok });
        }
        setOrders(updated);
      } catch (e) {
        console.error('Error updating volunteer status by spot', e);
      }
    };
    updateVolunteerBySpot();
  }, [selectedPickupSpot, orders.length]);

  const handleClickOrder = (order) => {
    navigate(`/independent/order/${order.id}`, { state: { order } });
  };

  const filteredOrders = useMemo(() => {
    if (!selectedPickupSpot || selectedPickupSpot === 'הכל') return orders;
    return orders.filter(o => Array.isArray(o.pickupSpots) && o.pickupSpots.includes(selectedPickupSpot));
  }, [orders, selectedPickupSpot]);

  return (
    <div className="bg-white" dir="rtl">
      <div className="relative bg-gradient-to-r from-green-600 to-green-800 text-white overflow-hidden rounded-xl mb-8">
        <div className="px-6 py-10 relative z-10">
          <div className="mb-8">
            <h1 className="text-3xl md:text-5xl font-bold mb-2 text-center tracking-tight">חקלאים עצמאיים</h1>
            <div className="h-1 w-24 bg-yellow-400 mx-auto rounded-full mb-4"></div>
            <p className="text-green-100 text-center max-w-3xl mx-auto text-lg">מודעות מכירה של חקלאים עצמאיים</p>
          </div>
          <div className="max-w-xs mx-auto">
            <label className="block text-green-100 text-sm font-medium mb-2 text-center">אזור איסוף:</label>
            <div className="relative">
              <select
                value={selectedPickupSpot}
                onChange={(e) => setSelectedPickupSpot(e.target.value)}
                className="block w-full p-3 pr-10 text-right text-sm text-gray-900 bg-white bg-opacity-95 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 shadow-md appearance-none"
                dir="rtl"
              >
                <option value="הכל">הכל</option>
                {pickupSpots.map((spot) => (
                  <option key={spot} value={spot}>{spot}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64"><LoadingSpinner /></div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-2">אין מודעות עצמאיות זמינות</h3>
          <p className="text-gray-600">{selectedPickupSpot && selectedPickupSpot !== 'הכל' ? `לא נמצאו מודעות באזור ${selectedPickupSpot}` : 'לא נמצאו מודעות כרגע'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredOrders.map((order) => {
            const isAll = !selectedPickupSpot || selectedPickupSpot === 'הכל';
            const community = selectedPickupSpot;
            // Helper: get per-community value from nested map or dot-flattened field
            const getCommunityValue = (obj, baseKey, key) => {
              if (!obj || !baseKey || !key) return undefined;
              const nested = obj[baseKey];
              if (nested && typeof nested === 'object') {
                const val = nested[key];
                if (val !== undefined && val !== null) return val;
              }
              const flatKey = `${baseKey}.${key}`;
              if (Object.prototype.hasOwnProperty.call(obj, flatKey)) {
                return obj[flatKey];
              }
              return undefined;
            };

            const minFromMap = !isAll ? getCommunityValue(order, 'minAmountByCommunity', community) : 0;
            const minCommunityTotal = isAll
              ? 0
              : Number(minFromMap ?? order.minAmount ?? order.minCommunityTotal ?? 0);

            const heldFromMap = !isAll ? getCommunityValue(order, 'totalHeldByCommunity', community) : 0;
            const currentTotal = isAll
              ? 0
              : Number(heldFromMap ?? 0);

            const thresholdDeadline = order.endingTime?.toDate ? order.endingTime.toDate() : order.endingTime;
            const showHasVolunteer = (selectedPickupSpot && selectedPickupSpot !== 'הכל')
              ? order.hasVolunteerBySpot === true
              : order.hasVolunteer === true;
            return (
              <div key={order.id} onClick={() => handleClickOrder(order)} className="bg-white rounded-lg shadow.md overflow-hidden hover:shadow-lg transition-shadow duration-300 cursor-pointer border-2 border-green-200 hover:border-green-400">
                <div className="relative pt-[50%]">
                  {order.imageUrl && (
                    <img src={order.imageUrl} alt={order.orderName} className="absolute top-0 left-0 w-full h-full object-cover" />
                  )}
                  <div className={`absolute top-2 right-2 text-xs px-2 py-1 rounded-full ${showHasVolunteer ? 'bg-green-600 text-white' : 'bg-yellow-400 text-gray-900'}`}>
                    {showHasVolunteer ? 'יש נקודת איסוף' : 'דרוש מתנדב לנקודת איסוף'}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-semibold mb-2 text-gray-900">{order.orderName}</h3>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-2">{order.description}</p>
                 {order.priceRange && (
                   <p className="text-xs text-gray-700 mb-1">
                     טווח מחירים{isMerchant ? ' (סוחר)' : ''}: ₪{order.priceRange.min.toFixed(2)} - ₪{order.priceRange.max.toFixed(2)}
                   </p>
                 )}
                  {!isAll && (
                    <ThresholdProgressBar
                      minCommunityTotal={minCommunityTotal}
                      currentTotal={currentTotal}
                      thresholdDeadline={thresholdDeadline}
                    />
                  )}
                  <div className="mt-2 text-sm text-gray-700">
                    {order.shippingDateRange && (
                      <div>
                        <span className="font-medium">זמן אספקה:</span> {new Date(order.shippingDateRange.start).toLocaleDateString('he-IL')} - {new Date(order.shippingDateRange.end).toLocaleDateString('he-IL')}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-sm text-green-600 font-semibold">לחץ לצפייה ורכישה</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default IndependentFarmers; 