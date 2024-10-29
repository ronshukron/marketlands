// src/components/Dashboard.js

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import './Dashboard.css';
import { format } from 'date-fns';
import LoadingSpinner from './LoadingSpinner';
import Swal from 'sweetalert2';

const Dashboard = () => {
  const [orders, setOrders] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const navigate = useNavigate();
  const [user, loadingAuth, errorAuth] = useAuthState(auth);
  const [userRole, setUserRole] = useState(null);

  // Fetch user role when user is authenticated
  useEffect(() => {
    if (!loadingAuth && user) {
      fetchUserRole();
    }
  }, [user, loadingAuth]);

  // Fetch orders when userRole is set
  useEffect(() => {
    if (userRole) {
      fetchOrders();
    }
  }, [userRole]);

  const fetchUserRole = async () => {
    try {
      if (!user) {
        console.error('User is not authenticated.');
        setLoadingData(false);
        return;
      }

      // Check if the user is a coordinator
      const coordinatorDocRef = doc(db, 'coordinators', user.uid);
      const coordinatorDoc = await getDoc(coordinatorDocRef);
    //   console.log('Coordinator data fetchUserRole: ', coordinatorDoc.data());

      if (coordinatorDoc.exists()) {
        setUserRole('coordinator');
      } else {
        // Check if the user is a business
        const businessDocRef = doc(db, 'businesses', user.uid);
        const businessDoc = await getDoc(businessDocRef);
        // console.log('Business data fetchUserRole: ', businessDoc.data());

        if (businessDoc.exists()) {
          setUserRole('business');
        } else {
          // Default role (you can adjust this as needed)
          setUserRole('member');
        }
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
      setLoadingData(false);
    }
  };

  const fetchOrders = async () => {
    setLoadingData(true);
    try {
      const ordersList = [];

      if (!user) {
        console.error('User is not authenticated.');
        setLoadingData(false);
        return;
      }

      // Fetch orders for coordinators
      if (userRole === 'coordinator') {
        // Get coordinator data
        const coordinatorDoc = await getDoc(doc(db, 'coordinators', user.uid));
        const coordinatorData = coordinatorDoc.data();

        // Ensure coordinator data is available
        if (!coordinatorData) {
          console.error('Coordinator data not found.');
          setLoadingData(false);
          return;
        }

        // Fetch orders assigned to the coordinator's community
        const ordersRef = collection(db, 'Orders');
        const coordinatorOrdersQuery = query(
          ordersRef,
          where('assignedCommunities', 'array-contains', coordinatorData.community)
        );
        const coordinatorOrdersSnapshot = await getDocs(coordinatorOrdersQuery);
        const fetchedCoordinatorOrders = coordinatorOrdersSnapshot.docs.map((doc) => {
          const data = doc.data();
          const orderDate = parseDate(data.Order_Time) || parseDate(data.createdAt);
          return {
            id: doc.id,
            orderType: 'farmer',
            ...data,
            orderDate,
          };
        });

        ordersList.push(...fetchedCoordinatorOrders);

        // Fetch orders with Coordinator_Email (for backward compatibility)
        const farmerOrdersQuery = query(
          ordersRef,
          where('Coordinator_Email', '==', user.email)
        );
        const farmerOrdersSnapshot = await getDocs(farmerOrdersQuery);
        const fetchedFarmerOrders = farmerOrdersSnapshot.docs.map((doc) => {
          const data = doc.data();
          const orderDate = parseDate(data.Order_Time) || parseDate(data.createdAt);
          return {
            id: doc.id,
            orderType: 'farmer',
            ...data,
            orderDate,
          };
        });

        ordersList.push(...fetchedFarmerOrders);
      }

      // Fetch orders for businesses
      if (userRole === 'business') {
        const businessOrdersRef = collection(db, 'Orders');
        const businessOrdersQuery = query(
          businessOrdersRef,
          where('businessEmail', '==', user.email)
        );
        const businessOrdersSnapshot = await getDocs(businessOrdersQuery);
        const fetchedBusinessOrders = businessOrdersSnapshot.docs.map((doc) => {
          const data = doc.data();
          const orderDate = parseDate(data.Order_Time) || parseDate(data.createdAt);
          return {
            id: doc.id,
            orderType: 'business',
            ...data,
            orderDate,
          };
        });

        ordersList.push(...fetchedBusinessOrders);
      }

      // Combine orders and sort by date
      const sortedOrders = ordersList.sort((a, b) => {
        const dateA = a.orderDate ? a.orderDate.getTime() : 0;
        const dateB = b.orderDate ? b.orderDate.getTime() : 0;
        return dateB - dateA;
      });

      setOrders(
        sortedOrders.map((order) => ({
          ...order,
          displayDate: order.orderDate ? formatDate(order.orderDate) : 'No date',
        }))
      );
      setLoadingData(false);
    } catch (error) {
      console.error('Error fetching orders:', error);
      setLoadingData(false);
    }
  };

  const parseDate = (dateField) => {
    if (!dateField) return null;
    if (dateField.toDate) return dateField.toDate();
    return new Date(dateField);
  };

  const formatDate = (date) => {
    return date && !isNaN(date.getTime())
      ? format(date, 'dd/MM/yyyy HH:mm')
      : 'No date';
  };

  const handleViewOrder = (order) => {
    const route =
      order.orderType === 'farmer'
        ? `/order-summary/${order.id}`
        : `/business-order-summary/${order.id}`;
    navigate(route);
  };

  const handleCopyLink = (order) => {
    const link = `${window.location.origin}/${
      order.orderType === 'farmer' ? 'order-form' : 'order-form-business'
    }/${order.id}`;
    navigator.clipboard
      .writeText(link)
      .then(() => {
        Swal.fire({
          icon: 'success',
          title: 'הקישור הועתק',
          text: 'הקישור להזמנה הועתק ללוח שלך',
          showConfirmButton: false,
          timer: 1500,
        });
      })
      .catch((err) => console.error('Failed to copy link: ', err));
  };

  if (loadingAuth || loadingData) return <LoadingSpinner />;

  if (errorAuth) {
    console.error('Authentication error:', errorAuth);
    return <p>שגיאה באימות המשתמש.</p>;
  }

  return (
    <div className="dashboard-container">
      <h1>לוח הזמנות</h1>
      {orders.length === 0 ? (
        <p>אין הזמנות להצגה.</p>
      ) : (
        <div className="orders-grid">
          {orders.map((order) => (
            <div key={order.id} className="order-card">
              <h2 className="order-name">{order.Order_Name || order.orderName}</h2>
              <p>
                <strong>תאריך:</strong> {order.displayDate}
              </p>
              <p>
                <strong>ספק:</strong> {order.Producer_Name || order.businessName}
              </p>
              {/* Additional order details */}
              <div className="order-card-actions">
                <button
                  className="view-order-btn"
                  onClick={() => handleViewOrder(order)}
                >
                  צפה בהזמנה
                </button>
                <button
                  className="copy-link-btn"
                  onClick={() => handleCopyLink(order)}
                >
                  העתק קישור
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
