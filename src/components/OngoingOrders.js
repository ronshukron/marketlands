// src/components/OngoingOrders.js

import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
// import './OngoingOrders.css';
import LoadingSpinner from './LoadingSpinner';
import { Link, useNavigate } from 'react-router-dom';

const OngoingOrders = () => {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState('הכל');
  const [specialOrders, setSpecialOrders] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchOngoingOrders();
  }, []);

  useEffect(() => {
    filterOrdersByRegion();
  }, [selectedRegion, orders]);

  const fetchOngoingOrders = async () => {
    setLoading(true);
    try {
      const currentTime = new Date();
      const adjustedCurrentTime = new Date(currentTime.getTime() + 60 * 60 * 1000); // Add 1 hour

      const q = query(collection(db, 'Orders'));
      const querySnapshot = await getDocs(q);

      const ordersData = [];
      const specialOrdersData = [];
      
      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        const endingTime = data.Ending_Time || data.endingTime;
        let orderType = data.orderType;
        if (!orderType) {
          if (data.schedule) {
            orderType = 'recurring';
          } else if (endingTime) {
            orderType = 'one_time';
          } else {
            orderType = 'unknown';
          }
        }
        const schedule = data.schedule; // For recurring orders

        let isActive = false;

        if (orderType === 'one_time') {
          if (endingTime && endingTime.toDate() > adjustedCurrentTime) {
            isActive = true;
          }
        } else if (orderType === 'recurring') {
          if (schedule && isOrderActiveNow(schedule)) {
            isActive = true;
          }
        } else {
          // Skip unknown order types
          continue;
        }

        if (isActive) {
          let order = {
            id: docSnap.id,
            ...data,
          };

          // Determine if this is a special order from shukron60@gmail.com
          const isSpecialOrder = data.businessEmail === 'shukron60@gmail.com';

          if (order.Producer_ID) {
            // Farmer order
            const producerDocRef = doc(db, 'Producers', order.Producer_ID);
            const producerDocSnap = await getDoc(producerDocRef);
            let producerData = {};
            if (producerDocSnap.exists()) {
              producerData = producerDocSnap.data();
            }
            order = {
              ...order,
              type: 'farmer',
              producerData,
            };
          } else if (order.businessId) {
            // Business order
            order = {
              ...order,
              type: 'business',
              isSpecialOrder,
            };
            // Image is in order.imageUrl
          } else {
            // Unknown order type
            continue; // Skip this order
          }

          // Sort special orders separately
          if (isSpecialOrder) {
            specialOrdersData.push(order);
          } else {
            ordersData.push(order);
          }
        }
      }

      // Set both regular and special orders
      setOrders([...ordersData]);
      setSpecialOrders(specialOrdersData);
    } catch (error) {
      console.error('Error fetching ongoing orders: ', error);
    } finally {
      setLoading(false);
    }
  };

  const isOrderActiveNow = (schedule) => {
    const now = new Date();
    const currentDayIndex = now.getDay(); // Sunday - Saturday : 0 - 6
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight

    // Map of days to indices (adjusted for Hebrew days)
    const dayIndexMap = {
      0: ['Sunday', 'ראשון'],
      1: ['Monday', 'שני'],
      2: ['Tuesday', 'שלישי'],
      3: ['Wednesday', 'רביעי'],
      4: ['Thursday', 'חמישי'],
      5: ['Friday', 'שישי'],
      6: ['Saturday', 'שבת'],
    };

    const dayNames = dayIndexMap[currentDayIndex];

    const daySchedule = schedule.find((day) => dayNames.includes(day.day));

    if (daySchedule && daySchedule.active) {
      const [startHour, startMinute] = daySchedule.startTime.split(':').map(Number);
      const [endHour, endMinute] = daySchedule.endTime.split(':').map(Number);

      let startTimeInMinutes = startHour * 60 + startMinute;
      let endTimeInMinutes = endHour * 60 + endMinute;

      // Handle cases where end time is past midnight
      if (endTimeInMinutes <= startTimeInMinutes) {
        endTimeInMinutes += 24 * 60;
      }

      // Adjust current time if necessary
      let adjustedCurrentTime = currentTime;
      if (currentTime < startTimeInMinutes) {
        adjustedCurrentTime += 24 * 60;
      }

      return adjustedCurrentTime >= startTimeInMinutes && adjustedCurrentTime <= endTimeInMinutes;
    } else {
      return false;
    }
  };

  const filterOrdersByRegion = () => {
    if (selectedRegion === 'הכל') {
      setFilteredOrders([...orders, ...specialOrders]);
    } else {
      const filtered = [
        ...orders.filter((order) => {
          if (order.isFarmerOrder === true) {
            return order.areas?.includes(selectedRegion);
          } else if (order.isFarmerOrder === false) {
            return selectedRegion === 'הכל' || order.region === selectedRegion;
          }
          return false;
        }),
        ...specialOrders.filter((order) => {
          // Apply the same filtering logic to special orders
          if (order.isFarmerOrder === true) {
            return order.areas?.includes(selectedRegion);
          } else if (order.isFarmerOrder === false) {
            return selectedRegion === 'הכל' || order.region === selectedRegion;
          }
          return false;
        })
      ];
      setFilteredOrders(filtered);
    }
  };

  const calculateTimeRemaining = (order) => {
    let orderType = order.orderType;
    if (!orderType) {
      if (order.schedule) {
        orderType = 'recurring';
      } else if (order.Ending_Time || order.endingTime) {
        orderType = 'one_time';
      } else {
        orderType = 'unknown';
      }
    }

    const now = new Date();

    if (orderType === 'one_time') {
      const endingTime = order.Ending_Time || order.endingTime;
      if (endingTime) {
        const end = endingTime.toDate();
        const adjustedEndTime = new Date(end.getTime() - 60 * 60 * 1000); // Adjust if needed
        const diff = adjustedEndTime - now;
        if (diff <= 0) {
          return 'ההזמנה הסתיימה';
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);

        let timeString = '';
        if (days > 0) timeString += `${days} ימים `;
        if (hours > 0) timeString += `${hours} שעות `;
        if (minutes > 0) timeString += `${minutes} דקות`;

        return timeString || 'פחות מדקה';
      } else {
        return 'תאריך סיום לא זמין';
      }
    } else if (orderType === 'recurring') {
      const schedule = order.schedule;
      if (schedule) {
        const isActive = isOrderActiveNow(schedule);
        return isActive ? 'פעיל כעת' : 'לא פעיל כעת';
      } else {
        return 'לוח זמנים לא זמין';
      }
    } else {
      return 'סוג הזמנה לא ידוע';
    }
  };

  // Handle click based on order type
  const handleOrderClick = (order, e) => {
    e.preventDefault(); // Prevent default Link behavior
    
    if (order.isSpecialOrder) {
      // Navigate to the new page for special orders
      navigate(`/external-order/${order.id}`);
    } else {
      // Navigate to normal order form
      navigate(order.type === 'farmer' ? `/order-form/${order.id}` : `/order-form-business/${order.id}`);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div dir="rtl" className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-center mb-4">דפי מכירה פעילים </h1>
      
      <div className="mb-4 flex justify-center items-center gap-2">
        <label htmlFor="region-filter" className="text-gray-700 text-sm">
          סנן לפי אזור:
        </label>
        <select
          id="region-filter"
          value={selectedRegion}
          onChange={(e) => setSelectedRegion(e.target.value)}
          className="bg-white border border-gray-300 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="הכל">הכל</option>
          <option value="צפון">צפון</option>
          <option value="מרכז">מרכז</option>
          <option value="דרום">דרום</option>
          <option value="שפלה">שפלה</option>
        </select>
      </div>

      {filteredOrders.length === 0 ? (
        <p className="text-center text-gray-600 text-sm">אין הזמנות פעילות באזור שנבחר.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              onClick={(e) => handleOrderClick(order, e)}
              className={`bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300 cursor-pointer
                ${order.isSpecialOrder ? 'border-2 border-yellow-400' : ''}`}
            >
              <div className="relative pt-[50%]">
                {((order.type === 'farmer' && order.producerData?.Image) || 
                  (order.type === 'business' && order.imageUrl)) && (
                  <img
                    src={order.type === 'farmer' ? order.producerData.Image : order.imageUrl}
                    alt={order.type === 'farmer' ? order.Producer_Name : order.businessName}
                    className="absolute top-0 left-0 w-full h-full object-cover"
                  />
                )}
                
                {/* Badge for special orders */}
                {order.isSpecialOrder && (
                  <div className="absolute top-2 right-2 bg-yellow-400 text-yellow-800 text-xs px-2 py-1 rounded-full">
                    דף מכירה חיצוני
                  </div>
                )}
              </div>

              <div className="p-2">
                <h3 className="text-base font-semibold mb-1 text-gray-900">
                  {order.Order_Name || order.orderName}
                </h3>

                {order.type === 'farmer' ? (
                  <div className="space-y-0 leading-3">
                    <p className="text-xs text-gray-700">
                      <span className="font-medium">ספק:</span> {order.Producer_Name}
                    </p>
                    {order.producerData?.Kind && (
                      <p className="text-xs text-gray-700">
                        <span className="font-medium">סוג ספק:</span> {order.producerData.Kind}
                      </p>
                    )}
                    {order.Coordinator_Region && (
                      <p className="text-xs text-gray-700">
                        <span className="font-medium">אזור:</span> {order.Coordinator_Region}
                      </p>
                    )}
                    {order.Coordinator_Community && (
                      <p className="text-xs text-gray-700">
                        <span className="font-medium">קהילה:</span> {order.Coordinator_Community}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-0 leading-3">
                    <p className="text-xs text-gray-700">
                      <span className="font-medium">עסק:</span> {order.businessName}
                    </p>
                    {order.businessKind && (
                      <p className="text-xs text-gray-700">
                        <span className="font-medium">סוג עסק:</span> {order.businessKind}
                      </p>
                    )}
                    {order.region && (
                      <p className="text-xs text-gray-700">
                        <span className="font-medium">אזור חלוקה:</span> {order.areas?.join(', ')}
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-1 pt-1 border-t border-gray-200">
                  <p className="text-xs text-gray-700">
                    <span className="font-medium">זמן שנותר:</span>{' '}
                    <span className="text-red-600">{calculateTimeRemaining(order)}</span>
                  </p>
                  
                  {/* Additional info for special orders */}
                  {order.isSpecialOrder && (
                    <p className="text-xs text-yellow-600 font-semibold mt-1">
                      דף מכירה מפרסום חיצוני - לחץ לפרטים
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OngoingOrders;
