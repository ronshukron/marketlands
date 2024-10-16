// src/components/OngoingOrders.js

import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc as docRef, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import './OngoingOrders.css';
import LoadingSpinner from './LoadingSpinner';
import { Link } from 'react-router-dom';

const OngoingOrders = () => {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]); // State for filtered orders
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState('הכל');

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
      const q = query(
        collection(db, 'Orders'),
        where('Ending_Time', '>', currentTime)
      );

      const querySnapshot = await getDocs(q);
      const ordersData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Fetch producer data
      const producerPromises = ordersData.map((order) => {
        const producerDocRef = docRef(db, 'Producers', order.Producer_ID);
        return getDoc(producerDocRef);
      });

      const producerDocs = await Promise.all(producerPromises);

      const ongoingOrders = ordersData.map((order, index) => {
        const producerDocSnap = producerDocs[index];
        let producerData = {};
        if (producerDocSnap.exists()) {
          producerData = producerDocSnap.data();
        }
        return {
          ...order,
          producerData,
        };
      });

      setOrders(ongoingOrders);
    } catch (error) {
      console.error('Error fetching ongoing orders: ', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOrdersByRegion = () => {
    if (selectedRegion === 'הכל') {
      setFilteredOrders(orders);
    } else {
      const filtered = orders.filter(
        (order) => order.Coordinator_Region === selectedRegion
      );
      setFilteredOrders(filtered);
    }
  };

  const calculateTimeRemaining = (endingTime) => {
    const now = new Date();
    const end = endingTime.toDate();
    const diff = end - now;

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
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="ongoing-orders-container">
      <h1 className="ongoing-orders-header">הזמנות פעילות</h1>
      <div className="filter-container">
        <label htmlFor="region-filter">סנן לפי אזור:</label>
        <select
          id="region-filter"
          value={selectedRegion}
          onChange={(e) => setSelectedRegion(e.target.value)}
        >
          <option value="הכל">הכל</option>
          <option value="צפון">צפון</option>
          <option value="מרכז">מרכז</option>
          <option value="דרום">דרום</option>
          <option value="שפלה">שפלה</option>
        </select>
      </div>
      {filteredOrders.length === 0 ? (
        <p className="no-orders-message">אין הזמנות פעילות באזור שנבחר.</p>
      ) : (
        <div className="orders-list">
          {filteredOrders.map((order) => (
            <div key={order.id} className="order-item">
              <Link to={`/order-form/${order.id}`} className="order-link">
                {order.producerData.Image && (
                  <img
                    src={order.producerData.Image}
                    alt={order.Producer_Name}
                    className="producer-image"
                  />
                )}
                <h3>{order.Order_Name}</h3>
                <p>
                  <strong>ספק:</strong> {order.Producer_Name}
                </p>
                {order.producerData.Kind && (
                  <p>
                    <strong>סוג ספק:</strong> {order.producerData.Kind}
                  </p>
                )}
                {order.Coordinator_Region && (
                  <p>
                    <strong>אזור:</strong> {order.Coordinator_Region}
                  </p>
                )}
                {order.Coordinator_Community && (
                  <p>
                    <strong>קהילה:</strong> {order.Coordinator_Community}
                  </p>
                )}
                <p>
                  <strong>זמן שנותר:</strong> {calculateTimeRemaining(order.Ending_Time)}
                </p>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OngoingOrders;
