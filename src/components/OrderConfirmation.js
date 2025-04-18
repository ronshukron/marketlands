import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { doc, updateDoc, getDoc, setDoc, collection, addDoc, serverTimestamp, arrayUnion, runTransaction } from "firebase/firestore";
import { db } from '../firebase/firebase';
import './OrderConfirmation.css';
import LoadingSpinner from './LoadingSpinner';
import LoadingSpinnerPayment from './LoadingSpinnerPayment';
import Swal from 'sweetalert2';
import { useAuth } from '../contexts/authContext';
import { useCart } from '../contexts/CartContext';
import { pickupSpots } from '../data/pickupSpots';

const OrderConfirmation = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { itemsByOrder, cartTotal, clearCart } = useCart();
    
    const [loading, setLoading] = useState(false);
    const [userName, setUserName] = useState('');
    const [userPhone, setUserPhone] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [paymentUrl, setPaymentUrl] = useState('');
    const [formIsValid, setFormIsValid] = useState(false);
    const [showPopup, setShowPopup] = useState(false);
    const [agreeToTerms, setAgreeToTerms] = useState(false);
    const [userAddress, setUserAddress] = useState(''); 
    const [requestAddress, setRequestAddress] = useState(false);
    const [selectedPickupSpot, setSelectedPickupSpot] = useState('');
    const { userLoggedIn, currentUser } = useAuth();

    // Get pickup spots from the order
    const [availablePickupSpots, setAvailablePickupSpots] = useState([]);

    useEffect(() => {
        console.log("currentUser", currentUser);
        const orderIds = Object.keys(itemsByOrder);
        console.log('orderIds', orderIds);

        if (userLoggedIn && currentUser) {
            setUserName(currentUser.name || '');
            setUserEmail(currentUser.email || '');
            setUserPhone(currentUser.phoneNumber || '');
        }

        // Collect all pickup spots from all orders in the cart
        const collectPickupSpots = async () => {
            const orderSpots = new Set();
            
            // Fetch pickup spots for each order
            for (const orderId of orderIds) {
                try {
                    const orderDoc = await getDoc(doc(db, "Orders", orderId));
                    if (orderDoc.exists()) {
                        const orderData = orderDoc.data();
                        if (orderData.pickupSpots && orderData.pickupSpots.length > 0) {
                            orderData.pickupSpots.forEach(spot => orderSpots.add(spot));
                        }
                    }
                } catch (error) {
                    console.error("Error fetching order pickup spots:", error);
                }
            }
            
            // Convert Set to Array
            setAvailablePickupSpots(Array.from(orderSpots));
            
            // Set default selection if there's only one pickup spot
            if (orderSpots.size === 1) {
                setSelectedPickupSpot(Array.from(orderSpots)[0]);
            }
        };
        
        collectPickupSpots();
    }, [userLoggedIn, currentUser, itemsByOrder]);

    useEffect(() => {
        const isValid = userName.trim() !== '' && 
                        userPhone.trim() !== '' && 
                        userEmail.trim() !== '' &&
                        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail) &&
                        (!requestAddress || userAddress.trim() !== '') &&
                        (availablePickupSpots.length === 0 || selectedPickupSpot !== ''); 
        setFormIsValid(isValid);
    }, [userName, userPhone, userEmail, userAddress, requestAddress, selectedPickupSpot, availablePickupSpots]);

    useEffect(() => {
        // Check if any order requires an address
        const needsAddress = Object.values(itemsByOrder).some(orderData => {
            // Check if we have information about requesting address
            // You might need to fetch this from the Orders collection
            return orderData.requestAddress === true;
        });
        
        setRequestAddress(needsAddress);
    }, [itemsByOrder]);

    const handleSubmitOrder = async () => {
        if (!formIsValid) {
            setShowPopup(true);
            return;
        }

        if (!agreeToTerms) {
            alert('יש לאשר את תנאי השימוש לפני ביצוע ההזמנה');
            return;
        }

        if (availablePickupSpots.length > 0 && !selectedPickupSpot) {
            Swal.fire({
                icon: 'error',
                title: 'נא לבחור נקודת איסוף',
                text: 'יש לבחור נקודת איסוף עבור ההזמנה שלך',
                confirmButtonText: 'הבנתי'
            });
            return;
        }

        // Check if any order doesn't meet minimum order amount
        const invalidOrders = Object.entries(itemsByOrder).filter(([orderId, orderData]) => {
            return orderData.total < orderData.minimumOrderAmount;
        });

        if (invalidOrders.length > 0) {
            const ordersList = invalidOrders.map(([orderId, orderData]) => {
                const businessName = orderData.items[0]?.businessName || "Unknown Business";
                return `${businessName}: סכום מינימום ${orderData.minimumOrderAmount}₪, סכום נוכחי ${orderData.total}₪`;
            }).join('\n');

            Swal.fire({
                icon: 'error',
                title: 'סכום מינימום להזמנה',
                html: `ההזמנות הבאות לא מגיעות לסכום המינימלי הנדרש:<br><br>${ordersList.replace(/\n/g, '<br>')}`,
                confirmButtonText: 'הבנתי'
            });
            return;
        }

        // Check if any order has ended
        for (const [orderId, orderData] of Object.entries(itemsByOrder)) {
            const orderHasEnded = await checkIfOrderEnded(orderId);
            if (orderHasEnded) {
                const businessName = orderData.items[0]?.businessName || "Unknown Business";
                Swal.fire({
                    icon: 'error',
                    title: 'הזמנה הסתיימה',
                    text: `זמן ההזמנה "${businessName}" כבר הסתיים.`,
                    confirmButtonText: 'אישור',
                });
                return;
            }
        }
    
        setLoading(true);
        const customerOrderId = `temp_${new Date().getTime()}`; // Generate a temporary ID
        const customerOrderIdOrderRef = doc(collection(db, "customerOrders"), customerOrderId);
        
        // Create a structured order that groups items by their original order
        const orderBreakdown = {};
        const businessIds = [];
        // Process each order in the cart
        Object.entries(itemsByOrder).forEach(([orderId, orderData]) => {
            const orderItems = [];
            
            // Process each item in this order
            orderData.items.forEach(item => {
                if (item.quantity > 0) {
                    orderItems.push({
                        productId: item.id,
                        productName: item.name,
                        quantity: item.quantity,
                        price: item.price,
                        selectedOption: item.selectedOption || "None"
                    });
                }
            });
            businessIds.push(orderData.businessId);
            // Get business name from the first item instead of orderData
            const businessName = orderData.items[0]?.businessName || "Unknown Business";
            
            // Add this order to the breakdown
            orderBreakdown[orderId] = {
                businessId: orderData.businessId,
                businessName: businessName,
                subTotal: orderData.total,
                items: orderItems
            };
        });

        // Create the pending order document
        const customerOrderData = {
            orderBreakdown,
            customerDetails: {
                name: userName,
                phone: userPhone,
                email: userEmail,
                address: userAddress,
                pickupSpot: selectedPickupSpot,
            },
            businessIds: businessIds,
            createdAt: new Date().toISOString(),
            paymentStatus: 'pending_payment',
            grandTotal: cartTotal,
            // If user is logged in, store their ID
            userId: currentUser?.uid || null
        };

        // Get all orderIds instead of just the first one
        const orderIds = Object.keys(itemsByOrder);
        console.log('orderIds', orderIds);

        try {
            // Create temporary order document
            await setDoc(customerOrderIdOrderRef, customerOrderData);
    
            // Call to create Bit payment - pass all orderIds
            const paymentData = {
                amount: cartTotal,
                userName,
                userPhone,
                userEmail,
                successUrl: `${window.location.origin}/payment-success/`,
                cancelUrl: `${window.location.origin}/payment-cancel/`,
                description: `תשלום עבור תוצרת חקלאית`,
                customerOrderId, // Include the temporary order ID
                orderIds: orderIds, // Send all orderIds instead of just one
            };
    
            console.log("Sending payment data:", paymentData);
    
            const paymentResponse = await axios.post('https://us-central1-auth-development-323c3.cloudfunctions.net/createBitPayment', paymentData, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
    
            if (paymentResponse.data.paymentLink) {
                window.location.href = paymentResponse.data.paymentLink;
                // setPaymentUrl(paymentResponse.data.paymentLink); // for iframe Open the payment link in an iframe 
            } else {
                console.error('Failed to create payment link');
            }
        } catch (error) {
            console.error("Failed to update order or create payment:", error);
        } finally {
            setLoading(false);
        }
    };
    
    const handleCancel = () => {
        navigate(`/`);
    };

    const checkIfOrderEnded = async (orderId) => {
        try {
            const orderDoc = doc(db, "Orders", orderId);
            const docSnap = await getDoc(orderDoc);
    
            if (docSnap.exists()) {
                const orderData = docSnap.data();
                if (orderData.Ending_Time) {
                    const endingTime = orderData.Ending_Time.toDate();
                    const currentTime = new Date();
                    if (currentTime >= endingTime) {
                        return true; // Order has ended
                    }
                }
            } else {
                console.log("Order does not exist!");
                navigate('/error');
            }
        } catch (error) {
            console.error("Error checking if order has ended:", error);
        }
        return false; // Order has not ended
    };
    
    if (loading) {
        return <LoadingSpinnerPayment />;
    }

    // Flatten all items from all orders for display
    console.log('itemsByOrder', itemsByOrder);
    const allCartItems = Object.values(itemsByOrder).flatMap(orderData => 
        orderData.items.map(item => ({
            ...item,
            businessName: orderData.businessName || "Unknown Business"
        }))
    );

    // Add this function to handle free orders
    const handleFreeOrder = async () => {
        try {
            setLoading(true);
            
            // Check and update stock levels first
            const stockResult = await checkAndUpdateStock(itemsByOrder);
            
            if (!stockResult.success) {
                if (stockResult.insufficientItems) {
                    // Show error for insufficient stock
                    const itemsList = stockResult.insufficientItems.map(item => 
                        `${item.name}: ביקשת ${item.requested}, זמין ${item.available}`
                    ).join('\n');
                    
                    Swal.fire({
                        title: 'מלאי לא מספיק',
                        html: `חלק מהפריטים אינם זמינים בכמות המבוקשת:<br><br>${itemsList.replace(/\n/g, '<br>')}`,
                        icon: 'error',
                        confirmButtonText: 'הבנתי'
                    });
                    return;
                } else {
                    // Generic error
                    throw new Error(stockResult.error || "שגיאה בבדיקת המלאי");
                }
            }
            
            // Continue with order processing...
            const orderIds = Object.keys(itemsByOrder);
            const customerOrderId = `temp_${new Date().getTime()}`;
            
            const orderBreakdown = {};
            const businessIds = [];
            // Process each order in the cart
            Object.entries(itemsByOrder).forEach(([orderId, orderData]) => {
                const orderItems = [];
                
                // Process each item in this order
                orderData.items.forEach(item => {
                    if (item.quantity > 0) {
                        orderItems.push({
                            productId: item.id,
                            productName: item.name,
                            quantity: item.quantity,
                            price: item.price,
                            selectedOption: item.selectedOption || "None"
                        });
                    }
                });
                businessIds.push(orderData.businessId);  
                // Get business name from the first item instead of orderData
                const businessName = orderData.items[0]?.businessName || "Unknown Business";
                
                // Add this order to the breakdown
                orderBreakdown[orderId] = {
                    businessId: orderData.businessId,
                    businessName: businessName,
                    subTotal: orderData.total,
                    items: orderItems
                };              
            });

            // Create the pending order document
            const customerOrderData = {
                orderBreakdown,
                customerDetails: {
                    name: userName,
                    phone: userPhone,
                    email: userEmail,
                    address: userAddress,
                    pickupSpot: selectedPickupSpot,
                },
                businessIds: businessIds,
                createdAt: new Date().toISOString(),
                paymentStatus: 'completed',
                paymentMethod: 'free',
                grandTotal: cartTotal,
                // If user is logged in, store their ID
                userId: currentUser?.uid || null
            };
            
            // Create a customer order document
            const customerOrderRef = await addDoc(collection(db, "customerOrders"), customerOrderData);
            console.log('customerOrderRef', customerOrderRef);
            
            // Update the original order with customer order reference - FIX HERE
            const updatePromises = orderIds.map(async (orderId) => {
                try {
                    // First check if the document exists
                    const orderDocSnap = await getDoc(doc(db, "Orders", orderId));
                    
                    if (orderDocSnap.exists()) {
                        // Document exists, now update it
                        await updateDoc(doc(db, "Orders", orderId), {
                            customerOrderIds: arrayUnion(customerOrderRef.id) // Use the actual document ID
                        });
                        console.log(`Successfully updated order ${orderId}`);
                    } else {
                        console.error(`Order ${orderId} does not exist`);
                    }
                } catch (error) {
                    console.error(`Error updating order ${orderId}:`, error);
                }
            });

            // Wait for all updates to complete
            await Promise.all(updatePromises);

            // Clear cart after successful submission
            clearCart();
            
            // Show success message and redirect
            Swal.fire({
                title: 'ההזמנה התקבלה!',
                text: 'ההזמנה שלך התקבלה בהצלחה',
                icon: 'success',
                confirmButtonText: 'אישור'
            }).then(() => {
                navigate('/', { 
                    state: { 
                        orderNumber: customerOrderRef.id,
                        orderDetails: {
                            customerName: userName,
                            totalAmount: 0,
                            items: Object.values(itemsByOrder).reduce((total, order) => 
                                total + order.items.length, 0)
                        }
                    } 
                });
            });
        } catch (error) {
            console.error("Error creating free order:", error);
            Swal.fire({
                title: 'שגיאה!',
                text: 'אירעה שגיאה בעת יצירת ההזמנה. אנא נסה שוב.',
                icon: 'error',
                confirmButtonText: 'אישור'
            });
        } finally {
            setLoading(false);
        }
    };

    // In the checkout section, add condition to check for free order
    const proceedToCheckout = async () => {
        if (!formIsValid) {
            setShowPopup(true);
            return;
        }

        try {
            setLoading(true);
            
            // Check stock before proceeding to payment
            const stockResult = await checkAndUpdateStock(itemsByOrder);
            
            if (!stockResult.success) {
                if (stockResult.insufficientItems) {
                    // Show error for insufficient stock
                    const itemsList = stockResult.insufficientItems.map(item => 
                        `${item.name}: ביקשת ${item.requested}, זמין ${item.available}`
                    ).join('\n');
                    
                    Swal.fire({
                        title: 'מלאי לא מספיק',
                        html: `חלק מהפריטים אינם זמינים בכמות המבוקשת:<br><br>${itemsList.replace(/\n/g, '<br>')}`,
                        icon: 'error',
                        confirmButtonText: 'הבנתי'
                    });
                    return;
                } else {
                    // Generic error
                    throw new Error(stockResult.error || "שגיאה בבדיקת המלאי");
                }
            }
            
            // Check if the order is free (total = 0)
            if (cartTotal === 0) {
                handleFreeOrder();
                return;
            }

            // Continue with payment processing
            handleSubmitOrder();
        } catch (error) {
            console.error("Error proceeding to checkout:", error);
            Swal.fire({
                title: 'שגיאה!',
                text: 'אירעה שגיאה בעת עיבוד ההזמנה. אנא נסה שוב.',
                icon: 'error',
                confirmButtonText: 'אישור'
            });
        } finally {
            setLoading(false);
        }
    };

    // Add a function to check and update product stock levels
    const checkAndUpdateStock = async (orderItems) => {
        // Flatten all items from all orders
        const allItems = [];
        Object.entries(orderItems).forEach(([orderId, orderData]) => {
            orderData.items.forEach(item => {
                if (item.quantity > 0) {
                    allItems.push({
                        productId: item.id,
                        quantity: item.quantity
                    });
                }
            });
        });
        
        // Use a Firestore transaction to safely check and update stock
        try {
            const result = await runTransaction(db, async (transaction) => {
                const insufficientStockItems = [];
                
                // Check each product's stock
                for (const item of allItems) {
                    const productRef = doc(db, "Products", item.productId);
                    const productDoc = await transaction.get(productRef);
                    
                    if (!productDoc.exists()) {
                        throw new Error(`Product ${item.productId} not found`);
                    }
                    
                    const productData = productDoc.data();
                    const currentStock = productData.stockAmount !== undefined ? productData.stockAmount : 0;
                    
                    // Check if there's enough stock
                    if (currentStock < item.quantity) {
                        insufficientStockItems.push({
                            productId: item.productId,
                            name: productData.name || "מוצר לא ידוע",
                            requested: item.quantity,
                            available: currentStock
                        });
                    }
                }
                
                // If any items have insufficient stock, abort the transaction
                if (insufficientStockItems.length > 0) {
                    return { success: false, insufficientItems: insufficientStockItems };
                }
                
                // If all stock checks pass, update the stock levels
                for (const item of allItems) {
                    const productRef = doc(db, "Products", item.productId);
                    const productDoc = await transaction.get(productRef);
                    const currentStock = productDoc.data().stockAmount || 0;
                    
                    // Update the stock amount
                    transaction.update(productRef, {
                        stockAmount: currentStock - item.quantity
                    });
                }
                
                return { success: true };
            });
            
            return result;
        } catch (error) {
            console.error("Error in stock transaction:", error);
            return { success: false, error: error.message };
        }
    };

    return (
        <div className="bg-gray-50 min-h-screen py-8 px-4" dir="rtl">
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
                <div className="bg-blue-600 text-white px-6 py-4">
                    <h1 className="text-2xl font-bold">סיכום הזמנה</h1>
                </div>
                
                <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">פריטים בהזמנה</h2>
                    
                    {/* Group items by order for display */}
                    {Object.entries(itemsByOrder).map(([orderId, orderData]) => (
                        <div key={orderId} className="mb-6">
                            <h3 className="font-semibold text-gray-700 mb-2 border-b pb-2">
                                {orderData.items[0]?.businessName || "Unknown Business"}
                            </h3>
                            
                            <div className="mb-3 rounded-lg border border-gray-200 overflow-hidden">
                                <ul className="divide-y divide-gray-200">
                                    {orderData.items.map((item, index) => (
                                        <li key={index} className="p-4 hover:bg-gray-50 transition-colors">
                                            <div className="flex justify-between items-center">
                                                <div className="flex-1">
                                                    <h3 className="font-medium text-gray-800">{item.name}</h3>
                                                    <p className="text-sm text-gray-600">
                                                        <span className="font-medium">אופציה:</span> {item.selectedOption || 'ללא'}
                                                    </p>
                                                    <p className="text-sm text-gray-600 mt-1">
                                                        <span className="font-medium">מחיר:</span> {item.price}₪ × {item.quantity} = {item.quantity * item.price}₪
                                                    </p>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            
                            <div className="bg-gray-50 p-3 rounded-lg mb-3">
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold">סה"כ להזמנה זו:</span>
                                    <span className="font-bold text-blue-600">{orderData.total.toFixed(2)}₪</span>
                                </div>
                                
                                {orderData.minimumOrderAmount > 0 && (
                                    <p className={`text-sm ${orderData.total < orderData.minimumOrderAmount ? 'text-red-600' : 'text-blue-600'}`}>
                                        {orderData.total < orderData.minimumOrderAmount 
                                            ? `סכום מינימום להזמנה: ${orderData.minimumOrderAmount}₪ (חסרים ${(orderData.minimumOrderAmount - orderData.total).toFixed(2)}₪)`
                                            : `✓ עברת את סכום המינימום להזמנה (${orderData.minimumOrderAmount}₪)`
                                        }
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                    
                    <div className="bg-gray-100 p-4 rounded-lg mb-6 border-t-2 border-blue-500">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-lg font-semibold">סה"כ לתשלום:</span>
                            <span className="text-lg font-bold text-blue-600">{cartTotal.toFixed(2)}₪</span>
                        </div>
                    </div>
                    
                    <div className="border-t border-gray-200 pt-6 mb-6">
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">פרטי התשלום</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="form-group">
                                <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-1">
                                    שם מלא <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    id="userName"
                                    type="text" 
                                    placeholder="שם מלא" 
                                    value={userName} 
                                    onChange={(e) => setUserName(e.target.value)} 
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            
                            <div className="form-group">
                                <label htmlFor="userPhone" className="block text-sm font-medium text-gray-700 mb-1">
                                    מספר טלפון <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    id="userPhone"
                                    type="tel" 
                                    placeholder="מספר טלפון" 
                                    value={userPhone} 
                                    onChange={(e) => setUserPhone(e.target.value)} 
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            
                            <div className="form-group md:col-span-2">
                                <label htmlFor="userEmail" className="block text-sm font-medium text-gray-700 mb-1">
                                    כתובת אימייל <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    id="userEmail"
                                    type="email" 
                                    placeholder="כתובת אימייל" 
                                    value={userEmail} 
                                    onChange={(e) => setUserEmail(e.target.value)} 
                                    required
                                    readOnly={userLoggedIn}
                                    className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${userLoggedIn ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                />
                                {userLoggedIn && (
                                    <p className="mt-1 text-sm text-gray-500">
                                        כתובת האימייל מקושרת לחשבון שלך ואינה ניתנת לשינוי
                                    </p>
                                )}
                            </div>
                            
                            {/* Pickup Spot Selection */}
                            {availablePickupSpots.length > 0 && (
                                <div className="form-group md:col-span-2">
                                    <label htmlFor="pickupSpot" className="block text-sm font-medium text-gray-700 mb-1">
                                        נקודת איסוף <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        id="pickupSpot"
                                        value={selectedPickupSpot}
                                        onChange={(e) => setSelectedPickupSpot(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        required
                                    >
                                        <option value="" disabled>בחר נקודת איסוף</option>
                                        {availablePickupSpots.map((spot) => (
                                            <option key={spot} value={spot}>
                                                {spot}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            
                            {requestAddress && (
                                <div className="form-group md:col-span-2">
                                    <label htmlFor="userAddress" className="block text-sm font-medium text-gray-700 mb-1">
                                        כתובת למשלוח <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        id="userAddress"
                                        type="text"
                                        placeholder="כתובת מלאה"
                                        value={userAddress}
                                        onChange={(e) => setUserAddress(e.target.value)}
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            )}
                        </div>
                        
                        <div className="flex items-center mb-6">
                            <input
                                type="checkbox" 
                                id="agreeToTerms" 
                                checked={agreeToTerms}
                                onChange={(e) => setAgreeToTerms(e.target.checked)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ml-2"
                            />
                            <label htmlFor="agreeToTerms" className="text-sm text-gray-700">
                                קראתי ואני מסכים ל<Link to="/terms-of-service" target="_blank" className="text-blue-600 hover:underline">תנאי השימוש</Link>
                            </label>
                        </div>
                        
                        <div className="flex space-x-4 rtl:space-x-reverse">
                            <button
                                onClick={proceedToCheckout}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                                לתשלום
                            </button>
                            <button
                                onClick={handleCancel}
                                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 px-4 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                            >
                                ביטול
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderConfirmation;
