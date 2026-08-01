import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase/firebase';
import { useAuth } from '../contexts/authContext';
import LoadingSpinner from './LoadingSpinner';
import { Link } from 'react-router-dom';
import {
    computeCustomerOrderGrandTotal,
    fetchCustomerOrderById,
    getLegacyCustomerOrderIds,
    shouldIncludeCustomerOrderInList,
    getOrderDeliveryDateFromCustomerOrder,
    getOrderPickupSpot,
} from '../services/customerOrderService';
import RefundRequestForm from './RefundRequestForm';
import {
    filterCustomerActiveLines,
    isCustomerOrderOwner,
} from '../utils/customerOrderUtils';
import { ensureLineIdsInBreakdown } from './adminV5/deliveryWeighingV5/v7/orderDraftUtils';

const MyOrders = () => {
    const { currentUser } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
    const [currentOrderId, setCurrentOrderId] = useState(null);
    const [isExternalRefund, setIsExternalRefund] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [refundSuccess, setRefundSuccess] = useState(false);
    const [refundStatuses, setRefundStatuses] = useState({});

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
                    const legacyOrderIds = getLegacyCustomerOrderIds(userDocSnap.data());
                    const legacyOrderIdSet = new Set(legacyOrderIds);
                    // Owner-scoped queries are required by the Firestore rules.
                    const fetchWeeklyByUserPromise = (async () => {
                        try {
                            const [standardSnap, delayedSnap] = await Promise.all([
                                getDocs(query(collection(db, 'customerOrders'), where('userId', '==', currentUser.uid))),
                                getDocs(query(collection(db, 'customerOrdersDelayed'), where('userId', '==', currentUser.uid))),
                            ]);
                            const standard = standardSnap.docs.map((d) => ({
                                id: d.id,
                                customerOrderSource: 'customerOrders',
                                ...d.data(),
                                isIndependent: false,
                            }));
                            const delayed = delayedSnap.docs.map((d) => ({
                                id: d.id,
                                customerOrderSource: 'customerOrdersDelayed',
                                ...d.data(),
                                isIndependent: false,
                            }));
                            return [...standard, ...delayed];
                        } catch (e) {
                            console.error('Failed weekly fallback query', e);
                            return [];
                        }
                    })();

                    const fetchIndependentByUserPromise = (async () => {
                        try {
                            const qInd = query(collection(db, 'IndepentCustomerOrders'), where('userId', '==', currentUser.uid));
                            const snap = await getDocs(qInd);
                            return snap.docs.map((d) => ({ id: d.id, ...d.data(), isIndependent: true }));
                        } catch (e) {
                            console.error('Failed independent fallback query', e);
                            return [];
                        }
                    })();

                    const fetchLegacyWeeklyPromise = Promise.all(
                        legacyOrderIds.map(async (orderId) => {
                            try {
                                const order = await fetchCustomerOrderById(orderId);
                                if (!order || (order.userId && order.userId !== currentUser.uid)) return null;
                                return { ...order, isIndependent: false };
                            } catch (legacyError) {
                                console.error(`Failed legacy order lookup ${orderId}`, legacyError);
                                return null;
                            }
                        })
                    );

                    const [fetchedWeekly, fetchedIndependent, weeklyByUser, independentByUser] = await Promise.all([
                        fetchLegacyWeeklyPromise,
                        Promise.resolve([]),
                        fetchWeeklyByUserPromise,
                        fetchIndependentByUserPromise
                    ]);

                    // Merge arrays and de-duplicate by id
                    const mergeUnique = (arr) => {
                        const map = new Map();
                        for (const item of (arr || [])) {
                            if (item && item.id && !map.has(item.id)) map.set(item.id, item);
                        }
                        return Array.from(map.values());
                    };

                    const weeklyCombined = mergeUnique([...(fetchedWeekly || []).filter(Boolean), ...(weeklyByUser || [])])
                        .filter((order) => (
                            isCustomerOrderOwner(order, currentUser.uid)
                            || (!order.userId && legacyOrderIdSet.has(order.id))
                        ));
                    const independentCombined = mergeUnique([...(fetchedIndependent || []).filter(Boolean), ...(independentByUser || [])])
                        .filter((order) => isCustomerOrderOwner(order, currentUser.uid));

                    const validWeekly = (weeklyCombined || [])
                        .filter((order) => order !== null && shouldIncludeCustomerOrderInList(order))
                        .map((order) => {
                            if (!order.orderBreakdown) return order;
                            return {
                                ...order,
                                orderBreakdown: ensureLineIdsInBreakdown(order.id, order.orderBreakdown).breakdown,
                            };
                        });

                    // Independent: include all so we can show status (held/pending/etc.)
                    const validIndependent = (independentCombined || []).filter((order) => order !== null);

                    const combinedOrders = [...validIndependent, ...validWeekly].sort((a, b) => {
                        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
                        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
                        return dateB - dateA; // Sort descending
                    });

                    setOrders(combinedOrders);

                    // Fetch refund statuses for all orders
                    fetchRefundStatuses(combinedOrders.map(order => order.id));

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
    
    // New function to fetch refund statuses
    const fetchRefundStatuses = async (orderIds) => {
        try {
            // Create a map to store refund statuses by order ID
            const statusMap = {};
            
            // Query refunds collection for any refunds related to these orders
            const refundsRef = collection(db, 'refunds');
            const q = query(refundsRef, where('userId', '==', currentUser.uid));
            const refundsSnapshot = await getDocs(q);
            
            refundsSnapshot.forEach(doc => {
                const refundData = doc.data();
                statusMap[refundData.orderId] = {
                    status: refundData.status,
                    id: doc.id,
                    createdAt: refundData.createdAt
                };
            });
            
            setRefundStatuses(statusMap);
        } catch (error) {
            console.error("Error fetching refund statuses:", error);
        }
    };

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

    // Helper to derive payment status (normalized)
    const derivePaymentStatus = (order) => {
        return (order?.paymentStatus || order?.status || order?.orderBreakdown?.paymentStatus || '').toLowerCase();
    };

    // Helper to get display status (raw text)
    const getDisplayStatus = (order) => {
        return order?.paymentStatus || order?.status || order?.orderBreakdown?.paymentStatus || 'לא ידוע';
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
            case 'held':
                return 'bg-blue-100 text-blue-800';
            case 'cancelled':
            case 'failed':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    // Helper function to get refund status badge
    const getRefundStatusBadge = (orderId) => {
        const refund = refundStatuses[orderId];
        if (!refund) return null;
        
        let badgeClass = '';
        let statusText = '';
        
        switch (refund.status) {
            case 'pending':
                badgeClass = 'bg-yellow-100 text-yellow-800 border border-yellow-200';
                statusText = 'בקשת זיכוי בטיפול';
                break;
            case 'completed':
                badgeClass = 'bg-green-100 text-green-800 border border-green-200';
                statusText = 'זיכוי אושר';
                break;
            case 'rejected':
                badgeClass = 'bg-red-100 text-red-800 border border-red-200';
                statusText = 'זיכוי נדחה';
                break;
            default:
                return null;
        }
        
        return (
            <div className={`text-xs font-medium px-2.5 py-1 rounded-full ${badgeClass} mt-2`}>
                {statusText}
            </div>
        );
    };

    const handleRefundRequest = async (formData) => {
        setIsSubmitting(true);

        try {
            const userDocRef = doc(db, "users", auth.currentUser.uid);
            const userDocSnap = await getDoc(userDocRef);
            const userData = userDocSnap.exists() ? userDocSnap.data() : {};

            let refundData = {
                userId: auth.currentUser.uid,
                userEmail: auth.currentUser.email,
                userName: userData.name || auth.currentUser.displayName || '',
                userPhone: userData.phone || '',
                reason: formData.reason,
                status: 'pending',
                createdAt: serverTimestamp(),
                isExternalOrder: !formData.orderId,
                refundItems: formData.refundItems || [],
                requestedRefundAmount: formData.requestedRefundAmount || 0,
            };

            if (formData.orderId) {
                const orderToRefund = orders.find((order) => order.id === formData.orderId);
                refundData = {
                    ...refundData,
                    orderId: formData.orderId,
                    orderAmount: orderToRefund?.orderBreakdown
                        ? computeCustomerOrderGrandTotal(orderToRefund)
                        : (orderToRefund?.totalAmount || orderToRefund?.grandTotal || formData.orderAmount || 0),
                    orderDate: orderToRefund?.createdAt || serverTimestamp(),
                    businessId: orderToRefund?.businessId || '',
                    businessName: orderToRefund?.businessName || 'Unknown Business',
                    items: orderToRefund?.items || orderToRefund?.orderItems || [],
                    orderBreakdown: orderToRefund?.orderBreakdown || {},
                };
            }

            await addDoc(collection(db, 'refunds'), refundData);

            setRefundSuccess(true);
            setTimeout(() => {
                setIsRefundModalOpen(false);
                setCurrentOrderId(null);
                setIsExternalRefund(false);
                setRefundSuccess(false);
            }, 2000);
        } catch (error) {
            console.error('Error submitting refund request:', error);
            alert('אירעה שגיאה בהגשת בקשת ההחזר. אנא נסה שוב מאוחר יותר.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openRefundModal = (orderId = null) => {
        setCurrentOrderId(orderId);
        setIsExternalRefund(!orderId);
        setIsRefundModalOpen(true);
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
                <div className="text-center py-8">
                    <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-6 mb-6">
                        <p className="text-lg text-gray-700 mb-4">לא נמצאו הזמנות קודמות בחשבון שלך</p>
                        
                        {/* Explanation for users */}
                        {/* <p className="text-sm text-gray-600 mb-5">
                            אם ביצעת הזמנה ללא התחברות לחשבון שלך, או שאתה רוצה לבקש החזר כספי,
                            <br />אנא השתמש בכפתור למטה להגשת בקשה להחזר או לעזרה בזיהוי ההזמנה שלך.
                        </p> */}
                        
                        {/* Refund request button using existing modal */}
                        {/* <button 
                            onClick={() => openRefundModal(null)}
                            className="inline-flex items-center justify-center px-5 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                            בקשת החזר כספי / איתור הזמנה
                        </button> */}
                        
                        {/* Link to continue shopping */}
                        {/* <div className="mt-6">
                            <Link to="/menu" className="text-blue-600 hover:text-blue-800 font-medium">
                                המשך לקניות
                            </Link>
                        </div>*/}
                    </div> 
                </div>
            ) : (
                <div className="space-y-6">
                    {orders.map((order) => (
                        <div key={order.id} className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                            <div className="p-4 sm:p-6 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-800">
                                        הזמנה #{order.id.substring(0, 8)}...
                                    </h2>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {order.isIndependent ? 'הזמנת חקלאים עצמאיים' : 'הזמנה רגילה'}
                                    </div>
                                    <p className="text-sm text-gray-500">
                                        תאריך: {formatDate(order.createdAt)}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusBadge(derivePaymentStatus(order))}`}>
                                        {getDisplayStatus(order)}
                                    </span>
                                    {getRefundStatusBadge(order.id)}
                                </div>
                            </div>

                            <div className="p-4 sm:p-6">
                                <div className="mb-4">
                                    <h3 className="text-md font-semibold text-gray-700 mb-2">סיכום הזמנה:</h3>
                                    {/* Prefer business-style breakdown when present (weekly orders) */}
                                    {order.orderBreakdown && Object.values(order.orderBreakdown).some((v) => Array.isArray(v?.items)) && (
                                        Object.entries(order.orderBreakdown).map(([businessOrderId, businessOrder]) => (
                                            <div key={businessOrderId} className="mb-3 pl-4 border-r-2 border-blue-200">
                                                <p className="text-sm font-medium text-gray-800">{businessOrder.businessName || 'עסק לא ידוע'}</p>
                                                <ul className="list-disc list-inside text-sm text-gray-600 mt-1 space-y-1">
                                                    {filterCustomerActiveLines(order, businessOrder.items).map((item, index) => (
                                                        <li key={item.lineId || index}>
                                                            {item.productName} (x{item.quantity})
                                                            {item.selectedOption && item.selectedOption !== "None" && ` - ${item.selectedOption}`}
                                                            {typeof item.price === 'number' && (
                                                                <span> - ₪{(item.price * item.quantity).toFixed(2)}</span>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))
                                    )}
                                    {/* Unified fallback for independent or legacy structures */}
                                    {(!order.orderBreakdown || !Object.values(order.orderBreakdown).some((v) => Array.isArray(v?.items))) && (
                                        <ul className="list-disc list-inside text-sm text-gray-600 mt-1 space-y-1">
                                            {filterCustomerActiveLines(order, order.items || order.orderItems || []).map((item, index) => (
                                                <li key={item.lineId || index}>
                                                    {item.productName} (x{item.quantity})
                                                    {item.selectedOption && item.selectedOption !== "None" && ` - ${item.selectedOption}`}
                                                    {typeof item.price === 'number' && (
                                                        <span> - ₪{(item.price * item.quantity).toFixed(2)}</span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div className="border-t border-gray-200 pt-4 flex justify-between items-center">
                                    <span className="text-md font-semibold text-gray-800">סה"כ לתשלום:</span>
                                    <span className="text-lg font-bold text-blue-600">
                                        ₪{(order.orderBreakdown
                                            ? computeCustomerOrderGrandTotal(order)
                                            : (order.grandTotal || order.totalAmount || 0)).toFixed(2)}
                                    </span>
                                </div>
                                {getOrderPickupSpot(order) && (
                                     <p className="text-sm text-gray-500 mt-2">נקודת איסוף: <span className="font-medium">{getOrderPickupSpot(order)}</span></p>
                                )}
                                {getOrderDeliveryDateFromCustomerOrder(order) && (
                                    <p className="text-sm text-gray-500 mt-1">תאריך משלוח: <span className="font-medium">{getOrderDeliveryDateFromCustomerOrder(order)}</span></p>
                                )}
                                <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                                    <Link to={`/my-orders/${order.id}`} className="inline-flex min-h-[44px] items-center px-2 text-sm text-blue-600 hover:underline">
                                        {order.isIndependent ? 'פרטים נוספים' : 'פרטים ודירוג מוצרים'}
                                    </Link>
                                </div>
                                <div className="mt-2 text-right">
                                    {refundStatuses[order.id] ? (
                                        <div className="text-sm text-gray-500">
                                            {refundStatuses[order.id].status === 'completed' ? 
                                                'הזיכוי אושר' : 
                                                'בקשת זיכוי הוגשה'}
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => openRefundModal(order.id)}
                                            className="text-sm bg-red-50 hover:bg-red-100 text-red-600 py-1 px-3 rounded-md transition-colors"
                                        >
                                            בקשת זיכוי
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add this at the end of the orders section (when orders exist) */}
            <div className="mt-8 border-t border-gray-200 pt-6 text-center">
                <p className="text-sm text-gray-600 mb-4">
                    אם ביצעת הזמנות נוספות ללא התחברות או דרך מספר טלפון/אימייל אחר, באפשרותך לבקש החזר כספי עבורן:
                </p>
                
                <button 
                    onClick={() => openRefundModal(null)}
                    className="inline-flex items-center justify-center px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 font-medium rounded-md transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    בקשת החזר כספי להזמנה אחרת
                </button>
            </div>

            {/* Refund Request Modal */}
            {isRefundModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" dir="rtl">
                        <h3 className="text-xl font-bold mb-4">בקשת זיכוי</h3>
                        
                        {refundSuccess ? (
                            <div className="text-center py-8">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <p className="text-lg font-medium">בקשת ההחזר נשלחה בהצלחה!</p>
                                <p className="text-gray-500 mt-2">נאשר את בקשתך בהקדם האפשרי.</p>
                            </div>
                        ) : (
                            <RefundRequestForm
                                orders={orders}
                                selectedOrderId={isExternalRefund ? null : currentOrderId}
                                isExternalOrder={isExternalRefund}
                                onSubmit={handleRefundRequest}
                                onCancel={() => {
                                    setIsRefundModalOpen(false);
                                    setCurrentOrderId(null);
                                    setIsExternalRefund(false);
                                }}
                                isSubmitting={isSubmitting}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyOrders;
