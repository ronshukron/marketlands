// src/components/BusinessDashBoard.js

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/authContext';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase/firebase';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';

const BusinessDashBoard = () => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrders = async () => {
      if (!currentUser) return;

      try {
        // Query for documents where businessEmail matches and archived is false or field doesn't exist
        const ordersRef = collection(db, 'Orders');
        const q1 = query(
          ordersRef,
          where('businessEmail', '==', currentUser.email),
          where('archived', '==', false)
        );
        const q2 = query(
          ordersRef,
          where('businessEmail', '==', currentUser.email)
        );

        const [snapshot1, snapshot2] = await Promise.all([
          getDocs(q1),
          getDocs(q2)
        ]);

        // Combine results and filter out duplicates
        const allDocs = new Map();
        
        snapshot2.docs.forEach(doc => {
          const data = doc.data();
          if (!('archived' in data)) {  // Only include docs where archived field doesn't exist
            allDocs.set(doc.id, { id: doc.id, ...data });
          }
        });
        
        snapshot1.docs.forEach(doc => {
          if (!doc.data().archived) {  // Double check archived is false
            allDocs.set(doc.id, { id: doc.id, ...doc.data() });
          }
        });

        setOrders(Array.from(allDocs.values()));
      } catch (error) {
        console.error('Error fetching orders:', error);
      }
      setLoading(false);
    };

    fetchOrders();
  }, [currentUser]);

  const handleOrderClick = (orderId) => {
    navigate(`/order-form-business/${orderId}`);
  };

  const handleShareProducts = () => {
    navigate('/business-products');
  };

  const calculateOrderStatus = (order) => {
    const now = new Date();
    const endingTime = order.Ending_Time || order.endingTime;
    if (!endingTime) {
      return 'לא ידוע';
    }
    return endingTime.toDate() > now ? 'פעילה' : 'הסתיימה';
  };

  const handleArchiveOrder = async (orderId) => {
    const result = await Swal.fire({
      title: 'האם אתה בטוח?',
      text: 'ההזמנה תועבר לארכיון',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'כן, העבר לארכיון!',
      cancelButtonText: 'ביטול',
    });

    if (result.isConfirmed) {
      try {
        await updateDoc(doc(db, 'Orders', orderId), {
          archived: true,
          archivedAt: new Date()
        });

        setOrders((prevOrders) => prevOrders.filter((order) => order.id !== orderId));

        Swal.fire('הועבר לארכיון!', 'ההזמנה הועברה לארכיון בהצלחה.', 'success');
      } catch (error) {
        console.error('Error archiving order:', error);
        Swal.fire('שגיאה', 'אירעה שגיאה בעת העברת ההזמנה לארכיון.', 'error');
      }
    }
  };

  if (loading) {
    return <div dir="rtl" className="text-center text-xl p-4">טוען...</div>;
  }

  return (
    <div dir="rtl" className="max-w-6xl mx-auto p-4">
      <h1 className="text-3xl font-bold text-center mb-6">החנות שלי</h1>
      <button
        className="mb-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg w-full md:w-auto"
        onClick={() => navigate('/business-products')}
      >
        המוצרים שלי
      </button>

      {orders.length === 0 ? (
        <div className="text-center py-8 px-4 bg-gray-50 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">עדיין אין לך הזמנות</h2>
          <p className="text-gray-600 mb-4">שתף את המוצרים שלך כדי להתחיל לקבל הזמנות.</p>
          <button 
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg"
            onClick={handleShareProducts}
          >
            שתף את המוצרים שלך
          </button>
        </div>
      ) : (
        <>
          <p className="text-gray-600 mb-4 text-center">
            כאן תוכל לראות את ההזמנות שיצרת. לחץ על הזמנה כדי לערוך או לשתף אותה.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {orders.map((order) => (
              <div
                key={order.id}
                className={`relative bg-white rounded-lg shadow-md overflow-hidden
                  ${calculateOrderStatus(order) === 'הסתיימה' ? 'opacity-75' : ''}`}
              >
                {order.imageUrl && (
                  <img
                    src={order.imageUrl}
                    alt={order.orderName}
                    className="w-full h-48 object-cover cursor-pointer"
                    onClick={() => handleOrderClick(order.id)}
                  />
                )}
                <div 
                  className="p-4 cursor-pointer"
                  onClick={() => handleOrderClick(order.id)}
                >
                  <h3 className="text-base font-semibold mb-2">
                    {order.orderName || order.Order_Name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-1">
                    עסק: {order.businessName || 'ללא שם'}
                  </p>
                  <p className="text-sm text-gray-600 mb-1">
                    סטטוס: {calculateOrderStatus(order)}
                  </p>
                  {order.Ending_Time || order.endingTime ? (
                    <p className="text-sm text-gray-600">
                      סיום הזמנה:{' '}
                      {new Date(
                        (order.Ending_Time || order.endingTime).toDate()
                      ).toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-600">סיום הזמנה: לא ידוע</p>
                  )}
                </div>
                <button
                  className="absolute top-2 left-2 bg-red-500 hover:bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center"
                  onClick={() => handleArchiveOrder(order.id)}
                >
                  X
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default BusinessDashBoard;
