import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useAuth } from '../contexts/authContext';
import LoadingSpinner from './LoadingSpinner';
import { Link } from 'react-router-dom';

const MyOrders = () => {
    const { currentUser } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchOrders = async () => {
            if (!currentUser || !currentUser.uid) {
                setError("אנא התחבר כדי לראות את ההזמנות שלך.");
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const userDocRef = doc(db, "users", currentUser.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    const orderIds = userData.orders || []; // Assuming 'orders' is the array field

                    if (orderIds.length === 0) {
                        setOrders([]);
                        setLoading(false);
                        return;
                    }

                    const fetchedOrders = await Promise.all(
                        orderIds.map(async (orderId) => {
                            try {
                                const orderDocRef = doc(db, "customerOrders", orderId);
                                const orderDocSnap = await getDoc(orderDocRef);
                                if (orderDocSnap.exists()) {
                                    return { id: orderId, ...orderDocSnap.data() };
                                } else {
                                    console.warn(`Order with ID ${orderId} not found.`);
                                    return null; // Handle cases where an order might be deleted
                                }
                            } catch (orderError) {
                                console.error(`Error fetching order ${orderId}:`, orderError);
                                return null; // Handle fetch errors for individual orders
                            }
                        })
                    );

                    // Filter out nulls, include only completed orders, and sort by date (newest first)
                    const validOrders = fetchedOrders
                        .filter(order => {
                            // First, make sure order exists
                            if (order === null) return false;
                            
                            // Check payment status - include only completed/paid orders
                            const status = (order.paymentStatus || order.status || '').toLowerCase();
                            return status === 'completed' || status === 'paid';
                        })
                        .sort((a, b) => {
                            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
                            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
                            return dateB - dateA; // Sort descending
                        });

                    setOrders(validOrders);
                } else {
                    setError("לא נמצאו נתוני משתמש.");
                }
            } catch (err) {
                console.error("Error fetching user orders:", err);
                setError("אירעה שגיאה בטעינת ההזמנות.");
            } finally {
                setLoading(false);
            }
        };

        fetchOrders();
    }, [currentUser]);

    // Helper function to format date
    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            // Handle both Firestore Timestamp and ISO string dates
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleDateString('he-IL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });
        } catch (e) {
            console.error("Error formatting date:", e);
            return 'Invalid Date';
        }
    };

    // Helper function to get status styles
    const getStatusBadge = (status) => {
        switch (status?.toLowerCase()) {
            case 'completed':
            case 'paid':
                return 'bg-green-100 text-green-800';
            case 'pending_payment':
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            case 'cancelled':
            case 'failed':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    if (loading) {
        return <LoadingSpinner />;
    }

    if (error) {
        return <div className="text-center text-red-600 mt-10 font-semibold">{error}</div>;
    }

    return (
        <div dir="rtl" className="container mx-auto max-w-4xl px-4 py-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">ההזמנות שלי</h1>

            {orders.length === 0 ? (
                <p className="text-center text-gray-600 mt-10">עדיין לא ביצעת הזמנות.</p>
            ) : (
                <div className="space-y-6">
                    {orders.map((order) => (
                        <div key={order.id} className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                            <div className="p-4 sm:p-6 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-800">
                                        הזמנה #{order.id.substring(0, 8)}...
                                    </h2>
                                    <p className="text-sm text-gray-500">
                                        תאריך: {formatDate(order.createdAt)}
                                    </p>
                                </div>
                                <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusBadge(order.paymentStatus || order.status)}`}>
                                    {order.paymentStatus || order.status || 'לא ידוע'}
                                </span>
                            </div>

                            <div className="p-4 sm:p-6">
                                <div className="mb-4">
                                    <h3 className="text-md font-semibold text-gray-700 mb-2">סיכום הזמנה:</h3>
                                    {/* Iterate through orderBreakdown if it exists */}
                                    {order.orderBreakdown && Object.entries(order.orderBreakdown).map(([businessOrderId, businessOrder]) => (
                                        <div key={businessOrderId} className="mb-3 pl-4 border-r-2 border-blue-200">
                                            <p className="text-sm font-medium text-gray-800">{businessOrder.businessName || 'עסק לא ידוע'}</p>
                                            <ul className="list-disc list-inside text-sm text-gray-600 mt-1 space-y-1">
                                                {businessOrder.items?.map((item, index) => (
                                                    <li key={index}>
                                                        {item.productName} (x{item.quantity})
                                                        {item.selectedOption && item.selectedOption !== "None" && ` - ${item.selectedOption}`}
                                                        <span> - ₪{(item.price * item.quantity).toFixed(2)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                    {/* Fallback for older order structure */}
                                    {!order.orderBreakdown && order.orderItems?.map((item, index) => (
                                         <p key={index} className="text-sm text-gray-600">{item.productName} (x{item.quantity})</p>
                                    ))}
                                </div>

                                <div className="border-t border-gray-200 pt-4 flex justify-between items-center">
                                    <span className="text-md font-semibold text-gray-800">סה"כ לתשלום:</span>
                                    <span className="text-lg font-bold text-blue-600">
                                        ₪{order.grandTotal?.toFixed(2) || order.totalAmount?.toFixed(2) || '0.00'}
                                    </span>
                                </div>
                                {order.customerDetails?.pickupSpot && (
                                     <p className="text-sm text-gray-500 mt-2">נקודת איסוף: <span className="font-medium">{order.customerDetails.pickupSpot}</span></p>
                                )}
                                 {order.pickupSpotName && (
                                     <p className="text-sm text-gray-500 mt-2">נקודת איסוף: <span className="font-medium">{order.pickupSpotName}</span></p>
                                )}
                                {/* Add a link/button to view full order details if you have such a page */}
                                {/* <div className="mt-4 text-right">
                                    <Link to={`/order-details/${order.id}`} className="text-sm text-blue-600 hover:underline">
                                        פרטים נוספים
                                    </Link>
                                </div> */}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MyOrders;
