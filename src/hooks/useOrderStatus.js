// src/hooks/useOrderStatus.js

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useNavigate } from 'react-router-dom';

const useOrderStatus = (orderId) => {
  const [orderData, setOrderData] = useState(null);
  const [orderEnded, setOrderEnded] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrderStatus = async () => {
      try {
        const orderDoc = doc(db, 'Orders', orderId);
        const docSnap = await getDoc(orderDoc);

        if (docSnap.exists()) {
          const orderData = docSnap.data();
          setOrderData(orderData);

          let isEnded = false;

          // Check if the order is one-time and has an ending time
          if (orderData.orderType === 'one_time' && orderData.endingTime) {
            const endingTime = orderData.endingTime.toDate();
            const currentTime = new Date();
            if (currentTime >= endingTime) {
              isEnded = true;
            }
          }

          // Check if the order is recurring and if it's active now
          if (orderData.orderType === 'recurring' && orderData.schedule) {
            const isActiveNow = isOrderActiveNow(orderData.schedule);
            if (!isActiveNow) {
              isEnded = true;
            }
          }

          setOrderEnded(isEnded);
        } else {
          console.log('Order does not exist!');
          navigate('/error');
        }
      } catch (error) {
        console.error('Error fetching order data:', error);
        navigate('/error');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderStatus();
  }, [orderId, navigate]);

  return { orderData, orderEnded, loading };
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

    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;

    // Handle cases where end time is past midnight
    if (endTimeInMinutes < startTimeInMinutes) {
      // Adjust end time to be on the next day
      endTimeInMinutes += 24 * 60;
    }

    // Adjust current time if it's past midnight
    let adjustedCurrentTime = currentTime;
    if (currentTime < startTimeInMinutes) {
      adjustedCurrentTime += 24 * 60;
    }

    return (
      adjustedCurrentTime >= startTimeInMinutes && adjustedCurrentTime <= endTimeInMinutes
    );
  } else {
    return false;
  }
};

export default useOrderStatus;
