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
import { format, parseISO } from 'date-fns';
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
          where('businessId', '==', user.uid)
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
    navigate(`/business-order-summary/${order.id}`);
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

    totalAmount = order.Total_Amount || 0;
    
    // Calculate customerCount as the length of the customerOrderIds array
    customerCount = order.customerOrderIds ? order.customerOrderIds.length : 0;

    return { totalAmount, customerCount };
  };

  const calculateTotalStats = () => {
    return orders.reduce(
      (acc, order) => {
        const stats = calculateOrderStats(order);
        return {
          totalRevenue: acc.totalRevenue + stats.totalAmount,
          totalCustomers: acc.totalCustomers + stats.customerCount,
        };
      },
      { totalRevenue: 0, totalCustomers: 0 }
    );
  };

  const stats = calculateTotalStats();

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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">לוח הזמנות</h1>
        <p className="text-gray-600">
          {userRole === 'coordinator' ? 'ניהול הזמנות הקהילה שלך' : 'ניהול ההזמנות של העסק שלך'}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-sm">סה"כ הזמנות</p>
              <h3 className="text-3xl font-bold text-gray-800 mt-1">{orders.length}</h3>
            </div>
            <div className="bg-blue-100 p-3 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-sm">סה"כ לקוחות</p>
              <h3 className="text-3xl font-bold text-gray-800 mt-1">{stats.totalCustomers}</h3>
            </div>
            <div className="bg-green-100 p-3 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500 text-sm">סה"כ מכירות</p>
              <h3 className="text-3xl font-bold text-gray-800 mt-1">₪{stats.totalRevenue.toFixed(2)}</h3>
            </div>
            <div className="bg-purple-100 p-3 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Create New Order Button */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/create-order')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md shadow-sm transition-colors font-medium flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          צור הזמנה חדשה
        </button>
      </div>

      {/* Orders Section */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <h2 className="text-xl font-semibold p-6 border-b">ההזמנות שלך</h2>
        
        {orders.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-lg">אין הזמנות עדיין</p>
            <p className="mt-2">לחץ על "צור הזמנה חדשה" כדי להתחיל</p>
          </div>
        ) : (
          <>
            {/* Desktop Table (hidden on mobile) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      שם ההזמנה
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      תאריך יצירה
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      תאריך סיום
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      לקוחות
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      סכום כולל
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      סטטוס
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      פעולות
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orders.map((order) => {
                    const orderStats = calculateOrderStats(order);
                    const creationDate = parseDate(order.Order_Time);
                    const endDate = parseDate(order.endingTime);
                    const isActive = endDate ? new Date() < endDate : true;
                    
                    return (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {order.imageUrl ? (
                              <div className="flex-shrink-0 h-10 w-10 mr-4">
                                <img className="h-10 w-10 rounded-full object-cover" src={order.imageUrl} alt="" />
                              </div>
                            ) : (
                              <div className="flex-shrink-0 h-10 w-10 mr-4 bg-gray-200 rounded-full flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                </svg>
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-medium text-gray-900">{order.orderName}</div>
                              <div className="text-sm text-gray-500">{order.areas?.join(', ') || 'כל האזורים'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{formatDate(creationDate)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{formatDate(endDate)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {orderStats.customerCount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">
                          ₪{orderStats.totalAmount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            isActive 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {isActive ? 'פעיל' : 'הסתיים'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex space-x-2 rtl:space-x-reverse">
                            <button
                              onClick={() => handleViewOrder(order)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                            >
                              צפה
                            </button>
                            <button
                              onClick={() => handleCopyLink(order)}
                              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                            >
                              העתק קישור
                            </button>
                            {isActive && (
                              <button
                                onClick={() => navigate(`/edit-order/${order.id}`)}
                                className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                              >
                                ערוך
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Mobile Cards (visible only on mobile) */}
            <div className="md:hidden">
              {orders.map((order) => {
                const orderStats = calculateOrderStats(order);
                const creationDate = parseDate(order.Order_Time);
                const endDate = parseDate(order.endingTime);
                const isActive = endDate ? new Date() < endDate : true;
                
                return (
                  <div key={order.id} className="border-b border-gray-200 p-4">
                    <div className="flex items-center mb-3">
                      {order.imageUrl ? (
                        <div className="flex-shrink-0 h-12 w-12 ml-3">
                          <img className="h-12 w-12 rounded-full object-cover" src={order.imageUrl} alt="" />
                        </div>
                      ) : (
                        <div className="flex-shrink-0 h-12 w-12 ml-3 bg-gray-200 rounded-full flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                          </svg>
                        </div>
                      )}
                      <div>
                        <div className="text-lg font-medium text-gray-900">{order.orderName}</div>
                        <div className="text-sm text-gray-500">{order.areas?.join(', ') || 'כל האזורים'}</div>
                      </div>
                      <div className="mr-auto">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          isActive 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {isActive ? 'פעיל' : 'הסתיים'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-y-2 text-sm mb-4">
                      <div>
                        <span className="text-gray-500">תאריך יצירה:</span>
                        <span className="font-medium mr-1">{formatDate(creationDate)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">תאריך סיום:</span>
                        <span className="font-medium mr-1">{formatDate(endDate)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">לקוחות:</span>
                        <span className="font-medium mr-1">{orderStats.customerCount}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">סכום כולל:</span>
                        <span className="font-medium mr-1">₪{orderStats.totalAmount.toFixed(2)}</span>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2 rtl:space-x-reverse">
                      <button
                        onClick={() => handleViewOrder(order)}
                        className="bg-blue-600 hover:bg-blue-700 text-white flex-1 py-2 rounded-md text-sm font-medium transition-colors"
                      >
                        צפה
                      </button>
                      <button
                        onClick={() => handleCopyLink(order)}
                        className="bg-green-600 hover:bg-green-700 text-white flex-1 py-2 rounded-md text-sm font-medium transition-colors"
                      >
                        העתק קישור
                      </button>
                      {isActive && (
                        <button
                          onClick={() => navigate(`/edit-order/${order.id}`)}
                          className="bg-yellow-600 hover:bg-yellow-700 text-white flex-1 py-2 rounded-md text-sm font-medium transition-colors"
                        >
                          ערוך
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
