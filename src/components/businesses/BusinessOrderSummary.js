import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { doc, getDoc, addDoc, collection, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import { useCart } from '../../contexts/CartContext';
import LoadingSpinner from '../LoadingSpinner';
import Swal from 'sweetalert2';

const BusinessOrderSummary = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { clearOrderItems } = useCart();

  const { orderId } = useParams();
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customerOrders, setCustomerOrders] = useState([]);

  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    const fetchOrderData = async () => {
      const docRef = doc(db, 'Orders', orderId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setOrderData(docSnap.data());
      }
      setLoading(false);
    };

    fetchOrderData();
  }, [orderId]);

  useEffect(() => {
    // Fetch user details if logged in
    if (currentUser) {
      setUserEmail(currentUser.email || '');
      // Fetch additional user details if stored (e.g., name, phone)
      const fetchUserDetails = async () => {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          setUserName(userData.displayName || '');
          setUserPhone(userData.phoneNumber || '');
        }
      };
      fetchUserDetails();
    }

    // Fetch order and business details for display
    const fetchData = async () => {
      setLoading(true);
      try {
        const orderDocRef = doc(db, 'Orders', orderId);
        const orderSnap = await getDoc(orderDocRef);
        if (orderSnap.exists()) {
          const fetchedOrderData = orderSnap.data();
          setOrderData(fetchedOrderData);

          // Fetch customer orders using customerOrderIds from the main order data
          const customerOrderIds = fetchedOrderData.customerOrderIds || [];
          const fetchedCustomerOrders = await Promise.all(
            customerOrderIds.map(async (customerOrderId) => {
              const customerOrderDocRef = doc(db, 'customerOrders', customerOrderId);
              const customerOrderSnap = await getDoc(customerOrderDocRef);
              // console.log('customerOrderSnap', customerOrderSnap.data()); // Keep for debugging if needed
              if (customerOrderSnap.exists()) {
                return { id: customerOrderId, ...customerOrderSnap.data() };
              } else {
                console.warn(`Customer order ${customerOrderId} not found`);
                return null;
              }
            })
          );
          // console.log('fetchedCustomerOrders', fetchedCustomerOrders); // Keep for debugging
          // Filter out any null values
          const validCustomerOrders = fetchedCustomerOrders.filter(order => order !== null);
          // console.log('validCustomerOrders', validCustomerOrders); // Keep for debugging
          setCustomerOrders(validCustomerOrders);

        } else {
          throw new Error("Order not found");
        }

        // Fetch business details (using businessId from the main order data)
        const businessDocRef = doc(db, 'businesses', orderSnap.data().businessId);
        const businessSnap = await getDoc(businessDocRef);
        if (businessSnap.exists()) {
          // Add business details to the main orderData state
          setOrderData(prevData => ({
            ...prevData,
            businessName: businessSnap.data().businessName,
            communityName: businessSnap.data().communityName,
            logo: businessSnap.data().logo,
          }));
        } else {
          // If business not found, maybe still proceed but log warning?
          console.warn("Business details not found for ID:", orderSnap.data().businessId);
          // Or throw new Error("Business not found");
        }
      } catch (error) {
        console.error("Error fetching details:", error);
        Swal.fire('שגיאה', 'אירעה שגיאה בטעינת פרטי ההזמנה.', 'error');
        // navigate('/'); // Consider redirecting on critical errors
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser, navigate, orderId]);

  // NEW FUNCTION: Extracts the specific order details for the current business
  // from a given customerOrder object.
  const getBusinessSpecificOrder = (customerOrder) => {
    if (!customerOrder || !customerOrder.orderBreakdown) {
      console.warn("Invalid customerOrder passed to getBusinessSpecificOrder:", customerOrder);
      return null; // Return null if data is missing
    }
    // Use the orderId from useParams to access the correct part of the breakdown
    const businessOrderDetails = customerOrder.orderBreakdown[orderId];

    if (!businessOrderDetails) {
      // This might happen if the customer didn't order from this specific business order form
      // console.log(`No order found for business order ID ${orderId} in customer order ${customerOrder.id}`);
      return null;
    }

    return businessOrderDetails; // Return the specific details { businessId, businessName, items, subTotal }
  };

  // --- Calculate Total Functions ---
  // Calculates the total for a specific business's part of a customer order
  const calculateBusinessSubTotal = (businessOrderDetails) => {
    if (!businessOrderDetails || !businessOrderDetails.items) {
      return 0;
    }
    // Use the subTotal if available, otherwise calculate from items
    // return businessOrderDetails.subTotal || 0; // Prefer pre-calculated subTotal
    // Or recalculate if needed:
     return businessOrderDetails.items.reduce((total, item) => {
       const price = typeof item.price === 'number' ? item.price : 0;
       const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
       return total + (price * quantity);
     }, 0);
  };

  // Calculates the grand total across all displayed customer orders for this business
  const calculateGrandTotalForBusiness = () => {
    return customerOrders.reduce((total, customerOrder) => {
      const businessOrderDetails = getBusinessSpecificOrder(customerOrder);
      return total + calculateBusinessSubTotal(businessOrderDetails);
    }, 0);
  };

  // --- Rendering Logic ---
  if (loading) return <LoadingSpinner />;
  if (!orderData) return (
    <div className="text-center py-12 text-gray-600">לא נמצאו נתונים להזמנה זו.</div>
  );

  return (
    <div dir="rtl" className="max-w-4xl mx-auto px-4 py-8">
      {/* Header Section - Displaying main Order details */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        {/* Display business logo if available */}
        {orderData.logo && (
          <img src={orderData.logo} alt={`${orderData.businessName} Logo`} className="h-16 w-auto mb-4 mx-auto" />
        )}
        <h1 className="text-2xl font-bold text-gray-800 mb-1 text-center">{orderData.businessName || 'פרטי הזמנה'}</h1>
        <p className="text-center text-gray-500 mb-4">{orderData.communityName}</p>
        <h2 className="text-xl font-semibold text-gray-700 mb-4">{orderData.orderName}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">אזור:</span>
            <span className="font-medium">{orderData.areas?.join(', ') || 'ללא אזור'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">תאריך יצירה:</span>
            <span className="font-medium">
              {orderData.Order_Time ? orderData.Order_Time.toDate().toLocaleString('he-IL') : 'לא זמין'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">תאריך סיום:</span>
            <span className="font-medium">
              {orderData.endingTime ? orderData.endingTime.toDate().toLocaleString('he-IL') : 'לא זמין'}
            </span>
          </div>
        </div>
        {orderData.description && (
          <div className="mb-4">
            <h3 className="font-medium text-gray-700 mb-1">פרטי ההזמנה:</h3>
            <p className="text-gray-600 bg-gray-50 p-3 rounded whitespace-pre-line">{orderData.description}</p>
          </div>
        )}
        {orderData.shippingDateRange && (
          <div className="mb-4 flex items-start">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2 text-blue-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div>
              <h3 className="font-medium text-gray-700">זמן אספקה:</h3>
              <p className="text-gray-600">
                {new Date(orderData.shippingDateRange.start).toLocaleDateString('he-IL')} - {new Date(orderData.shippingDateRange.end).toLocaleDateString('he-IL')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Total Amount Section - Now shows total for THIS business across all customers */}
      <div className="bg-blue-50 rounded-lg p-4 mb-6 text-center">
        <span className="text-gray-700">סך כל ההזמנות מעסק זה:</span>
        <span className="text-xl font-bold text-blue-600 mr-2">₪{calculateGrandTotalForBusiness().toFixed(2)}</span>
      </div>

      {/* Customer Orders Section - Displaying individual customer orders */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">הזמנות של לקוחות מעסק זה</h2>

        {customerOrders.length === 0 && (
          <p className="text-gray-500 text-center py-4">לא נמצאו הזמנות מלקוחות עבור הזמנה זו.</p>
        )}

        {customerOrders.map((customerOrder) => {
          // Get the part of the customer's order relevant to this business
          const businessOrderDetails = getBusinessSpecificOrder(customerOrder);

          // If the customer didn't order anything from this specific business order, skip rendering
          if (!businessOrderDetails || !businessOrderDetails.items || businessOrderDetails.items.length === 0) {
            return null;
          }

          const customerSubTotal = calculateBusinessSubTotal(businessOrderDetails);

          return (
            <div key={customerOrder.id} className="bg-white rounded-lg shadow-sm p-6">
              {/* Customer Header */}
              <div className="flex justify-between items-center mb-4 pb-2 border-b">
                <h3 className="text-lg font-medium text-gray-800">{customerOrder.customerDetails?.name || 'לקוח לא ידוע'}</h3>
                <span className="text-lg font-bold text-green-600">₪{customerSubTotal.toFixed(2)}</span>
              </div>

              {/* Customer Contact Info */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm mb-4">
                {customerOrder.customerDetails?.phone && (
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    <span className="font-medium">{customerOrder.customerDetails.phone}</span>
                  </div>
                )}
                 {customerOrder.customerDetails?.email && (
                  <div className="flex items-center gap-2">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    <span className="font-medium">{customerOrder.customerDetails.email}</span>
                  </div>
                )}
                {customerOrder.customerDetails?.address && (
                  <div className="flex items-center gap-2">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span className="font-medium">{customerOrder.customerDetails.address}</span>
                  </div>
                )}
              </div>

              {/* Products List for THIS business */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-600 mb-2">פריטים שהוזמנו מעסק זה:</h4>
                <ul className="space-y-2">
                  {businessOrderDetails.items.map((item, idx) => (
                    <li key={idx} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.productName || item.Name || 'מוצר לא ידוע'}</span>
                        {item.selectedOption && item.selectedOption !== "ללא אופציות" && (
                          <span className="text-gray-500">({item.selectedOption})</span>
                        )}
                        <span className="text-gray-600">
                          × {item.quantity}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">₪{item.price?.toFixed(2)}</span>
                        <span className="font-medium">₪{(item.quantity * item.price).toFixed(2)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BusinessOrderSummary;
