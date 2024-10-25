import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import './BusinessOrderSummary.css';
import LoadingSpinner from '../LoadingSpinner';

const BusinessOrderSummary = () => {
  const { orderId } = useParams();
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrderData = async () => {
      const docRef = doc(db, 'Orders', orderId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setOrderData(docSnap.data());
      } else {
        console.log('No order data found');
      }
      setLoading(false);
    };

    fetchOrderData();
  }, [orderId]);

  const calculateMemberTotal = (memberDetails) => {
    return Object.values(memberDetails)
      .filter((item) => typeof item === 'object' && item.Quantity)
      .reduce((total, item) => total + item.Quantity * item.Price, 0);
  };

  const calculateProductTotal = (productDetails) => {
    return productDetails.Quantity * productDetails.Price;
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!orderData) return <div className="no-data">No data available for this order.</div>;

  return (
    <div className="order-summary-container">
      <h1>סיכום הזמנה: {orderData.orderName}</h1>
      <div className="order-details">
        <p>
          <strong>שם העסק:</strong> {orderData.businessName}
        </p>
        <p>
          <strong>סוג העסק:</strong> {orderData.businessKind}
        </p>
        <p>
          <strong>קהילה:</strong> {orderData.communityName}
        </p>
        <p>
          <strong>אזור:</strong> {orderData.region}
        </p>
        <p>
          <strong>תאריך יצירה:</strong>{' '}
          {orderData.createdAt ? orderData.createdAt.toDate().toLocaleString() : 'N/A'}
        </p>
        <p>
          <strong>תאריך סיום:</strong>{' '}
          {orderData.endingTime ? orderData.endingTime.toDate().toLocaleString() : 'N/A'}
        </p>
        {orderData.imageUrl && (
          <img
            src={orderData.imageUrl}
            alt={orderData.orderName}
            className="order-image"
          />
        )}
      </div>

      <h2>הזמנות של לקוחות</h2>
      {Object.keys(orderData)
        .filter((key) => key.startsWith('Member_'))
        .map((memberKey, index) => {
          const memberDetails = orderData[memberKey];
          const memberTotal = calculateMemberTotal(memberDetails);

          return (
            <div key={index} className="order-member">
              <h3>
                {memberDetails.Name} - סה"כ: ₪{memberTotal}
              </h3>
              <p>
                <strong>טלפון:</strong> {memberDetails.Phone}
              </p>
              {/* Conditionally render the address if available */}
              {memberDetails.Address && (
                <p>
                  <strong>כתובת:</strong> {memberDetails.Address}
                </p>
              )}
              <ul>
                {Object.entries(memberDetails)
                  .filter(([key, value]) => typeof value === 'object' && value.Quantity)
                  .map(([productKey, productDetails], idx) => (
                    <li key={idx}>
                      {productDetails.Name} ({productDetails.Option}): {productDetails.Quantity} יחידות ₪{productDetails.Price} 
                      {' '}= <strong>₪{calculateProductTotal(productDetails)}</strong>
                    </li>
                  ))}
              </ul>
            </div>
          );
        })}
    </div>
  );
};

export default BusinessOrderSummary;
