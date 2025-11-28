import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { format } from 'date-fns';
import { pickupSpots } from '../../data/pickupSpots';

const Deliveries = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState('All');
  
  // Admin UIDs
  const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

  // Persistent customer numbering state
  // Structure: { [weekKey]: { [community]: { [customerId]: number } } }
  const [customerNumbers, setCustomerNumbers] = useState({});

  useEffect(() => {
    if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
      setError("You are not authorized to view this page");
      setLoading(false);
      return;
    }
    fetchAvailableWeeks();
    loadCustomerNumbers();
  }, [currentUser]);

  useEffect(() => {
    if (selectedWeek) {
      fetchWeeklyOrders();
    }
  }, [selectedWeek]);

  const loadCustomerNumbers = () => {
    try {
      const saved = localStorage.getItem('deliveryCustomerNumbers');
      if (saved) {
        setCustomerNumbers(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Error loading customer numbers", e);
    }
  };

  const saveCustomerNumbers = (newNumbers) => {
    setCustomerNumbers(newNumbers);
    localStorage.setItem('deliveryCustomerNumbers', JSON.stringify(newNumbers));
  };

  const getCustomerNumber = (week, community, orderId) => {
    if (!customerNumbers[week]) return null;
    if (!customerNumbers[week][community]) return null;
    return customerNumbers[week][community][orderId] || null;
  };

  const assignCustomerNumbers = (week, community, communityOrders) => {
    const newNumbers = { ...customerNumbers };
    if (!newNumbers[week]) newNumbers[week] = {};
    if (!newNumbers[week][community]) newNumbers[week][community] = {};

    let nextNum = 1;
    // Find max existing number to append correctly if needed, 
    // but usually we just want to number them sequentially if not present
    const existingValues = Object.values(newNumbers[week][community]);
    if (existingValues.length > 0) {
      nextNum = Math.max(...existingValues) + 1;
    } else {
        nextNum = 1;
    }

    let changed = false;
    // Sort orders by name or creation time to have deterministic order if possible
    // Here we rely on the passed order (sorted by date usually)
    communityOrders.forEach(order => {
      if (!newNumbers[week][community][order.id]) {
        newNumbers[week][community][order.id] = nextNum++;
        changed = true;
      }
    });

    if (changed) {
      saveCustomerNumbers(newNumbers);
    }
  };

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
        if (data.paymentStatus !== 'completed') return;
        
        // Only include orders with home delivery
        if (data.customerDetails?.deliveryOption !== 'homeDelivery') return;
        
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        const createdISO = createdAt.toISOString();
        
        if (createdISO >= startDateISO && createdISO <= endDateISO) {
          validOrders.push({ id: doc.id, ...data, createdAt });
        }
      });

      // Sort by customer name
      validOrders.sort((a, b) => (a.customerDetails?.name || '').localeCompare(b.customerDetails?.name || ''));
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

  // Auto-assign numbers when rendering
  useEffect(() => {
    if (orders.length > 0 && selectedWeek) {
      Object.entries(groupedOrders).forEach(([spot, spotOrders]) => {
        assignCustomerNumbers(selectedWeek, spot, spotOrders);
      });
    }
  }, [orders, selectedWeek]);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-8 text-red-600 text-center">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8" dir="rtl">
      <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">ניהול משלוחים וחלוקה</h1>
      
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
           <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-md text-sm">
             סה"כ הזמנות: {orders.length}
           </div>
        </div>
      </div>

      {/* Deliveries List */}
      <div className="space-y-8">
        {displaySpots.map(spot => {
          const spotOrders = groupedOrders[spot] || [];
          if (spotOrders.length === 0) return null;

          return (
            <div key={spot} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-gray-800 text-white px-6 py-4 flex justify-between items-center">
                <h2 className="text-xl font-bold">{spot}</h2>
                <span className="bg-gray-700 px-3 py-1 rounded-full text-sm">{spotOrders.length} הזמנות</span>
              </div>
              
              <div className="divide-y divide-gray-200">
                {spotOrders.map(order => {
                   const num = getCustomerNumber(selectedWeek, spot, order.id) || '-';
                   const isDelivery = order.customerDetails?.deliveryOption === 'homeDelivery';
                   
                   return (
                     <div key={order.id} className={`p-6 hover:bg-gray-50 transition-colors ${isDelivery ? 'bg-blue-50' : ''}`}>
                       <div className="flex flex-col md:flex-row justify-between gap-4">
                         {/* Customer Info */}
                         <div className="flex-1">
                           <div className="flex items-center gap-3 mb-2">
                             <span className="flex items-center justify-center w-8 h-8 bg-gray-900 text-white font-bold rounded-full text-sm">
                               #{num}
                             </span>
                             <h3 className="text-lg font-bold text-gray-900">
                               {order.customerDetails?.name}
                             </h3>
                             {isDelivery && (
                               <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded border border-blue-200">
                                 משלוח עד הבית
                               </span>
                             )}
                           </div>
                           
                           <div className="text-gray-600 space-y-1 mr-11">
                             <p>📞 <a href={`tel:${order.customerDetails?.phone}`} className="hover:underline">{order.customerDetails?.phone}</a></p>
                             {isDelivery && (
                               <div className="mt-2 bg-white p-3 rounded border border-blue-100">
                                 <p className="font-semibold text-gray-800">📍 כתובת למשלוח:</p>
                                 <p>{order.customerDetails?.address}</p>
                                 {order.customerDetails?.directions && (
                                   <p className="text-sm text-gray-500 mt-1">📝 {order.customerDetails.directions}</p>
                                 )}
                               </div>
                             )}
                           </div>
                         </div>

                         {/* Order Summary */}
                         <div className="flex-1 md:border-r md:border-gray-200 md:pr-6">
                           <h4 className="font-semibold text-gray-700 mb-2">סיכום הזמנה:</h4>
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
                              {format(order.createdAt, 'dd/MM HH:mm')}
                            </div>
                            <div className="font-bold text-gray-900">
                              ₪{order.grandTotal?.toFixed(2)}
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
             לא נמצאו הזמנות לקהילה שנבחרה בשבוע זה.
           </div>
        )}
      </div>
    </div>
  );
};

export default Deliveries;

