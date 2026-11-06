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
import QuickProductReviewSheet from './category-store/QuickProductReviewSheet';
import { isProductFeedbackEligible } from '../utils/productFeedbackUtils';
import PackedCartonPickupBanner from './PackedCartonPickupBanner';
import {
    filterCustomerActiveLines,
    isCustomerOrderOwner,
} from '../utils/customerOrderUtils';
import { ensureLineIdsInBreakdown } from './adminV5/deliveryWeighingV5/v7/orderDraftUtils';
import {
    REFUND_STATUSES,
    getRefundStatusDetails,
} from '../utils/refundUtils';
import {
    STATUS_BADGE_CLASSES,
    formatCustomerDeliveryDate,
    formatCustomerLineQuantity,
    formatWeighedQuantity,
    getCustomerLineEstimatedTotal,
    getCustomerOrderDisplayTotal,
    getCustomerOrderStatusInfo,
    getWeighedLinesById,
    isLineRemovedAtWeighing,
} from '../utils/customerOrderDisplay';

const getRefundCreatedAtMs = (value) => (
    value?.toMillis?.()
    || value?.toDate?.()?.getTime?.()
    || (value ? new Date(value).getTime() : 0)
    || 0
);

const MyOrders = () => {
    const { currentUser, loading: authLoading } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
    const [currentOrderId, setCurrentOrderId] = useState(null);
    const [isExternalRefund, setIsExternalRefund] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [refundSuccess, setRefundSuccess] = useState(false);
    const [refundStatuses, setRefundStatuses] = useState({});
    const [reviewTarget, setReviewTarget] = useState(null);
    const [reviewedLineIds, setReviewedLineIds] = useState(() => new Set());

    useEffect(() => {
        const fetchOrders = async () => {
            if (authLoading) return;
            if (!currentUser || !currentUser.uid) {
                setError("אנא התחבר כדי לראות את ההזמנות שלך.");
                setLoading(false);
                return;
            }

            setError(null);

            try {
                setLoading(true);
                const userDocSnap = await getDoc(doc(db, "users", currentUser.uid)).catch((userDocError) => {
                    console.error('Failed to load user document', userDocError);
                    return null;
                });
                const legacyOrderIds = userDocSnap?.exists() ? getLegacyCustomerOrderIds(userDocSnap.data()) : [];
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
                        return { orders: [...standard, ...delayed], failed: false };
                    } catch (e) {
                        console.error('Failed weekly orders query', e);
                        return { orders: [], failed: true };
                    }
                })();

                const fetchIndependentByUserPromise = (async () => {
                    try {
                        const qInd = query(collection(db, 'IndepentCustomerOrders'), where('userId', '==', currentUser.uid));
                        const snap = await getDocs(qInd);
                        return snap.docs.map((d) => ({ id: d.id, ...d.data(), isIndependent: true }));
                    } catch (e) {
                        console.error('Failed independent orders query', e);
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

                const [legacyWeekly, weeklyResult, independentByUser] = await Promise.all([
                    fetchLegacyWeeklyPromise,
                    fetchWeeklyByUserPromise,
                    fetchIndependentByUserPromise,
                ]);

                const mergeUnique = (arr) => {
                    const map = new Map();
                    for (const item of (arr || [])) {
                        if (item && item.id && !map.has(item.id)) map.set(item.id, item);
                    }
                    return Array.from(map.values());
                };

                const validWeekly = mergeUnique([...legacyWeekly.filter(Boolean), ...weeklyResult.orders])
                    .filter((order) => (
                        isCustomerOrderOwner(order, currentUser.uid)
                        || (!order.userId && legacyOrderIdSet.has(order.id))
                    ))
                    .filter((order) => shouldIncludeCustomerOrderInList(order))
                    .map((order) => (
                        order.orderBreakdown
                            ? { ...order, orderBreakdown: ensureLineIdsInBreakdown(order.id, order.orderBreakdown).breakdown }
                            : order
                    ));

                // Independent: include all so we can show status (held/pending/etc.)
                const validIndependent = mergeUnique(independentByUser)
                    .filter((order) => isCustomerOrderOwner(order, currentUser.uid));

                const toMs = (value) => (value?.toDate ? value.toDate() : new Date(value)).getTime() || 0;
                const combinedOrders = [...validIndependent, ...validWeekly]
                    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));

                if (combinedOrders.length === 0 && weeklyResult.failed) {
                    setError("אירעה שגיאה בטעינת ההזמנות. נסו לרענן את הדף.");
                    return;
                }

                setOrders(combinedOrders);
                fetchRefundStatuses();
            } catch (err) {
                console.error("Error fetching user orders:", err);
                setError("אירעה שגיאה בטעינת ההזמנות.");
            } finally {
                setLoading(false);
            }
        };

        fetchOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, authLoading]);
    
    // Latest refund request per order
    const fetchRefundStatuses = async () => {
        try {
            const statusMap = {};
            const refundsSnapshot = await getDocs(
                query(collection(db, 'refunds'), where('userId', '==', currentUser.uid))
            );

            refundsSnapshot.forEach((refundDoc) => {
                const refundData = refundDoc.data();
                if (!refundData.orderId) return;
                const existing = statusMap[refundData.orderId];
                if (existing && getRefundCreatedAtMs(existing.createdAt) >= getRefundCreatedAtMs(refundData.createdAt)) return;
                statusMap[refundData.orderId] = {
                    status: refundData.status,
                    id: refundDoc.id,
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

    // Helper function to get refund status badge
    const getRefundStatusBadge = (orderId) => {
        const refund = refundStatuses[orderId];
        if (!refund) return null;
        
        const statusDetails = getRefundStatusDetails(refund.status);
        
        return (
            <div className={`text-xs font-medium px-2.5 py-1 rounded-full border ${statusDetails.badgeClass} mt-2`}>
                {statusDetails.customerLabel}
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
                status: REFUND_STATUSES.PENDING,
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

            const refundDoc = await addDoc(collection(db, 'refunds'), refundData);
            if (formData.orderId) {
                setRefundStatuses((prev) => ({
                    ...prev,
                    [formData.orderId]: {
                        status: REFUND_STATUSES.PENDING,
                        id: refundDoc.id,
                        createdAt: new Date(),
                    },
                }));
            }

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

    const canReviewLine = (order, line) => (
        !order.isIndependent
        && !reviewedLineIds.has(`${order.id}~${line?.lineId}`)
        && isProductFeedbackEligible({ order, line, userId: currentUser?.uid })
    );

    const openLineReview = (order, line) => {
        const createdAtMs = order.createdAt?.toMillis?.()
            || order.createdAt?.toDate?.()?.getTime?.()
            || 0;
        setReviewTarget({
            productName: line.productName || line.name || 'מוצר',
            target: {
                orderId: order.id,
                orderCollection: order.customerOrderSource || 'customerOrdersDelayed',
                lineId: line.lineId,
                productId: String(line.productId || ''),
                productName: line.productName || line.name || '',
                orderCreatedAt: createdAtMs,
            },
        });
    };

    const renderLineSummary = (order, item) => {
        const quantityLabel = formatCustomerLineQuantity(item);
        const option = item.selectedOption && item.selectedOption !== 'None' ? item.selectedOption : '';
        const weighed = getWeighedLinesById(order)[item.lineId];
        const removedAtWeighing = isLineRemovedAtWeighing(order, item.lineId);
        const estimatedTotal = getCustomerLineEstimatedTotal(item);
        return (
            <>
                <span className={removedAtWeighing ? 'line-through text-gray-400' : ''}>
                    {item.productName || item.name}
                    {quantityLabel && ` - ${quantityLabel}`}
                    {option && ` (${option})`}
                </span>
                {item.isCompensation ? (
                    <span className="text-green-700"> - פיצוי, ללא חיוב</span>
                ) : removedAtWeighing ? (
                    <span className="text-red-600"> - לא סופק, לא חויב</span>
                ) : weighed ? (
                    <span> - נשקל {formatWeighedQuantity(weighed)} · ₪{Number(weighed.linePrice || 0).toFixed(2)}</span>
                ) : (
                    <span> - ₪{estimatedTotal.toFixed(2)}</span>
                )}
            </>
        );
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
                                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${STATUS_BADGE_CLASSES[getCustomerOrderStatusInfo(order).tone]}`}>
                                        {getCustomerOrderStatusInfo(order).label}
                                    </span>
                                    {getRefundStatusBadge(order.id)}
                                </div>
                            </div>

                            <div className="p-4 sm:p-6">
                                <PackedCartonPickupBanner
                                    count={order.packedCartonCount}
                                    pickupSpot={getOrderPickupSpot(order)}
                                    className="mb-4"
                                />
                                <div className="mb-4">
                                    <h3 className="text-md font-semibold text-gray-700 mb-2">סיכום הזמנה:</h3>
                                    {/* Prefer business-style breakdown when present (weekly orders) */}
                                    {order.orderBreakdown
                                        && Object.values(order.orderBreakdown).some((v) => Array.isArray(v?.items))
                                        && !Object.values(order.orderBreakdown).some((v) => filterCustomerActiveLines(order, v?.items).length > 0) && (
                                        <p className="text-sm text-gray-500">כל הפריטים הוסרו מההזמנה.</p>
                                    )}
                                    {order.orderBreakdown && Object.values(order.orderBreakdown).some((v) => Array.isArray(v?.items)) && (
                                        Object.entries(order.orderBreakdown)
                                            .filter(([, businessOrder]) => filterCustomerActiveLines(order, businessOrder?.items).length > 0)
                                            .map(([businessOrderId, businessOrder]) => (
                                            <div key={businessOrderId} className="mb-3 pl-4 border-r-2 border-blue-200">
                                                <p className="text-sm font-medium text-gray-800">{businessOrder.businessName || 'עסק לא ידוע'}</p>
                                                <ul className="list-disc list-inside text-sm text-gray-600 mt-1 space-y-1">
                                                    {filterCustomerActiveLines(order, businessOrder.items).map((item, index) => (
                                                        <li key={item.lineId || index} className="flex flex-wrap items-center justify-between gap-2">
                                                            <span>{renderLineSummary(order, item)}</span>
                                                            {canReviewLine(order, item) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openLineReview(order, item)}
                                                                    className="inline-flex min-h-11 items-center text-xs font-medium text-amber-800 underline-offset-2 hover:underline"
                                                                >
                                                                    איך היה? דרגו ★
                                                                </button>
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
                                                    {item.productName || item.name} (x{item.quantity})
                                                    {item.selectedOption && item.selectedOption !== "None" && ` - ${item.selectedOption}`}
                                                    {typeof item.price === 'number' && (
                                                        <span> - ₪{(item.price * item.quantity).toFixed(2)}</span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                {(() => {
                                    const total = getCustomerOrderDisplayTotal(order);
                                    return (
                                        <div className="border-t border-gray-200 pt-4">
                                            <div className="flex justify-between items-center">
                                                <span className="text-md font-semibold text-gray-800">{total.label}:</span>
                                                <span className="text-lg font-bold text-blue-600">₪{total.amount.toFixed(2)}</span>
                                            </div>
                                            {total.isEstimate && !order.isIndependent && (
                                                <p className="text-xs text-gray-500 mt-1">
                                                    הסכום הסופי ייקבע לפי המשקל בפועל וייגבה לאחר השקילה.
                                                </p>
                                            )}
                                            {total.isFinal && Number(order.delayedPayment?.holdSum) > 0 && (
                                                <p className="text-xs text-gray-500 mt-1">
                                                    הערכה בזמן ההזמנה: ₪{Number(order.delayedPayment.holdSum).toFixed(2)}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })()}
                                {getOrderPickupSpot(order) && (
                                     <p className="text-sm text-gray-500 mt-2">נקודת איסוף: <span className="font-medium">{getOrderPickupSpot(order)}</span></p>
                                )}
                                {getOrderDeliveryDateFromCustomerOrder(order) && (
                                    <p className="text-sm text-gray-500 mt-1">תאריך משלוח: <span className="font-medium">{formatCustomerDeliveryDate(getOrderDeliveryDateFromCustomerOrder(order))}</span></p>
                                )}
                                {!order.isIndependent && (
                                    <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                                        <Link to={`/my-orders/${order.id}`} className="inline-flex min-h-[44px] items-center px-2 text-sm text-blue-600 hover:underline">
                                            פרטים ודירוג מוצרים
                                        </Link>
                                    </div>
                                )}
                                <div className="mt-2 text-right">
                                    {refundStatuses[order.id] ? (
                                        <div className="text-sm text-gray-500">
                                            {getRefundStatusDetails(
                                                refundStatuses[order.id].status,
                                            ).customerDescription}
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

            {reviewTarget && (
                <QuickProductReviewSheet
                    productName={reviewTarget.productName}
                    target={reviewTarget.target}
                    onClose={() => setReviewTarget(null)}
                    onSubmitted={() => {
                        const reviewedId = `${reviewTarget.target.orderId}~${reviewTarget.target.lineId}`;
                        setReviewedLineIds((current) => {
                            const next = new Set(current);
                            next.add(reviewedId);
                            return next;
                        });
                        setReviewTarget(null);
                    }}
                />
            )}

            {/* Refund Request Modal */}
            {isRefundModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" dir="rtl">
                        <h3 className="text-xl font-bold mb-4">
                            {refundSuccess ? 'הזיכוי אושר' : 'בקשת זיכוי'}
                        </h3>
                        
                        {refundSuccess ? (
                            <div className="text-center py-8">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <p className="text-lg font-medium">הזיכוי אושר אוטומטית</p>
                                <p className="text-gray-500 mt-2">הסכום יופחת מהחיוב.</p>
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
