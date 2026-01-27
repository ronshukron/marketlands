// src/hooks/useOrderStatus.js

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useNavigate } from 'react-router-dom';
import { getEndingTimeForSpot, isOrderActiveNow } from '../utils/orderUtils';

/**
 * Hook to fetch and track order status.
 * @param {string} orderId - The order document ID
 * @param {string} [pickupSpot] - Optional pickup spot for per-spot ending time checking
 * @returns {object} - { orderData, orderEnded, loading }
 */
const useOrderStatus = (orderId, pickupSpot) => {
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
          const data = docSnap.data();
          setOrderData(data);

          let isEnded = false;

          // Check if the order is one-time and has an ending time
          if (data.orderType === 'one_time' || !data.orderType) {
            const endingTime = getEndingTimeForSpot(data, pickupSpot);
            if (endingTime) {
              const currentTime = new Date();
              if (currentTime >= endingTime) {
                isEnded = true;
              }
            }
          }

          // Check if the order is recurring and if it's active now
          if (data.orderType === 'recurring' && data.schedule) {
            const isActiveNow = isOrderActiveNow(data.schedule);
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
  }, [orderId, pickupSpot, navigate]);

  return { orderData, orderEnded, loading };
};

export default useOrderStatus;
