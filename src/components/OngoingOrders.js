// src/components/OngoingOrders.js

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  getDocs,
  doc,
  getDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
// import './OngoingOrders.css';
import LoadingSpinner from './LoadingSpinner';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { pickupSpots } from '../data/pickupSpots';

const OngoingOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [specialOrders, setSpecialOrders] = useState([]);
  const [selectedPickupSpot, setSelectedPickupSpot] = useState(() => {
    // Load from localStorage on first render
    return localStorage.getItem('selectedPickupSpot') || '';
  });
  const navigate = useNavigate();
  
  // Add search functionality
  const [searchTerm, setSearchTerm] = useState('');

  // Save to localStorage whenever selectedPickupSpot changes
  useEffect(() => {
    if (selectedPickupSpot) {
      localStorage.setItem('selectedPickupSpot', selectedPickupSpot);
    } else {
      localStorage.removeItem('selectedPickupSpot');
    }
  }, [selectedPickupSpot]);

  useEffect(() => {
    fetchOngoingOrders();
  }, []);

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

  const filterOrdersByPickupSpot = () => {
    if (selectedPickupSpot === "הכל") {
    console.log("selectedPickupSpot is all")
    } else {
      const filtered = [
        ...orders.filter((order) => {
          if (order.isFarmerOrder === true) {
            return order.pickupSpots?.includes(selectedPickupSpot);
          } else if (order.isFarmerOrder === false) {
            return selectedPickupSpot === "הכל" || order.pickupSpots?.includes(selectedPickupSpot);
          }
          return false;
        }),
        ...specialOrders.filter((order) => {
          // Apply the same filtering logic to special orders
          if (order.isFarmerOrder === true) {
            return order.pickupSpots?.includes(selectedPickupSpot);
          } else if (order.isFarmerOrder === false) {
            return selectedPickupSpot === "הכל" || order.pickupSpots?.includes(selectedPickupSpot);
          }
          return false;
        })
      ];
      
    }
  };

  // Add search functionality
  useEffect(() => {
    if (searchTerm.trim() === '') {
      filterOrdersByPickupSpot(); // Default filtering by pickup spot
    } else {
      const searchResults = orders.filter(order => {
        const orderName = order.Order_Name || order.orderName || '';
        const businessName = order.businessName || order.Producer_Name || '';
        const kind = order.businessKind || (order.producerData && order.producerData.Kind) || '';
        
        return orderName.toLowerCase().includes(searchTerm.toLowerCase()) || 
               businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
               kind.toLowerCase().includes(searchTerm.toLowerCase());
      });
      
    }
  }, [searchTerm, selectedPickupSpot, orders]);

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

  // Add filtering logic when fetching or displaying orders
  const filteredOrders = useMemo(() => {
    // If no pickup spot is selected (empty string) OR "הכל" (All) is selected, return all orders.
    if (!selectedPickupSpot || selectedPickupSpot === "הכל") {
      return orders; 
    }
    
    // Otherwise, filter orders based on the specific pickup spot
    return orders.filter(order => {
      // Assuming orders have a pickupSpots array or pickupSpots field
      return order.pickupSpots && order.pickupSpots.includes(selectedPickupSpot);
    });
  }, [orders, selectedPickupSpot]);

  return (
    <div className="bg-white" dir="rtl">
      {/* Enhanced Top Section */}
      <div className="relative bg-gradient-to-r from-blue-600 to-blue-800 text-white overflow-hidden rounded-xl mb-8">
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
            <path d="M32 16.58C26.76 16.58 22.5 12.32 22.5 7.08C22.5 6.67 22.15 6.33 21.75 6.33C21.35 6.33 21 6.67 21 7.08C21 13.1 25.98 18.08 32 18.08C32.4 18.08 32.75 17.73 32.75 17.33C32.75 16.93 32.4 16.58 32 16.58Z" fill="currentColor" />
            <path d="M41.25 6.33C40.85 6.33 40.5 6.67 40.5 7.08C40.5 12.32 36.24 16.58 31 16.58C30.6 16.58 30.25 16.93 30.25 17.33C30.25 17.73 30.6 18.08 31 18.08C37.02 18.08 42 13.1 42 7.08C42 6.67 41.65 6.33 41.25 6.33Z" fill="currentColor" />
            <path d="M31 47.42C36.24 47.42 40.5 51.68 40.5 56.92C40.5 57.33 40.85 57.67 41.25 57.67C41.65 57.67 42 57.33 42 56.92C42 50.9 37.02 45.92 31 45.92C30.6 45.92 30.25 46.27 30.25 46.67C30.25 47.07 30.6 47.42 31 47.42Z" fill="currentColor" />
            <path d="M32 45.92C25.98 45.92 21 50.9 21 56.92C21 57.33 21.35 57.67 21.75 57.67C22.15 57.67 22.5 57.33 22.5 56.92C22.5 51.68 26.76 47.42 32 47.42C32.4 47.42 32.75 47.07 32.75 46.67C32.75 46.27 32.4 45.92 32 45.92Z" fill="currentColor" />
            <path d="M47.42 31C47.42 36.24 51.68 40.5 56.92 40.5C57.33 40.5 57.67 40.15 57.67 39.75C57.67 39.35 57.33 39 56.92 39C51.68 39 47.42 34.74 47.42 29.5C47.42 29.1 47.07 28.75 46.67 28.75C46.27 28.75 45.92 29.1 45.92 29.5C45.92 29.5 45.92 31 47.42 31Z" fill="currentColor" />
            <path d="M57.67 23.25C57.67 22.85 57.33 22.5 56.92 22.5C51.68 22.5 47.42 18.24 47.42 13C47.42 12.6 47.07 12.25 46.67 12.25C46.27 12.25 45.92 12.6 45.92 13C45.92 19.02 50.9 24 56.92 24C57.33 24 57.67 23.65 57.67 23.25Z" fill="currentColor" />
            <path d="M16.58 32C16.58 26.76 12.32 22.5 7.08 22.5C6.67 22.5 6.33 22.85 6.33 23.25C6.33 23.65 6.67 24 7.08 24C12.32 24 16.58 28.26 16.58 33.5C16.58 33.9 16.93 34.25 17.33 34.25C17.73 34.25 18.08 33.9 18.08 33.5C18.08 33.5 18.08 32 16.58 32Z" fill="currentColor" />
            <path d="M18.08 23.25C18.08 22.85 17.73 22.5 17.33 22.5C16.93 22.5 16.58 22.85 16.58 23.25C16.58 28.49 12.32 32.75 7.08 32.75C6.67 32.75 6.33 33.1 6.33 33.5C6.33 33.9 6.67 34.25 7.08 34.25C13.1 34.25 18.08 29.27 18.08 23.25Z" fill="currentColor" />
          </svg>
        </div>
        
        <div className="px-6 py-10 relative z-10">
          {/* Improved title section */}
          <div className="mb-8">
            <h1 className="text-3xl md:text-5xl font-bold mb-2 text-center tracking-tight">
              החקלאים שלנו
            </h1>
            <div className="h-1 w-24 bg-yellow-400 mx-auto rounded-full mb-4"></div>
            {/* <p className="text-blue-100 text-center max-w-3xl mx-auto text-lg">
              מצאו את כל המכירות הפעילות כרגע
            </p> */}
          </div>
          
          {/* Improved Region Selector */}
          <div className="max-w-xs mx-auto">
            <label className="block text-blue-100 text-sm font-medium mb-2 text-center">נקודת איסוף:</label>
            <div className="relative">
              <select
                value={selectedPickupSpot}
                onChange={(e) => setSelectedPickupSpot(e.target.value)}
                className="block w-full p-3 pr-10 text-right text-sm text-gray-900 bg-white bg-opacity-95 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-md appearance-none"
                dir="rtl"
              >
                <option value="הכל">הכל</option>
                {pickupSpots.map((spot) => (
                  <option key={spot} value={spot}>
                    {spot}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        {/* Enhanced decorative wave divider */}
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 1440 100" 
            className="w-full h-auto transform translate-y-1"
            fill="#f9fafb"
          >
            <path d="M0,32L60,42.7C120,53,240,75,360,69.3C480,64,600,32,720,26.7C840,21,960,43,1080,53.3C1200,64,1320,64,1380,64L1440,64L1440,100L1380,100C1320,100,1200,100,1080,100C960,100,840,100,720,100C600,100,480,100,360,100C240,100,120,100,60,100L0,100Z"></path>
          </svg>
        </div>
      </div>

      {/* Display loading spinner or orders */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              onClick={(e) => handleOrderClick(order, e)}
              className={`bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300 cursor-pointer
                ${order.isSpecialOrder ? 'border-2 border-yellow-400' : ''}`}
              dir="rtl"
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
                      <span className="font-medium">חקלאי:</span> {order.businessName}
                    </p>
                    {/* {order.businessKind && (
                      <p className="text-xs text-gray-700">
                        <span className="font-medium">סוג חקלאי:</span> {order.businessKind}
                      </p>
                    )}
                    {order.pickupSpots && order.pickupSpots.length > 0 && (
                      <p className="text-xs text-gray-700">
                        <span className="font-medium">נקודות איסוף:</span> {order.pickupSpots.join(', ')}
                      </p>
                    )} */}
                    {order.items && order.items.length > 0 && (
                      <p className="text-xs text-gray-700">
                        <span className="font-medium">טווח מחירים:</span> {Math.min(...order.items.map(item => item.price))}₪ - {Math.max(...order.items.map(item => item.price))}₪
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

                {order.minimumOrderAmount > 0 && (
                  <p className="text-xs text-gray-600">
                    סכום מינימום להזמנה: ₪{order.minimumOrderAmount}
                  </p>
                )}

                {/* Order description if available */}
                {/* {order.description && (
                  <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                    <p className="truncate-2-lines">{order.description}</p>
                  </div>
                )} */}

                {/* Shipping date range if available */}
                <div className="flex items-center text-sm text-gray-500 mt-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {order.shippingDateRange ? (
                    <span>אספקה: {new Date(order.shippingDateRange.start).toLocaleDateString('he-IL')} - {new Date(order.shippingDateRange.end).toLocaleDateString('he-IL')}</span>
                  ) : (
                    <span>תאריך אספקה לא צוין</span>
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
