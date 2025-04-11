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

  // Get cart data from navigation state
  const { cartProducts = [], orderId: cartOrderId, businessId } = location.state || {};

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
    // Redirect if no cart data is passed
    if (!cartProducts || cartProducts.length === 0 || !cartOrderId || !businessId) {
      console.error("Missing cart data, orderId, or businessId in location state.");
      navigate('/'); // Or back to the order page
      return;
    }

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
        const orderDocRef = doc(db, 'Orders', cartOrderId);
        const orderSnap = await getDoc(orderDocRef);
        if (orderSnap.exists()) {
          setOrderData(orderSnap.data());
        } else {
          throw new Error("Order not found");
        }

        const businessDocRef = doc(db, 'businesses', businessId);
        const businessSnap = await getDoc(businessDocRef);
        if (businessSnap.exists()) {
          setOrderData(prevData => ({
            ...prevData,
            businessName: businessSnap.data().businessName,
            communityName: businessSnap.data().communityName,
            logo: businessSnap.data().logo,
          }));
        } else {
          throw new Error("Business not found");
        }
      } catch (error) {
        console.error("Error fetching details:", error);
        Swal.fire('שגיאה', 'אירעה שגיאה בטעינת פרטי ההזמנה.', 'error');
        navigate('/'); // Redirect on error
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser, navigate, cartProducts, cartOrderId, businessId]);

  const calculateMemberTotal = (memberDetails) => {
    return Object.values(memberDetails)
      .filter((item) => typeof item === 'object' && item.Quantity)
      .reduce((total, item) => total + item.Quantity * item.Price, 0);
  };

  const calculateOrderTotal = () => {
    if (!orderData) return 0;
    return Object.keys(orderData)
      .filter(key => key.startsWith('Member_'))
      .reduce((total, memberKey) => total + calculateMemberTotal(orderData[memberKey]), 0);
  };

  const validateForm = () => {
    const errors = {};
    if (!userName.trim()) errors.userName = 'שם מלא הוא שדה חובה';
    if (!userPhone.trim()) errors.userPhone = 'מספר טלפון הוא שדה חובה';
    else if (!/^\d{9,10}$/.test(userPhone.replace(/-/g, ''))) errors.userPhone = 'מספר טלפון לא תקין';
    if (!userEmail.trim()) errors.userEmail = 'כתובת אימייל היא שדה חובה';
    else if (!/\S+@\S+\.\S+/.test(userEmail)) errors.userEmail = 'כתובת אימייל לא תקינה';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFinalSubmit = async () => {
    if (!validateForm()) {
      return; // Stop submission if form is invalid
    }

    setLoading(true);
    try {
      // 1. Create a new document in 'UserOrders' collection
      const userOrderData = {
        userId: currentUser ? currentUser.uid : 'guest',
        userName: userName,
        userPhone: userPhone,
        userEmail: userEmail,
        originalOrderId: cartOrderId,
        businessId: businessId,
        businessName: orderData?.businessName || 'N/A',
        products: cartProducts.map(p => ({
          productId: p.id,
          name: p.name,
          option: p.selectedOption,
          quantity: p.quantity,
          price: p.price,
        })),
        totalAmount: calculateOrderTotal(),
        orderTimestamp: serverTimestamp(),
        status: 'pending',
      };

      const userOrderRef = await addDoc(collection(db, 'UserOrders'), userOrderData);
      console.log("UserOrder created with ID: ", userOrderRef.id);

      // 2. Clear the global cart
      clearOrderItems(orderId);

      // 4. Redirect to confirmation page
      navigate(`/order-confirmation/${userOrderRef.id}`);

    } catch (error) {
      console.error("Error submitting final order:", error);
      Swal.fire('שגיאה', 'אירעה שגיאה בשליחת ההזמנה. נסה שוב.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!orderData) return (
    <div className="text-center py-12 text-gray-600">לא נמצאו נתונים להזמנה זו.</div>
  );

  return (
    <div dir="rtl" className="max-w-4xl mx-auto px-4 py-8">
      {/* Header Section */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">{orderData.orderName}</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">אזור:</span>
            <span className="font-medium">{orderData.areas?.join(', ') || 'ללא אזור'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">תאריך יצירה:</span>
            <span className="font-medium">
              {orderData.createdAt ? orderData.Order_Time.toDate().toLocaleString() : 'לא זמין'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">תאריך סיום:</span>
            <span className="font-medium">
              {orderData.endingTime ? orderData.endingTime.toDate().toLocaleString() : 'לא זמין'}
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

      {/* Total Amount Section */}
      <div className="bg-blue-50 rounded-lg p-4 mb-6 text-center">
        <span className="text-gray-700">סך כל ההזמנות:</span>
        <span className="text-xl font-bold text-blue-600 mr-2">₪{calculateOrderTotal().toFixed(2)}</span>
      </div>

      {/* Members Orders Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">הזמנות של לקוחות</h2>
        
        {Object.keys(orderData)
          .filter((key) => key.startsWith('Member_'))
          .map((memberKey, index) => {
            const memberDetails = orderData[memberKey];
            const memberTotal = calculateMemberTotal(memberDetails);

            return (
              <div key={index} className="bg-white rounded-lg shadow-sm p-6">
                {/* Member Header */}
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-800">{memberDetails.Name}</h3>
                  <span className="text-lg font-bold text-green-600">₪{memberTotal.toFixed(2)}</span>
                </div>

                {/* Member Contact Info */}
                <div className="flex flex-wrap gap-4 text-sm mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">טלפון:</span>
                    <span className="font-medium">{memberDetails.Phone}</span>
                  </div>
                  {memberDetails.Address && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">כתובת:</span>
                      <span className="font-medium">{memberDetails.Address}</span>
                    </div>
                  )}
                </div>

                {/* Products List */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <ul className="space-y-2">
                    {Object.entries(memberDetails)
                      .filter(([key, value]) => typeof value === 'object' && value.Quantity)
                      .map(([productKey, productDetails], idx) => (
                        <li key={idx} className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{productDetails.Name}</span>
                            {productDetails.Option && (
                              <span className="text-gray-500">({productDetails.Option})</span>
                            )}
                            <span className="text-gray-600">
                              × {productDetails.Quantity}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">₪{productDetails.Price}</span>
                            <span className="font-medium">₪{(productDetails.Quantity * productDetails.Price).toFixed(2)}</span>
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            );
          })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Order Details & User Form */}
        <div className="md:col-span-2 bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-6 border-b pb-3">פרטי ההזמנה שלך</h2>

          {/* User Details Form */}
          <div className="space-y-4 mb-6">
            <div>
              <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-1">שם מלא <span className="text-red-500">*</span></label>
              <input
                type="text"
                id="userName"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className={`w-full px-3 py-2 border ${formErrors.userName ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-2 ${formErrors.userName ? 'focus:ring-red-500' : 'focus:ring-blue-500'}`}
                required
              />
              {formErrors.userName && <p className="text-xs text-red-500 mt-1">{formErrors.userName}</p>}
            </div>
            <div>
              <label htmlFor="userPhone" className="block text-sm font-medium text-gray-700 mb-1">מספר טלפון <span className="text-red-500">*</span></label>
              <input
                type="tel"
                id="userPhone"
                value={userPhone}
                onChange={(e) => setUserPhone(e.target.value)}
                 className={`w-full px-3 py-2 border ${formErrors.userPhone ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-2 ${formErrors.userPhone ? 'focus:ring-red-500' : 'focus:ring-blue-500'}`}
                required
              />
               {formErrors.userPhone && <p className="text-xs text-red-500 mt-1">{formErrors.userPhone}</p>}
            </div>
             <div>
              <label htmlFor="userEmail" className="block text-sm font-medium text-gray-700 mb-1">כתובת אימייל <span className="text-red-500">*</span></label>
              <input
                type="email"
                id="userEmail"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                 className={`w-full px-3 py-2 border ${formErrors.userEmail ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-2 ${formErrors.userEmail ? 'focus:ring-red-500' : 'focus:ring-blue-500'}`}
                required
              />
               {formErrors.userEmail && <p className="text-xs text-red-500 mt-1">{formErrors.userEmail}</p>}
            </div>
          </div>

          {/* Payment/Delivery Info (Placeholder) */}
          <div className="border-t pt-4">
             <h3 className="text-lg font-medium mb-2">פרטי משלוח ותשלום</h3>
             {orderData?.shippingDateRange && (
                <p className="text-sm text-gray-600 mb-2">
                    <strong>תאריכי משלוח משוערים:</strong> {new Date(orderData.shippingDateRange.start).toLocaleDateString('he-IL')} - {new Date(orderData.shippingDateRange.end).toLocaleDateString('he-IL')}
                </p>
             )}
             <p className="text-sm text-gray-600">פרטי תשלום ישלחו לאחר אישור ההזמנה על ידי הספק.</p>
          </div>
        </div>

        {/* Cart Summary */}
        <div className="md:col-span-1 bg-gray-50 p-6 rounded-lg shadow-inner border">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">סיכום סל הקניות</h2>
          <div className="space-y-3 max-h-80 overflow-y-auto mb-4 pr-2">
            {cartProducts.map((item) => (
              <div key={item.uid} className="flex justify-between items-center text-sm">
                <div>
                  <span className="font-medium">{item.name}</span>
                  {item.selectedOption && <span className="text-gray-500 text-xs"> ({item.selectedOption})</span>}
                  <span className="block text-gray-600">x {item.quantity}</span>
                </div>
                <span className="font-medium">₪{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between font-semibold text-lg">
              <span>סה"כ לתשלום:</span>
              <span>₪{calculateOrderTotal().toFixed(2)}</span>
            </div>
             {orderData?.minimumOrderAmount > 0 && (
                <div className="text-sm text-center pt-2">
                    <span className={calculateOrderTotal() < orderData.minimumOrderAmount ? 'text-red-600' : 'text-green-600'}>
                        {calculateOrderTotal() < orderData.minimumOrderAmount
                            ? `שימו לב: סכום ההזמנה נמוך מהמינימום (${orderData.minimumOrderAmount}₪)`
                            : `✓ עברת את סכום המינימום (${orderData.minimumOrderAmount}₪)`
                        }
                    </span>
                </div>
            )}
            <button
              onClick={handleFinalSubmit}
              disabled={loading || (orderData?.minimumOrderAmount > 0 && calculateOrderTotal() < orderData.minimumOrderAmount)}
              className={`w-full mt-4 bg-green-600 text-white py-2.5 px-4 rounded-lg shadow-md transition-colors font-medium ${loading || (orderData?.minimumOrderAmount > 0 && calculateOrderTotal() < orderData.minimumOrderAmount) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-700'}`}
            >
              {loading ? 'שולח הזמנה...' : 'אשר ושלח הזמנה'}
            </button>
             <button
                onClick={() => navigate(`/order/${cartOrderId}`)}
                className="w-full mt-2 text-sm text-center text-blue-600 hover:underline"
            >
                חזור לעריכת ההזמנה
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessOrderSummary;
