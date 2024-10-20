import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/authContext';
import { db } from '../firebase/firebase';
import { collection, query, getDocs } from 'firebase/firestore';
import './MyOrders.css';

const MyOrders = () => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrders = async () => {
      if (currentUser && currentUser.email) {
        const ordersRef = collection(db, 'Orders');
        const q = query(ordersRef);
        const querySnapshot = await getDocs(q);

        const fetchedOrders = querySnapshot.docs.flatMap((doc) => {
          const orderData = doc.data();

          return Object.entries(orderData)
            .filter(
              ([key, value]) =>
                key.startsWith('Member_') &&
                value.Email === currentUser.email
            )
            .map(([memberId, memberData]) => ({
              orderId: doc.id,
              memberId,
              orderName: orderData.orderName || orderData.Order_Name || 'N/A',
              supplierName:
                orderData.businessName ||
                orderData.Producer_Name ||
                'N/A',
              orderTime: memberData.Mem_Order_Time,
              orderValue: memberData.OrderValue,
              ...memberData,
            }));
        });

        setOrders(fetchedOrders);
        setLoading(false);
      }
    };

    fetchOrders();
  }, [currentUser]);

  const handleOrderClick = (orderId, memberId) => {
    navigate(`/order-details/${orderId}/${memberId}`);
  };

  const calculateOrderValue = (memberData) => {
    return Object.entries(memberData)
      .filter(
        ([key, value]) =>
          ![
            'Name',
            'Email',
            'Phone',
            'Mem_Order_Time',
            'OrderValue',
            'completedAt',
            'createdAt',
            'orderId',
            'paymentDetails',
            'status',
          ].includes(key) &&
          typeof value === 'object' &&
          value.Quantity
      )
      .reduce(
        (total, [_, product]) =>
          total + Number(product.Price) * product.Quantity,
        0
      );
  };

  if (loading) {
    return <div>טוען הזמנות...</div>;
  }

  return (
    <div className="my-orders-container">
      <h1>ההזמנות שלי</h1>
      {orders.length === 0 ? (
        <p>עוד לא ביצעתם שום הזמנה</p>
      ) : (
        <table className="orders-table">
          <thead>
            <tr>
              <th>שם הזמנה</th>
              <th>ספק</th>
              <th>תאריך הזמנה</th>
              <th>סה"כ עלות</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={`${order.orderId}-${order.memberId}`}
                onClick={() => handleOrderClick(order.orderId, order.memberId)}
              >
                <td>{order.orderName}</td>
                <td>{order.supplierName}</td>
                <td>
                  {order.orderTime
                    ? new Date(
                        typeof order.orderTime === 'number'
                          ? order.orderTime
                          : parseInt(order.orderTime)
                      ).toLocaleDateString()
                    : 'N/A'}
                </td>
                <td>
                  ₪
                  {order.orderValue
                    ? Number(order.orderValue).toFixed(2)
                    : calculateOrderValue(order).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default MyOrders;
