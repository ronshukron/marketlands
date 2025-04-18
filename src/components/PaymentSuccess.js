import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from '../firebase/firebase';
import './PaymentSuccess.css';
import LoadingSpinner from './LoadingSpinner';
import OngoingOrders from './OngoingOrders'; // Import OngoingOrders component
import { useAuth } from '../contexts/authContext';

const PaymentSuccess = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [loading, setLoading] = useState(true);
    const [orderDetails, setOrderDetails] = useState(null);
    const [error, setError] = useState(null);
    const { userLoggedIn } = useAuth();

    useEffect(() => {
        // Parse query parameters
        const queryParams = new URLSearchParams(location.search);
        const response = queryParams.get('response');
        const customerOrderId = queryParams.get('cField1');
        const orderIdsParam = queryParams.get('cField2');
        
        console.log('Payment response:', response);
        console.log('Customer Order ID:', customerOrderId);
        console.log('Order IDs:', orderIdsParam);
        
        const updateOrderStatus = async () => {
            if (response === 'success' && customerOrderId) {
                try {
                    // Parse the orderIds from the URL parameter
                    // The parameter might be in format: [%22orderId1%22,%22orderId2%22]
                    let orderIds = [];
                    try {
                        orderIds = JSON.parse(decodeURIComponent(orderIdsParam).replace(/%22/g, '"'));
                    } catch (e) {
                        console.error('Error parsing orderIds:', e);
                    }
                    
                    // Get the customer order
                    const customerOrderRef = doc(db, "customerOrders", customerOrderId);
                    const customerOrderSnap = await getDoc(customerOrderRef);
                    
                    if (customerOrderSnap.exists()) {
                        const orderData = customerOrderSnap.data();
                        
                        // Update the customer order status
                        await updateDoc(customerOrderRef, {
                            status: 'completed',
                            paymentStatus: 'completed'
                        });
                        
                        setOrderDetails(orderData);
                    } else {
                        throw new Error('Order not found');
                    }
                    
                    setLoading(false);
                } catch (error) {
                    console.error('Error updating order status:', error);
                    setError('חלה שגיאה בעדכון סטטוס ההזמנה. אנא צור קשר עם שירות הלקוחות.');
                    setLoading(false);
                }
            } else {
                setError('סטטוס התשלום אינו תקין. אנא צור קשר עם שירות הלקוחות.');
                setLoading(false);
            }
        };
        
        updateOrderStatus();
    }, [location]);

    const handleBackToHome = () => {
        navigate('/');
    };

    const handleViewOrder = () => {
        navigate('/my-orders');
    };

    const handleRegister = () => {
        // Break out of iframe and navigate to registration page
        window.top.location.href = '/user-register';
    };

    if (loading) {
        return <LoadingSpinner />;
    }

    if (error) {
        return (
            <div className="payment-success-container">
                <h1>שגיאה בעיבוד התשלום</h1>
                <p>{error}</p>
                <button onClick={handleBackToHome} className="back-home-button">חזור לדף הבית</button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4" dir="rtl">
            <div className="max-w-3xl mx-auto mb-12">
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                    <div className="bg-blue-600 p-6 flex flex-col items-center">
                        <div className="bg-white rounded-full p-3 mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h1 className="text-3xl font-bold text-white text-center">התשלום בוצע בהצלחה!</h1>
                    </div>
                    
                    <div className="p-8 text-center">
                        <p className="text-xl text-gray-700 mb-6">
                            תודה על הזמנתך. פרטי ההזמנה נשמרו במערכת ויישלחו אליך גם בדוא"ל.
                        </p>

                        {!userLoggedIn && (
                            <>
                                <p className="text-gray-600 mb-8">
                                    ניתן לעקוב אחרי ההזמנה שלכם אם נרשמים לאתר באותו אימייל שאיתו ביצעתם את התשלום
                                </p>
                                <button 
                                    onClick={handleRegister} 
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-lg transition-colors duration-200 shadow-md"
                                >
                                    הירשם לאתר
                                </button>
                            </>
                        )}
                        
                        {orderDetails && (
                            <div className="order-summary">
                                <h2>פרטי ההזמנה</h2>
                                <p><strong>שם:</strong> {orderDetails.customerDetails?.name}</p>
                                <p><strong>סכום:</strong> ₪{orderDetails.grandTotal}</p>
                                {orderDetails.customerDetails?.pickupSpot && (
                                    <p><strong>נקודת איסוף:</strong> {orderDetails.customerDetails.pickupSpot}</p>
                                )}
                            </div>
                        )}
                        
                        <div className="button-group">
                            <button onClick={handleViewOrder} className="view-order-button">צפה בהזמנות שלי</button>
                            <button 
                                onClick={handleBackToHome} 
                                className="mt-6 inline-block px-6 py-2 border border-blue-600  rounded-md hover:bg-blue-50 transition-colors duration-200"
                            >
                                חזרה לדף הבית
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="max-w-6xl mx-auto">
                <div className="bg-white rounded-xl shadow-md overflow-hidden p-6 mb-4">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6">הזמנות פעילות נוספות</h2>
                    <OngoingOrders />
                </div>
            </div>
        </div>
    );
};

export default PaymentSuccess;