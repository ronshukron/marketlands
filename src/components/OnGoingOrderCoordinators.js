import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useAuth } from '../contexts/authContext';
import './OnGoingOrderCoordinators.css';
import LoadingSpinner from './LoadingSpinner';
import Swal from 'sweetalert2';
import communityToRegion from '../utils/communityToRegion';
import { useNavigate } from 'react-router-dom';

const OnGoingOrderCoordinators = () => {
    const { currentUser } = useAuth();
    const [coordinatorData, setCoordinatorData] = useState(null);
    const [availableOrders, setAvailableOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedArea, setSelectedArea] = useState('הכל');
    const navigate = useNavigate();
  
    useEffect(() => {
      if (currentUser) {
        fetchCoordinatorData();
      }
    }, [currentUser]);
  
    useEffect(() => {
      if (coordinatorData) {
        fetchAvailableOrderForms();
      }
    }, [coordinatorData]);
  
    const fetchCoordinatorData = async () => {
        try {
          const coordinatorDoc = await getDoc(doc(db, 'coordinators', currentUser.uid));
          if (coordinatorDoc.exists()) {
            setCoordinatorData(coordinatorDoc.data());
          } else {
            console.error('Coordinator data not found');
          }
        } catch (error) {
          console.error('Error fetching coordinator data:', error);
        }
      };
    
    const fetchAvailableOrderForms = async () => {
        setLoading(true);
        try {
            const ordersRef = collection(db, 'Orders');
            const q = query(ordersRef, where('isFarmerOrder', '==', true));
            const querySnapshot = await getDocs(q);
            const orders = [];

            for (const docSnap of querySnapshot.docs) {
                const orderData = docSnap.data();
                const coordinatorRegion = communityToRegion[coordinatorData.community] || 'אחר';
                
                if (orderData.areas && orderData.areas.includes(coordinatorRegion)) {
                    const assignedCommunities = orderData.assignedCommunities || [];
                    if (!assignedCommunities.includes(coordinatorRegion)) {
                        orders.push({ id: docSnap.id, ...orderData });
                    }
                }
            }
            setAvailableOrders(orders);
        } catch (error) {
            console.error('Error fetching available order forms:', error);
        } finally {
            setLoading(false);
        }
    };

    const calculateTimeRemaining = (endingTime) => {
        if (!endingTime) return 'תאריך סיום לא זמין';

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

    const handleTakeOrderForm = async (order) => {
        try {
          const result = await Swal.fire({
            title: 'האם אתה בטוח?',
            text: 'הזמנה זו תשויך לקהילה שלך.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'כן, קח הזמנה',
            cancelButtonText: 'ביטול',
          });
    
          if (result.isConfirmed) {
            const orderRef = doc(db, 'Orders', order.id);
            const orderSnap = await getDoc(orderRef);
            if (orderSnap.exists()) {
              const orderData = orderSnap.data();
              const assignedCommunities = orderData.assignedCommunities || [];
              if (assignedCommunities.includes(coordinatorData.community)) {
                Swal.fire({
                  icon: 'error',
                  title: 'שגיאה',
                  text: 'ההזמנה כבר נלקחה על ידי קהילה שלך.',
                });
                return;
              }
    
              await updateDoc(orderRef, {
                assignedCommunities: arrayUnion(coordinatorData.community),
                assignedCoordinators: arrayUnion(currentUser.uid),
              });
    
              Swal.fire({
                icon: 'success',
                title: 'ההזמנה נוספה ללוח שלך',
                showConfirmButton: false,
                timer: 2000,
              });
    
              setAvailableOrders((prevOrders) =>
                prevOrders.filter((o) => o.id !== order.id)
              );
            } else {
              console.error('Order data not found');
            }
          }
        } catch (error) {
          console.error('Error taking order form:', error);
          Swal.fire({
            icon: 'error',
            title: 'שגיאה',
            text: 'אירעה שגיאה בעת ניסיון לקחת את ההזמנה.',
          });
        }
    };

    const handleViewOrderForm = (orderId, orderType) => {
        const route = orderType === 'farmer' ? `/order-form/${orderId}` : `/order-form-business/${orderId}`;
        navigate(route);
    };

    if (loading) {
        return <LoadingSpinner />;
    }
    
    if (!coordinatorData) {
        return <p>לא נמצאו נתוני מתאם.</p>;
    }
    
    return (
        <div className="available-order-forms-container">
          <h1>הזמנות זמינות באזור שלך</h1>
          <div className="filter-container">
            <label htmlFor="area-filter">סנן לפי אזור:</label>
            <select
              id="area-filter"
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
            >
              <option value="הכל">הכל</option>
              <option value="צפון">צפון</option>
              <option value="מרכז">מרכז</option>
              <option value="דרום">דרום</option>
              <option value="ירושלים">ירושלים</option>
              <option value="שרון">שרון</option>
              <option value="שפלה">שפלה</option>
              <option value="יהודה ושומרון">יהודה ושומרון</option>
              <option value="אחר">אחר</option>
            </select>
          </div>
          {availableOrders.length === 0 ? (
            <p>אין הזמנות זמינות באזור שלך.</p>
          ) : (
            <div className="orders-list">
              {availableOrders
                .filter((order) => selectedArea === 'הכל' || order.areas.includes(selectedArea))
                .map((order) => (
                  <div key={order.id} className="order-item">
                    <h3>{order.orderName}</h3>
                    <p>
                      <strong>שם החקלאי:</strong> {order.businessName}
                    </p>
                    <p>
                      <strong>אזורים:</strong> {order.areas.join(', ')}
                    </p>
                    <p className="time-remaining">
                      <strong>זמן שנותר:</strong> {calculateTimeRemaining(order.endingTime)}
                    </p>
                    <div className="button-container">
                      <button onClick={() => handleTakeOrderForm(order)}>
                        קח הזמנה
                      </button>
                      <button onClick={() => handleViewOrderForm(order.id, order.type)}>
                        צפה בהזמנה
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
    );
};

export default OnGoingOrderCoordinators;
