import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { format } from 'date-fns';
import { pickupSpots } from '../../data/pickupSpots';

const AbandonedCarts = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState('All');
  
  // Admin UIDs
  const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

  useEffect(() => {
    if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
      setError("You are not authorized to view this page");
      setLoading(false);
      return;
    }
    fetchAvailableWeeks();
  }, [currentUser]);

  useEffect(() => {
    if (selectedWeek) {
      fetchWeeklyOrders();
    }
  }, [selectedWeek]);

  const fetchAvailableWeeks = async () => {
    setLoading(true);
    try {
      const ordersRef = collection(db, 'Orders');
      const ordersSnapshot = await getDocs(ordersRef);
      const weeksSet = new Set();
      
      ordersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const endingTime = data.Ending_Time || data.endingTime;
        if (endingTime) {
          let endDate = endingTime.toDate ? endingTime.toDate() : new Date(endingTime);
          const sunday = new Date(endDate);
          sunday.setDate(endDate.getDate() - endDate.getDay());
          sunday.setHours(0, 0, 0, 0);
          weeksSet.add(sunday.toISOString().split('T')[0]);
        }
      });
      
      const sortedWeeks = Array.from(weeksSet).sort((a, b) => new Date(b) - new Date(a));
      setAvailableWeeks(sortedWeeks);
      if (sortedWeeks.length > 0) setSelectedWeek(sortedWeeks[0]);
    } catch (err) {
      console.error("Error fetching weeks:", err);
      setError("Failed to load weeks");
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
      
      const startDateISO = sunday.toISOString();
      const endDateISO = friday.toISOString();
      
      const ordersRef = collection(db, 'customerOrders');
      const snapshot = await getDocs(ordersRef);
      
      const validOrders = [];
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        // Only include abandoned/incomplete orders
        if (data.paymentStatus === 'completed') return;
        
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        const createdISO = createdAt.toISOString();
        
        if (createdISO >= startDateISO && createdISO <= endDateISO) {
          validOrders.push({ id: doc.id, ...data, createdAt });
        }
      });

      // Sort by creation time (newest first)
      validOrders.sort((a, b) => b.createdAt - a.createdAt);
      setOrders(validOrders);
    } catch (err) {
      console.error("Error fetching orders:", err);
      setError("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  // Group orders by community
  const groupedOrders = orders.reduce((acc, order) => {
    const spot = order.customerDetails?.pickupSpot || 'Unknown';
    if (!acc[spot]) acc[spot] = [];
    acc[spot].push(order);
    return acc;
  }, {});

  // Filter displayed communities
  const displaySpots = selectedCommunity === 'All' 
    ? Object.keys(groupedOrders).sort() 
    : [selectedCommunity];

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-8 text-red-600 text-center">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8" dir="rtl">
      <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">עגלות נטושות (הזמנות שלא הושלמו)</h1>
      
      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-6 mb-8 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="w-full md:w-1/3">
          <label className="block text-sm font-medium text-gray-700 mb-1">שבוע:</label>
          <select 
            value={selectedWeek} 
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
          >
            {availableWeeks.map(week => {
               const d = new Date(week);
               return <option key={week} value={week}>{format(d, 'dd/MM/yyyy')} (שבוע של)</option>;
            })}
          </select>
        </div>
        
        <div className="w-full md:w-1/3">
          <label className="block text-sm font-medium text-gray-700 mb-1">נקודת חלוקה:</label>
          <select 
            value={selectedCommunity} 
            onChange={(e) => setSelectedCommunity(e.target.value)}
            className="w-full border-gray-300 rounded-md shadow-sm p-2 border"
          >
            <option value="All">הכל</option>
            {pickupSpots.map(spot => (
              <option key={spot} value={spot}>{spot}</option>
            ))}
          </select>
        </div>

        <div className="w-full md:w-1/3 flex items-end">
           <div className="bg-red-50 text-red-700 px-4 py-2 rounded-md text-sm">
             סה"כ עגלות נטושות: {orders.length}
           </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-8">
        {displaySpots.map(spot => {
          const spotOrders = groupedOrders[spot] || [];
          if (spotOrders.length === 0) return null;

          return (
            <div key={spot} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-gray-800 text-white px-6 py-4 flex justify-between items-center">
                <h2 className="text-xl font-bold">{spot}</h2>
                <span className="bg-gray-700 px-3 py-1 rounded-full text-sm">{spotOrders.length} עגלות</span>
              </div>
              
              <div className="divide-y divide-gray-200">
                {spotOrders.map(order => {
                   return (
                     <div key={order.id} className="p-6 hover:bg-gray-50 transition-colors">
                       <div className="flex flex-col md:flex-row justify-between gap-4">
                         {/* Customer Info */}
                         <div className="flex-1">
                           <div className="flex items-center gap-3 mb-2">
                             <h3 className="text-lg font-bold text-gray-900">
                               {order.customerDetails?.name || 'אורח (לא הוזן שם)'}
                             </h3>
                             <span className="bg-red-100 text-red-800 text-xs font-semibold px-2.5 py-0.5 rounded border border-red-200">
                               {order.paymentStatus === 'pending' ? 'ממתין לתשלום' : order.paymentStatus || 'לא ידוע'}
                             </span>
                           </div>
                           
                           <div className="text-gray-600 space-y-1">
                             {order.customerDetails?.phone && (
                               <p>📞 <a href={`tel:${order.customerDetails?.phone}`} className="hover:underline">{order.customerDetails?.phone}</a></p>
                             )}
                             {order.customerDetails?.email && (
                               <p>📧 {order.customerDetails?.email}</p>
                             )}
                           </div>
                         </div>

                         {/* Order Summary */}
                         <div className="flex-1 md:border-r md:border-gray-200 md:pr-6">
                           <h4 className="font-semibold text-gray-700 mb-2">תוכן העגלה:</h4>
                           <ul className="space-y-1 text-sm text-gray-600">
                             {order.orderBreakdown && Object.values(order.orderBreakdown).map((bizOrder, idx) => (
                               <li key={idx} className="mb-2">
                                 <span className="font-medium text-gray-800 block">{bizOrder.businessName}:</span>
                                 <ul className="list-disc list-inside pr-2">
                                    {bizOrder.items?.map((item, i) => (
                                      <li key={i}>
                                        {item.quantity}x {item.productName} 
                                        {item.selectedOption && item.selectedOption !== 'None' && ` (${item.selectedOption})`}
                                      </li>
                                    ))}
                                 </ul>
                               </li>
                             ))}
                           </ul>
                         </div>
                         
                         {/* Meta / Status */}
                         <div className="w-full md:w-40 flex flex-col gap-2 text-sm">
                            <div className="text-gray-500">
                              נוצר: {format(order.createdAt, 'dd/MM HH:mm')}
                            </div>
                            <div className="font-bold text-gray-900">
                              סה"כ: ₪{order.grandTotal?.toFixed(2)}
                            </div>
                         </div>
                       </div>
                     </div>
                   );
                })}
              </div>
            </div>
          );
        })}
        
        {displaySpots.length === 0 && (
           <div className="text-center py-12 text-gray-500">
             לא נמצאו עגלות נטושות לקהילה שנבחרה בשבוע זה.
           </div>
        )}
      </div>
    </div>
  );
};

export default AbandonedCarts;
