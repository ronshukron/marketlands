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

  // Add these helper functions
  const calculateOrderStats = (order) => {
    let totalAmount = 0;
    let customerCount = 0;

    // Count members (keys that start with 'Member_')
    Object.keys(order).forEach(key => {
      if (key.startsWith('Member_')) {
        customerCount++;
        const memberDetails = order[key];
        
        // Calculate total for this member
        Object.values(memberDetails).forEach(item => {
          if (typeof item === 'object' && item.Quantity && item.Price) {
            totalAmount += item.Quantity * item.Price;
          }
        });
      }
    });

    return { totalAmount, customerCount };
  };

  const calculateTotalStats = () => {
    return orders.reduce((acc, order) => {
      const stats = calculateOrderStats(order);
      return {
        totalRevenue: acc.totalRevenue + stats.totalAmount,
        totalCustomers: acc.totalCustomers + stats.customerCount
      };
    }, { totalRevenue: 0, totalCustomers: 0 });
  };

  if (loadingAuth || loadingData) return <LoadingSpinner />;

  if (errorAuth) {
    return (
      <div className="text-center py-12 text-red-600">
        שגיאה באימות המשתמש.
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-7xl mx-auto px-4 py-8">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">לוח מודעות</h1>
        <p className="text-gray-600">
          {userRole === 'coordinator' ? 'ניהול מודעות הקהילה שלך' : 'ניהול מודעות של העסק שלך'}
        </p>
      </div>

      {orders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Total Revenue Card */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">סה"כ הכנסות</p>
                <h3 className="text-2xl font-bold text-gray-900">
                  ₪{calculateTotalStats().totalRevenue.toFixed(2)}
                </h3>
              </div>
              <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Total Customers Card */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">סה"כ לקוחות</p>
                <h3 className="text-2xl font-bold text-gray-900">
                  {calculateTotalStats().totalCustomers}
                </h3>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">אין הזמנות להצגה</h3>
          <p className="text-gray-600">התחל ליצור הזמנות חדשות כדי לראות אותן כאן</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orders.map((order) => {
            const stats = calculateOrderStats(order);
            return (
              <div 
                key={order.id} 
                className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300"
              >
                {/* Order Image */}
                {order.imageUrl && (
                  <div className="h-48 rounded-t-lg overflow-hidden">
                    <img
                      src={order.imageUrl}
                      alt={order.Order_Name || order.orderName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Order Content */}
                <div className="p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">
                    {order.Order_Name || order.orderName}
                  </h2>
                  
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center text-sm text-gray-600">
                      <svg className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {order.displayDate}
                    </div>
                    
                    <div className="flex items-center text-sm text-gray-600">
                      <svg className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      {order.Producer_Name || order.businessName}
                    </div>

                    {order.type && (
                      <div className="flex items-center text-sm text-gray-600">
                        <svg className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        {order.type === 'farmer' ? 'הזמנת חקלאי' : 'הזמנת עסק'}
                      </div>
                    )}

                    {/* Add Order Stats */}
                    <div className="flex items-center text-sm text-gray-600">
                      <svg className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      ₪{stats.totalAmount.toFixed(2)}
                    </div>

                    <div className="flex items-center text-sm text-gray-600">
                      <svg className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      {stats.customerCount} לקוחות
                    </div>

                    <div className="flex items-center text-sm text-gray-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {order.shippingDateRange ? (
                        <span>אספקה: {new Date(order.shippingDateRange.start).toLocaleDateString('he-IL')} - {new Date(order.shippingDateRange.end).toLocaleDateString('he-IL')}</span>
                      ) : (
                        <span>אספקה: לא צוין</span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleViewOrder(order)}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      צפה במודעה
                    </button>
                    <button
                      onClick={() => handleCopyLink(order)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      העתק קישור
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
