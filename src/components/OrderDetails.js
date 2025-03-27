import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteField } from "firebase/firestore";
import { db } from '../firebase/firebase';
import Swal from 'sweetalert2';
import LoadingSpinner from './LoadingSpinner';

const OrderDetails = () => {
    const { orderId, memberId } = useParams();
    const [orderDetails, setOrderDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchOrderDetails = async () => {
            const orderDocRef = doc(db, "Orders", orderId);
            const orderDoc = await getDoc(orderDocRef);

            if (orderDoc.exists()) {
                const orderData = orderDoc.data();
                const memberDetails = orderData[memberId];

                setOrderDetails({
                    ...memberDetails,
                    orderName: orderData.Order_Name || orderData.orderName,
                    producerName: orderData.Producer_Name || orderData.businessName,
                    orderTime: orderData.Order_Time ? 
                      orderData.Order_Time.toDate().toLocaleString() : 
                      new Date(memberDetails.Mem_Order_Time).toLocaleString('he-IL')
                });
            }
            setLoading(false);
        };

        fetchOrderDetails();
    }, [orderId, memberId]);

    const handleDeleteOrder = async () => {
        const orderDocRef = doc(db, "Orders", orderId);

        try {
            const orderDoc = await getDoc(orderDocRef);
            if (!orderDoc.exists()) {
                throw new Error("Order not found");
            }

            const orderData = orderDoc.data();
            const memberDetails = orderData[memberId];

            // Calculate total amount for the deleted order
            const totalOrderValue = Object.entries(memberDetails)
                .filter(([key]) => key !== 'Name')
                .reduce((sum, [key, value]) => {
                    return sum + (value.Quantity * value.Price);
                }, 0);

            await updateDoc(orderDocRef, {
                [memberId]: deleteField(),
                Total_Amount: orderData.Total_Amount - totalOrderValue
            });

            Swal.fire({
                icon: 'success',
                title: 'ההזמנה נמחקה בהצלחה',
                text: 'פרטי ההזמנה שלך נמחקו',
                showConfirmButton: true
            }).then(() => {
                navigate('/');
            });
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'שגיאה',
                text: 'נכשלה מחיקת ההזמנה',
                showConfirmButton: true
            });
            console.error("Error deleting order:", error);
        }
    };

    // Calculate total order value
    const calculateTotal = () => {
        if (!orderDetails) return 0;
        
        return Object.entries(orderDetails)
            .filter(([key, value]) => 
                typeof value === 'object' && 
                value !== null && 
                value.Price && 
                value.Quantity
            )
            .reduce((sum, [_, item]) => sum + (item.Price * item.Quantity), 0);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex justify-center items-center">
                <LoadingSpinner />
            </div>
        );
    }

    if (!orderDetails) {
        return (
            <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 text-center" dir="rtl">
                <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-sm p-8">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">הזמנה לא נמצאה</h1>
                    <p className="text-gray-600 mb-6">לא הצלחנו למצוא את פרטי ההזמנה המבוקשת</p>
                    <button 
                        onClick={() => navigate('/my-orders')}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        חזרה להזמנות שלי
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8" dir="rtl">
            <div className="max-w-4xl mx-auto">
                <div className="mb-6">
                    <button 
                        onClick={() => navigate('/my-orders')}
                        className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-1" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        חזרה להזמנות שלי
                    </button>
                </div>

                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    {/* Order header */}
                    <div className="bg-blue-600 text-white px-6 py-4">
                        <h1 className="text-2xl font-bold">פרטי הזמנה</h1>
                    </div>
                    
                    <div className="p-6">
                        {/* Order summary */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div>
                                <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                                    פרטי הזמנה
                                </h2>
                                <div className="space-y-3">
                                    <div>
                                        <span className="block text-sm text-gray-500">שם המזמין</span>
                                        <span className="block text-base font-medium text-gray-900">{orderDetails.Name}</span>
                                    </div>
                                    <div>
                                        <span className="block text-sm text-gray-500">שם הספק</span>
                                        <span className="block text-base font-medium text-gray-900">{orderDetails.producerName}</span>
                                    </div>
                                    {orderDetails.orderName && (
                                        <div>
                                            <span className="block text-sm text-gray-500">שם ההזמנה</span>
                                            <span className="block text-base font-medium text-gray-900">{orderDetails.orderName}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div>
                                <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                                    פרטי תשלום
                                </h2>
                                <div className="space-y-3">
                                    <div>
                                        <span className="block text-sm text-gray-500">תאריך הזמנה</span>
                                        <span className="block text-base font-medium text-gray-900">
                                            {orderDetails.orderTime}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="block text-sm text-gray-500">סכום כולל</span>
                                        <span className="block text-lg font-bold text-blue-600">
                                            ₪{calculateTotal().toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Products list */}
                        <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
                            פירוט המוצרים
                        </h2>
                        
                        <div className="space-y-4">
                            {Object.entries(orderDetails).map(([key, value]) => {
                                if (
                                    typeof value === 'object' && 
                                    value !== null && 
                                    value.Name && 
                                    value.Price && 
                                    value.Quantity
                                ) {
                                    return (
                                        <div key={key} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="text-lg font-medium text-gray-900">{value.Name}</h3>
                                                    {value.Option && value.Option !== "None" && (
                                                        <p className="text-sm text-gray-600">
                                                            <span className="font-medium">אופציה:</span> {value.Option}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm text-gray-600">
                                                        ₪{value.Price} × {value.Quantity}
                                                    </p>
                                                    <p className="text-lg font-medium text-blue-600">
                                                        ₪{(value.Price * value.Quantity).toFixed(2)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })}
                        </div>
                        
                        {/* Total summary */}
                        <div className="mt-8 border-t border-gray-200 pt-6">
                            <div className="flex justify-between items-center">
                                <span className="text-lg font-medium">סה"כ לתשלום:</span>
                                <span className="text-xl font-bold text-blue-600">₪{calculateTotal().toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderDetails;
