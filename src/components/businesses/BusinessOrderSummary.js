import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import LoadingSpinner from '../LoadingSpinner';

const BusinessOrderSummary = () => {
  const { orderId } = useParams();
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [pickupSpotSummary, setPickupSpotSummary] = useState({});

  useEffect(() => {
    const fetchOrderData = async () => {
      try {
        // Fetch the main order form data
        const orderDocRef = doc(db, 'Orders', orderId);
        const orderSnap = await getDoc(orderDocRef);
        
        if (orderSnap.exists()) {
          const fetchedOrderData = orderSnap.data();
          setOrderData(fetchedOrderData);

          // Fetch all customer orders referenced by this order form
          const customerOrderIds = fetchedOrderData.customerOrderIds || [];
          const fetchedCustomerOrders = await Promise.all(
            customerOrderIds.map(async (customerOrderId) => {
              const customerOrderDocRef = doc(db, 'customerOrders', customerOrderId);
              const customerOrderSnap = await getDoc(customerOrderDocRef);
              
              if (customerOrderSnap.exists()) {
                return { id: customerOrderId, ...customerOrderSnap.data() };
              } else {
                console.warn(`Customer order ${customerOrderId} not found`);
                return null;
              }
            })
          );
          
          // Filter out null values and orders that are not completed
          const validCustomerOrders = fetchedCustomerOrders.filter(order => 
            order !== null && order.paymentStatus === 'completed'
          );
          
          setCustomerOrders(validCustomerOrders);
          
          // Generate pickup spot summary
          generatePickupSpotSummary(validCustomerOrders);
        }
      } catch (error) {
        console.error("Error fetching order data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderData();
  }, [orderId]);

  // Generate summary of products by pickup spot
  const generatePickupSpotSummary = (orders) => {
    const summary = {};
    
    orders.forEach(order => {
      // Get pickup spot from customer details
      const pickupSpot = order.customerDetails?.pickupSpot || 'נקודת איסוף לא מוגדרת';
      
      // Initialize pickup spot in summary
      if (!summary[pickupSpot]) {
        summary[pickupSpot] = {};
      }
      
      // Look for this specific order ID in the order breakdown
      if (order.orderBreakdown && order.orderBreakdown[orderId]) {
        const thisOrderBreakdown = order.orderBreakdown[orderId];
        
        // Process items in this order breakdown
        if (Array.isArray(thisOrderBreakdown.items)) {
          thisOrderBreakdown.items.forEach(item => {
            const itemKey = `${item.productId}_${item.selectedOption || 'default'}`;
            
            if (!summary[pickupSpot][itemKey]) {
              summary[pickupSpot][itemKey] = {
                id: item.productId,
                name: item.productName || 'מוצר לא ידוע',
                option: item.selectedOption || 'ללא אופציות',
                quantity: 0,
                price: item.price,
              };
            }
            
            summary[pickupSpot][itemKey].quantity += item.quantity;
          });
        }
      }
    });
    
    setPickupSpotSummary(summary);
  };

  // Get the specific order breakdown for this order form
  const getBusinessSpecificOrder = (customerOrder) => {
    if (customerOrder.orderBreakdown && customerOrder.orderBreakdown[orderId]) {
      return customerOrder.orderBreakdown[orderId];
    }
    return null;
  };

  // Calculate subtotal for a business portion of an order
  const calculateBusinessSubTotal = (businessOrderDetails) => {
    if (!businessOrderDetails || !businessOrderDetails.items) return 0;
    
    return businessOrderDetails.items.reduce((total, item) => {
      return total + (item.quantity * item.price);
    }, 0);
  };

  // Calculate grand total across all customer orders for this specific order form
  const calculateGrandTotalForBusiness = () => {
    return customerOrders.reduce((total, customerOrder) => {
      const businessOrder = getBusinessSpecificOrder(customerOrder);
      return total + calculateBusinessSubTotal(businessOrder);
    }, 0);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl" dir="rtl">
      {/* Enhanced Order Header with Card Styling */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8 border border-gray-100">
        <div className="flex flex-wrap justify-between items-center mb-6 pb-3 border-b border-gray-100">
          <h1 className="text-2xl font-bold text-gray-800">{orderData?.orderName || 'סיכום הזמנות'}</h1>
          
          {/* Add an order status badge */}
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
            מודעה מספר: {orderId.substring(0, 8)}...
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Business Details Card */}
          <div className="bg-gray-50 p-4 rounded-md shadow-sm">
            <h3 className="font-medium text-gray-800 mb-3 pb-2 border-b border-gray-200">פרטי העסק</h3>
            <div className="space-y-2 text-gray-600">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="text-gray-500">עסק:</span>
                <span className="font-medium mr-2">{orderData?.businessName || 'לא ידוע'}</span>
              </div>
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span className="text-gray-500">סוג עסק:</span>
                <span className="font-medium mr-2">{orderData?.businessKind || 'לא ידוע'}</span>
              </div>
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="text-gray-500">קהילה:</span>
                <span className="font-medium mr-2">{orderData?.communityName || 'לא ידוע'}</span>
              </div>
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-gray-500">תאריך יצירה:</span>
                <span className="font-medium mr-2">
                  {orderData?.Order_Time ? orderData.Order_Time.toDate().toLocaleString() : 'לא זמין'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Order Statistics Card */}
          <div className="bg-gray-50 p-4 rounded-md shadow-sm">
            <h3 className="font-medium text-gray-800 mb-3 pb-2 border-b border-gray-200">סטטיסטיקות</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded shadow-sm text-center">
                <div className="text-2xl font-bold text-blue-600">{customerOrders.length}</div>
                <div className="text-xs text-gray-500">הזמנות מאושרות</div>
              </div>
              <div className="bg-white p-3 rounded shadow-sm text-center">
                <div className="text-2xl font-bold text-green-600">₪{calculateGrandTotalForBusiness().toFixed(2)}</div>
                <div className="text-xs text-gray-500">סך הכל מכירות</div>
              </div>
              <div className="bg-white p-3 rounded shadow-sm text-center">
                <div className="text-2xl font-bold text-purple-600">{Object.keys(pickupSpotSummary).length}</div>
                <div className="text-xs text-gray-500">נקודות איסוף</div>
              </div>
              <div className="bg-white p-3 rounded shadow-sm text-center">
                <div className="text-2xl font-bold text-amber-600">
                  {customerOrders.reduce((total, order) => {
                    const businessOrder = getBusinessSpecificOrder(order);
                    return total + (businessOrder?.items?.length || 0);
                  }, 0)}
                </div>
                <div className="text-xs text-gray-500">מוצרים שנמכרו</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Pickup Spot Summary Section */}
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <div className="h-8 w-1 bg-blue-500 rounded-full mr-3"></div>
          <h2 className="text-xl font-semibold text-gray-800">סיכום לפי נקודות איסוף</h2>
        </div>
        
        {Object.keys(pickupSpotSummary).length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center border border-gray-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500">לא נמצאו הזמנות מאושרות עם נקודות איסוף מוגדרות.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(pickupSpotSummary).map(([pickupSpot, items]) => (
              <div key={pickupSpot} className="bg-white rounded-lg shadow-md p-5 border border-gray-100">
                <div className="flex items-center mb-4 pb-2 border-b border-gray-100">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-800">
                    נקודת איסוף: {pickupSpot}
                  </h3>
                  <span className="mr-auto bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                    {Object.values(items).length} מוצרים
                  </span>
                </div>
                
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 text-right">
                        <th className="py-3 px-4 text-sm font-medium text-gray-700 border-b">מוצר</th>
                        <th className="py-3 px-4 text-sm font-medium text-gray-700 border-b">אפשרות</th>
                        <th className="py-3 px-4 text-sm font-medium text-gray-700 border-b">מחיר ליחידה</th>
                        <th className="py-3 px-4 text-sm font-medium text-gray-700 border-b text-center">כמות</th>
                        <th className="py-3 px-4 text-sm font-medium text-gray-700 border-b text-right">סה"כ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(items).map((item, index) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="py-3 px-4 text-sm font-medium">{item.name}</td>
                          <td className="py-3 px-4 text-sm text-gray-600">{item.option}</td>
                          <td className="py-3 px-4 text-sm">₪{item.price.toFixed(2)}</td>
                          <td className="py-3 px-4 text-sm font-medium text-center">{item.quantity}</td>
                          <td className="py-3 px-4 text-sm font-bold text-right">₪{(item.price * item.quantity).toFixed(2)}</td>
                        </tr>
                      ))}
                      
                      {/* Total for this pickup spot */}
                      <tr className="bg-blue-50">
                        <td colSpan="4" className="py-3 px-4 text-sm font-bold text-blue-800 text-left">סה"כ לנקודת איסוף זו:</td>
                        <td className="py-3 px-4 text-sm font-bold text-blue-800 text-right">
                          ₪{Object.values(items).reduce((total, item) => total + (item.price * item.quantity), 0).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enhanced Grand Total Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-5 mb-8 shadow-md border border-blue-100">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-3 md:mb-0">
            <div className="text-sm text-gray-600 mb-1">סך כל ההזמנות המאושרות למודעה זו</div>
            <div className="text-2xl font-bold text-blue-700">₪{calculateGrandTotalForBusiness().toFixed(2)}</div>
          </div>
          <div className="text-sm text-gray-500">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              סכום זה מציג את סך ההזמנות המשולמות בלבד
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Customer Orders Section */}
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <div className="h-8 w-1 bg-green-500 rounded-full mr-3"></div>
          <h2 className="text-xl font-semibold text-gray-800">הזמנות מאושרות של לקוחות</h2>
        </div>

        {customerOrders.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center border border-gray-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <p className="text-gray-500">לא נמצאו הזמנות מאושרות מלקוחות עבור מודעה זו.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          {customerOrders.map((customerOrder) => {
            // Get the breakdown specific to this order form
            const businessOrderDetails = getBusinessSpecificOrder(customerOrder);

            // Skip if no items for this order form
            if (!businessOrderDetails || !businessOrderDetails.items || businessOrderDetails.items.length === 0) {
              return null;
            }

            const customerSubTotal = calculateBusinessSubTotal(businessOrderDetails);

            return (
              <div key={customerOrder.id} className="bg-white rounded-lg shadow-md p-5 border border-gray-100">
                {/* Customer Header - Enhanced with Card Style */}
                <div className="flex flex-wrap justify-between items-center mb-4 pb-3 border-b border-gray-100">
                  <div className="flex items-center">
                    <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold mr-3">
                      {customerOrder.customerDetails?.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <h3 className="text-lg font-medium text-gray-800">{customerOrder.customerDetails?.name || 'לקוח לא ידוע'}</h3>
                  </div>
                  <div className="flex items-center bg-green-50 px-3 py-1 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium text-green-600">₪{customerSubTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Customer Contact Info - Enhanced Grid Style */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5 text-sm">
                  {customerOrder.customerDetails?.phone && (
                    <div className="bg-gray-50 p-3 rounded-md">
                      <div className="flex items-center gap-2 mb-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        <span className="text-gray-500">טלפון</span>
                      </div>
                      <div className="font-medium">{customerOrder.customerDetails.phone}</div>
                    </div>
                  )}
                  {customerOrder.customerDetails?.email && (
                    <div className="bg-gray-50 p-3 rounded-md">
                      <div className="flex items-center gap-2 mb-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        <span className="text-gray-500">אימייל</span>
                      </div>
                      <div className="font-medium truncate">{customerOrder.customerDetails.email}</div>
                    </div>
                  )}
                  {customerOrder.customerDetails?.pickupSpot && (
                    <div className="bg-gray-50 p-3 rounded-md">
                      <div className="flex items-center gap-2 mb-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        <span className="text-gray-500">נקודת איסוף</span>
                      </div>
                      <div className="font-medium">{customerOrder.customerDetails.pickupSpot}</div>
                    </div>
                  )}
                  {customerOrder.customerDetails?.address && (
                    <div className="bg-gray-50 p-3 rounded-md">
                      <div className="flex items-center gap-2 mb-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                        <span className="text-gray-500">כתובת</span>
                      </div>
                      <div className="font-medium">{customerOrder.customerDetails.address}</div>
                    </div>
                  )}
                </div>

                {/* Order Details - Enhanced Card Style */}
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                  <h4 className="flex items-center text-sm font-medium text-gray-700 mb-3 pb-2 border-b border-gray-200">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    פריטים שהוזמנו:
                  </h4>
                  <ul className="divide-y divide-gray-200">
                    {businessOrderDetails.items.map((item, idx) => (
                      <li key={idx} className="py-2 flex justify-between items-center text-sm">
                        <div className="flex items-center">
                          <div className="h-8 w-8 bg-white rounded-md border border-gray-200 flex items-center justify-center text-gray-600 ml-3">
                            {item.quantity}
                          </div>
                          <div>
                            <span className="font-medium block">{item.productName || 'מוצר לא ידוע'}</span>
                            {item.selectedOption && item.selectedOption !== "ללא אופציות" && (
                              <span className="text-xs text-gray-500 block">אפשרות: {item.selectedOption}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-gray-500 text-xs">₪{item.price?.toFixed(2)} × {item.quantity}</span>
                          <span className="font-medium">₪{(item.quantity * item.price).toFixed(2)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between">
                    <span className="font-medium">סה"כ לתשלום</span>
                    <span className="font-bold">₪{customerSubTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BusinessOrderSummary;
