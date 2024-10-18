import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/authContext';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase/firebase';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2'; // Import SweetAlert2 for confirmation dialogs
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
        const q = query(
          collection(db, 'Orders'),
          where('businessEmail', '==', currentUser.email) // Query by business email
        );

        const querySnapshot = await getDocs(q);
        const fetchedOrders = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setOrders(fetchedOrders);
      } catch (error) {
        console.error('Error fetching orders:', error);
      }
      setLoading(false);
    };

    fetchOrders();
  }, [currentUser]);

  const handleOrderClick = (orderId) => {
    navigate(`/order-form-business/${orderId}`); // Navigate to BusinessOrderForm page with the orderId as parameter
  };

  const handleShareProducts = () => {
    navigate('/business-products');
  };

  const calculateOrderStatus = (order) => {
    const now = new Date();
    const endingTime = order.Ending_Time || order.endingTime; // Handle both possible field names
    if (!endingTime) {
      return 'לא ידוע'; // Return 'unknown' status if no ending time is found
    }
    return endingTime.toDate() > now ? 'פעילה' : 'הסתיימה';
  };

  const handleDeleteOrder = async (orderId, imageUrl) => {
    // Show confirmation dialog
    const result = await Swal.fire({
      title: 'האם אתה בטוח?',
      text: 'לא תוכל לשחזר את ההזמנה לאחר המחיקה!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'כן, מחק!',
      cancelButtonText: 'ביטול',
    });

    if (result.isConfirmed) {
      try {
        // Delete the order document from Firestore
        await deleteDoc(doc(db, 'Orders', orderId));

        // Delete the image from Firebase Storage if it exists
        if (imageUrl) {
          const imageRef = ref(storage, imageUrl);
          await deleteObject(imageRef);
        }

        // Remove the order from the state to update the UI
        setOrders((prevOrders) => prevOrders.filter((order) => order.id !== orderId));

        Swal.fire('נמחק!', 'ההזמנה נמחקה בהצלחה.', 'success');
      } catch (error) {
        console.error('Error deleting order:', error);
        Swal.fire('שגיאה', 'אירעה שגיאה בעת מחיקת ההזמנה.', 'error');
      }
    }
  };

  if (loading) {
    return <div>טוען...</div>;
  }

  return (
    <div className="my-store-container">
      <h1 className="my-store-header">החנות שלי</h1>
      <button
        className="my-products-button"
        onClick={() => navigate('/business-products')}
      >
        המוצרים שלי
      </button>
      <div className="orders-list">
        {orders.length === 0 ? (
          <div className="empty-state">
            <img
              src="/assets/empty-orders.png"
              alt="No orders"
              className="empty-state-image"
            />
            <h2>עדיין אין לך הזמנות</h2>
            <p>שתף את המוצרים שלך כדי להתחיל לקבל הזמנות.</p>
            <button className="primary-button" onClick={handleShareProducts}>
              שתף את המוצרים שלך
            </button>
          </div>
        ) : (
          orders.map((order) => (
            <div
              key={order.id}
              className={`order-item ${calculateOrderStatus(order) === 'הסתיימה' ? 'ended-order' : ''}`}
            >
              {/* Display the image if available */}
              {order.imageUrl && (
                <img
                  src={order.imageUrl}
                  alt={order.orderName}
                  className="order-image"
                  onClick={() => handleOrderClick(order.id)}
                />
              )}
              <div className="order-details" onClick={() => handleOrderClick(order.id)}>
                <h3 className="order-title">{order.orderName || order.Order_Name}</h3>
                <p className="order-business">עסק: {order.businessName || 'ללא שם'}</p>
                <p className="order-status">
                  סטטוס: {calculateOrderStatus(order)}
                </p>
                {order.Ending_Time || order.endingTime ? (
                  <p className="order-ending-time">
                    סיום הזמנה: {new Date((order.Ending_Time || order.endingTime).toDate()).toLocaleString()}
                  </p>
                ) : (
                  <p className="order-ending-time">סיום הזמנה: לא ידוע</p>
                )}
              </div>
              {/* Delete button */}
              <button
                className="delete-order-button"
                onClick={() => handleDeleteOrder(order.id, order.imageUrl)}
              >
                X
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default BusinessDashBoard;
