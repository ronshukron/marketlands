import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import './BusinessDashBoard.css';

const BusinessDashBoard = () => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrders = async () => {
      if (!currentUser) return;
      try {
        const q = query(collection(db, 'Orders'), where('Coordinator_Email', '==', currentUser.email));
        const querySnapshot = await getDocs(q);
        const fetchedOrders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setOrders(fetchedOrders);
      } catch (error) {
        console.error('Error fetching orders:', error);
      }
      setLoading(false);
    };

    fetchOrders();
  }, [currentUser]);

  const handleOrderClick = (orderId) => {
    navigate(`/order-details/${orderId}`);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="my-store-container">
      <h1 className="my-store-header">החנות שלי</h1>
      <button className="my-products-button" onClick={() => navigate('/my-products')}>המוצרים שלי</button>
      <div className="orders-list">
        {orders.length === 0 ? (
          <p>אין הזמנות להציג</p>
        ) : (
          orders.map(order => (
            <div key={order.id} className="order-item" onClick={() => handleOrderClick(order.id)}>
              <h3>{order.Order_Name}</h3>
              <p>מפיק: {order.Producer_Name}</p>
              <p>סטטוס: {new Date(order.Ending_Time.toDate()) > new Date() ? 'פעילה' : 'הסתיימה'}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default BusinessDashBoard;