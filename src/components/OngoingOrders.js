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
import './OngoingOrders.css';
import LoadingSpinner from './LoadingSpinner';
import { Link } from 'react-router-dom';

const OngoingOrders = () => {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
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
      const q = query(collection(db, 'Orders'));
      const querySnapshot = await getDocs(q);

      const ordersData = [];
      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        const endingTime = data.Ending_Time || data.endingTime;

        if (endingTime && endingTime.toDate() > currentTime) {
          let order = {
            id: docSnap.id,
            ...data,
          };

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
            };
            // Image is in order.imageUrl
          } else {
            // Unknown order type
            continue; // Skip this order
          }

          ordersData.push(order);
        }
      }

      setOrders(ordersData);
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
      const filtered = orders.filter((order) => {
        if (order.type === 'farmer') {
          return order.Coordinator_Region === selectedRegion;
        } else if (order.type === 'business') {
          return order.region === selectedRegion;
        }
        return false;
      });
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
              <Link
                to={
                  order.type === 'farmer'
                    ? `/order-form/${order.id}`
                    : `/order-form-business/${order.id}`
                }
                className="order-link"
              >
                {/* Display image */}
                {order.type === 'farmer' && order.producerData?.Image && (
                  <img
                    src={order.producerData.Image}
                    alt={order.Producer_Name}
                    className="producer-image"
                  />
                )}
                {order.type === 'business' && order.imageUrl && (
                  <img
                    src={order.imageUrl}
                    alt={order.businessName}
                    className="producer-image"
                  />
                )}

                <h3>{order.Order_Name || order.orderName}</h3>

                {/* Display order details */}
                {order.type === 'farmer' && (
                  <>
                    <p>
                      <strong>ספק:</strong> {order.Producer_Name}
                    </p>
                    {order.producerData?.Kind && (
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
                  </>
                )}
                {order.type === 'business' && (
                  <>
                    <p>
                      <strong>עסק:</strong> {order.businessName}
                    </p>
                    {order.businessKind && (
                      <p>
                        <strong>סוג עסק:</strong> {order.businessKind}
                      </p>
                    )}
                    {order.region && (
                      <p>
                        <strong>אזור:</strong> {order.region}
                      </p>
                    )}
                    {order.communityName && (
                      <p>
                        <strong>קהילה:</strong> {order.communityName}
                      </p>
                    )}
                  </>
                )}
                <p>
                  <strong>זמן שנותר:</strong>{' '}
                  {calculateTimeRemaining(order.Ending_Time || order.endingTime)}
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
