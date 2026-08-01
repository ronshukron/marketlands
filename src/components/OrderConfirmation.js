import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { doc, updateDoc, getDoc, setDoc, collection, serverTimestamp, arrayUnion, runTransaction } from "firebase/firestore";
import { db } from '../firebase/firebase';
import './OrderConfirmation.css';
import LoadingSpinner from './LoadingSpinner';
import LoadingSpinnerPayment from './LoadingSpinnerPayment';
import Swal from 'sweetalert2';
import { useAuth } from '../contexts/authContext';
import { useCart } from '../contexts/CartContext';
import { pickupSpots, pickupSpotsData } from '../data/pickupSpots';
import { getEndingTimeForSpot } from '../utils/orderUtils';
import { isDelayedPaymentSpot } from '../services/paymentConfigService';
import {
    buildPricingSnapshot,
    getEstimatedChargeableQuantity,
    getEstimatedLineTotal,
} from '../utils/pricing';
import { ensureLineIdsInBreakdown } from './adminV5/deliveryWeighingV5/v7/orderDraftUtils';
import CheckoutAccountModal from './CheckoutAccountModal';
import {
    buildOrderAccountPayload,
    CHECKOUT_ACCOUNT_ACTIONS,
    resolveCheckoutAccountAction,
} from '../utils/checkoutAccountUtils';
// Catalog numbers for shipping line items
const SHIPPING_CATALOG_NUMBER = process.env.REACT_APP_SHIPPING_CATALOG_NUMBER || '118';
const BOX_COLLECTION_CATALOG_NUMBER = process.env.REACT_APP_BOX_COLLECTION_CATALOG_NUMBER || '999002';
// Shipping product id in Firestore
const SHIPPING_PRODUCT_ID = 'Mdean61FIezxRcMUZjVn';

const OrderConfirmation = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { itemsByOrder, cartTotal, clearCart, removeOrderFromCart, addItem, removeItem, cartItems } = useCart();
    
    const [loading, setLoading] = useState(false);
    const [userName, setUserName] = useState(() => {
        // Load from localStorage on first render
        return localStorage.getItem('orderUserName') || '';
    });
    const [userPhone, setUserPhone] = useState(() => {
        // Load from localStorage on first render
        return localStorage.getItem('orderUserPhone') || '';
    });
    const [userEmail, setUserEmail] = useState('');
    const [paymentUrl, setPaymentUrl] = useState('');
    const [formIsValid, setFormIsValid] = useState(false);
    const [showPopup, setShowPopup] = useState(false);
    const [agreeToTerms, setAgreeToTerms] = useState(false);
    const [createAccount, setCreateAccount] = useState(true);
    const [showAccountInfo, setShowAccountInfo] = useState(false);
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [userAddress, setUserAddress] = useState(''); 
    const [requestAddress, setRequestAddress] = useState(false); 
    const [userDirections, setUserDirections] = useState('');
    const [selectedPickupSpot, setSelectedPickupSpot] = useState(() => {
        return localStorage.getItem('selectedPickupSpot') || '';
    });
    const { userLoggedIn, currentUser } = useAuth();

    // Get pickup spots from the order
    const [availablePickupSpots, setAvailablePickupSpots] = useState([]);

    // Get the selected pickup spot's data
    const selectedSpotData = selectedPickupSpot ? pickupSpotsData[selectedPickupSpot] : null;

    const [deliveryOption, setDeliveryOption] = useState(() => {
        // If selectedSpotData exists and has homeDelivery option, default to it
        if (selectedSpotData && selectedSpotData.options.includes('homeDelivery')) {
            return 'homeDelivery';
        }
        // If selectedSpotData exists and only has boxCollection option, default to it
        if (selectedSpotData && 
            selectedSpotData.options.length === 1 && 
            selectedSpotData.options[0] === 'boxCollection') {
            return 'boxCollection';
        }
        // Otherwise default to pickup
        return 'pickup';
    });

    // Add this useEffect to update deliveryOption when pickup spot changes
    useEffect(() => {
        // Default to pickup if available, otherwise homeDelivery, then boxCollection
        if (selectedSpotData && selectedSpotData.options.includes('pickup')) {
            setDeliveryOption('pickup');
        } else if (selectedSpotData && selectedSpotData.options.includes('homeDelivery')) {
            setDeliveryOption('homeDelivery');
        } else if (selectedSpotData && 
            selectedSpotData.options.length === 1 && 
            selectedSpotData.options[0] === 'boxCollection') {
            setDeliveryOption('boxCollection');
        } else {
            setDeliveryOption('pickup');
        }
    }, [selectedPickupSpot, selectedSpotData]);


    // Add this near your other state declarations
    const [totalWithDelivery, setTotalWithDelivery] = useState(cartTotal);

    // Add this useEffect to update the total when delivery option changes
    useEffect(() => {
        let newTotal = cartTotal;
        if (selectedSpotData) {
            // boxCollection is free now; do not add any fee
            // homeDelivery shipping is a product in cart
        }
        setTotalWithDelivery(newTotal);
    }, [deliveryOption, selectedSpotData, cartTotal]);

    // Ensure shipping product is in cart when homeDelivery is selected; remove otherwise
    useEffect(() => {
        const syncShippingItem = async () => {
            try {
                const shippingItemsInCart = cartItems.filter(ci => ci.id === SHIPPING_PRODUCT_ID);
                const hasShippingInCart = shippingItemsInCart.length > 0;
                if (deliveryOption === 'homeDelivery') {
                    if (!hasShippingInCart) {
                        // Attach shipping to the first existing order in cart
                        const orderIds = Object.keys(itemsByOrder);
                        if (orderIds.length === 0) return; // nothing to attach to
                        const targetOrderId = orderIds[0];
                        const targetOrderMeta = itemsByOrder[targetOrderId];
                        // Fetch shipping product
                        const shipDocRef = doc(db, 'Products', SHIPPING_PRODUCT_ID);
                        const shipSnap = await getDoc(shipDocRef);
                        if (shipSnap.exists()) {
                            const shipData = shipSnap.data();
                            const productToAdd = {
                                id: SHIPPING_PRODUCT_ID,
                                name: shipData.name || 'משלוח עד הבית',
                                price: Number(shipData.price) || 0,
                                selectedOption: shipData.options && shipData.options.length > 0 ? shipData.options[0] : '',
                                quantity: 1,
                                images: shipData.images || [],
                                businessId: targetOrderMeta.businessId,
                                businessName: itemsByOrder[targetOrderId]?.items?.[0]?.businessName || 'Shipping',
                                stockAmount: shipData.stockAmount || 999999,
                                catalogNumber: shipData.catalogNumber,
                                vatType: shipData.vatType ?? 1,
                                isShipping: true
                            };
                            addItem(productToAdd, targetOrderId, targetOrderMeta.businessId, targetOrderMeta.minimumOrderAmount || 0);
                        }
                    }
                } else {
                    // Remove all shipping items if present
                    if (hasShippingInCart) {
                        shippingItemsInCart.forEach(si => removeItem(si.uid));
                    }
                }
            } catch (e) {
                console.error('Error syncing shipping item:', e);
            }
        };
        syncShippingItem();
    }, [deliveryOption, itemsByOrder, cartItems, addItem, removeItem]);

    // Move the updateOrdersWithReference function to component level so it can be used everywhere
    const updateOrdersWithReference = async (orderIds, customerOrderDocId) => {
        try {
            // Create an array of promises for each order update
            const updatePromises = orderIds.map(async (orderId) => {
                try {
                    // Get a reference to the Order document
                    const orderRef = doc(db, "Orders", orderId);
                    
                    // Update the customerOrderIds array in the Orders document
                    await updateDoc(orderRef, {
                        customerOrderIds: arrayUnion(customerOrderDocId)
                    });
                    
                    console.log(`Successfully updated order ${orderId} with customer order reference ${customerOrderDocId}`);
                } catch (orderError) {
                    console.error(`Error updating order ${orderId}:`, orderError);
                }
            });
            
            // Wait for all updates to complete
            await Promise.all(updatePromises);
        } catch (error) {
            console.error("Error updating orders with customer order reference:", error);
        }
    };

    useEffect(() => {
        console.log("currentUser", currentUser);
        const orderIds = Object.keys(itemsByOrder);
        console.log('orderIds', orderIds);

        if (userLoggedIn && currentUser) {
            // Only override with currentUser data if localStorage is empty
            if (!localStorage.getItem('orderUserName')) {
                setUserName(currentUser.name || '');
            }
            setUserEmail(currentUser.email || '');
            if (!localStorage.getItem('orderUserPhone')) {
                setUserPhone(currentUser.phoneNumber || '');
            }
        }

        // Collect all pickup spots from all orders in the cart
        const collectPickupSpots = async () => {
            const orderSpots = new Set();
            
            // Fetch pickup spots for each order
            for (const orderId of orderIds) {
                try {
                    const orderDocRef = await getDoc(doc(db, "Orders", orderId));
                    if (orderDocRef.exists()) {
                        const orderData = orderDocRef.data();
                        
                        if (orderData.pickupSpots && orderData.pickupSpots.length > 0) {
                            orderData.pickupSpots.forEach(spot => orderSpots.add(spot));
                        }
                    }
                } catch (error) {
                    console.error("Error fetching order pickup spots:", error);
                }
            }
            
            setAvailablePickupSpots(Array.from(orderSpots));
            
            // Set default selection if there's only one pickup spot
            if (orderSpots.size === 1) {
                setSelectedPickupSpot(Array.from(orderSpots)[0]);
            }
        };
        
        collectPickupSpots();
    }, [userLoggedIn, currentUser, itemsByOrder]);

    // Save userName and userPhone to localStorage whenever they change
    useEffect(() => {
        if (userName.trim() !== '') {
            localStorage.setItem('orderUserName', userName);
        }
    }, [userName]);

    useEffect(() => {
        if (userPhone.trim() !== '') {
            localStorage.setItem('orderUserPhone', userPhone);
        }
    }, [userPhone]);

    useEffect(() => {
        const isValid = userName.trim() !== '' && 
                        userPhone.trim() !== '' && 
                        userEmail.trim() !== '' &&
                        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail) &&
                        (!requestAddress || userAddress.trim() !== '') &&
                        (deliveryOption !== 'homeDelivery' || userAddress.trim() !== '') &&
                        (availablePickupSpots.length === 0 || (selectedPickupSpot && selectedPickupSpot !== 'הכל')); 
        setFormIsValid(isValid);
    }, [userName, userPhone, userEmail, userAddress, requestAddress, selectedPickupSpot, availablePickupSpots, deliveryOption]);

    useEffect(() => {
        // Check if any order requires an address
        const needsAddress = Object.values(itemsByOrder).some(orderData => {
            // Check if we have information about requesting address
            // You might need to fetch this from the Orders collection
            return orderData.requestAddress === true;
        });
        
        setRequestAddress(needsAddress);
    }, [itemsByOrder]);

    // Check if user should be redirected to delayed payment checkout when pickup spot changes
    useEffect(() => {
        const checkPaymentRoute = async () => {
            if (!selectedPickupSpot || selectedPickupSpot === '' || selectedPickupSpot === 'הכל') {
                return; // No spot selected yet
            }
            
            try {
                const shouldBeDelayed = await isDelayedPaymentSpot(selectedPickupSpot);
                
                // If this pickup spot IS configured for delayed payment, redirect to delayed checkout
                if (shouldBeDelayed) {
                    // Update localStorage with the new pickup spot
                    localStorage.setItem('selectedPickupSpot', selectedPickupSpot);
                    
                    // Navigate to delayed order confirmation
                    navigate('/order-confirmation-delayed', {
                        state: {
                            cartProducts: cartItems,
                            redirectedFromRegular: true
                        },
                        replace: true
                    });
                }
            } catch (error) {
                console.error('Error checking payment route:', error);
            }
        };
        
        checkPaymentRoute();
    }, [selectedPickupSpot, navigate, cartItems]);

    // Add this useEffect after the existing useEffects (around line 150)
    useEffect(() => {
        const checkExpiredOrders = async () => {

            console.log('wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww');
            if (Object.keys(itemsByOrder).length === 0) return;
            
            const expiredItems = [];
            const expiredOrderIds = [];
            
            // Check each order in the cart
            for (const [orderId, orderData] of Object.entries(itemsByOrder)) {
                const orderHasEnded = await checkIfOrderEnded(orderId);
                console.log('orderHasEnded', orderHasEnded);
                if (orderHasEnded) {
                    expiredOrderIds.push(orderId);
                    // Add all items from this expired order to the expired items list
                    const businessName = orderData.items[0]?.businessName || "Unknown Business";
                    orderData.items.forEach(item => {
                        expiredItems.push({
                            ...item,
                            businessName: businessName,
                            orderId: orderId
                        });
                    });
                }
            }
            
            // If we found expired items, show warning and remove them
            if (expiredItems.length > 0) {
                const itemsList = expiredItems.map(item => 
                    `• ${item.name} (${item.businessName})`
                ).join('<br>');
                
                Swal.fire({
                    icon: 'warning',
                    title: 'פריטים מהזמנות שהסתיימו',
                    html: `הפריטים הבאים בעגלה שלך מגיעים מהזמנות שכבר הסתיימו:<br><br>${itemsList}<br><br>פריטים אלה יוסרו מהעגלה שלך.`,
                    confirmButtonText: 'הבנתי',
                    allowOutsideClick: false,
                    allowEscapeKey: false
                }).then(() => {
                    // Remove only the expired orders from cart
                    expiredOrderIds.forEach(orderId => {
                        removeOrderFromCart(orderId);
                    });
                    
                    // Check if cart is now empty
                    const remainingOrders = Object.keys(itemsByOrder).filter(id => !expiredOrderIds.includes(id));
                    if (remainingOrders.length === 0) {
                        // Redirect to home if cart is empty
                        navigate('/', { 
                            state: { 
                                message: 'כל הפריטים בעגלה היו מהזמנות שהסתיימו והוסרו' 
                            } 
                        });
                    }
                });
            }
        };
        
        checkExpiredOrders();
    }, [itemsByOrder, navigate, removeOrderFromCart]); // Dependencies




    const handleSubmitOrder = async (checkoutUid = null) => {
        if (!formIsValid) {
            setShowPopup(true);
            return;
        }

        if (!agreeToTerms) {
            alert('יש לאשר את תנאי השימוש לפני ביצוע ההזמנה');
            return;
        }

        if (availablePickupSpots.length > 0 && (!selectedPickupSpot || selectedPickupSpot === 'הכל')) {
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
                        estimatedChargeQuantity: getEstimatedChargeableQuantity(item),
                        estimatedLineTotal: getEstimatedLineTotal(item),
                        price: item.price,
                        ...buildPricingSnapshot(item),
                        selectedOption: item.selectedOption || "None",
                        catalogNumber: item.catalogNumber || '',
                        vatType: item.vatType ?? 3,
                        isShipping: item.isShipping === true,
                        measurementType: item.measurementType || 'kg',
                        unitSize: item.unitSize || 1,
                        averageWeightKg: item.averageWeightKg || 1
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

        // Store the customerOrderId for later use with the user document
        let generatedCustomerOrderId;

        // Create a pending order in Firestore
        // const customerOrderRef = doc(collection(db, 'customerOrders'));
        // generatedCustomerOrderId = customerOrderRef.id;

        const persistedOrderBreakdown = ensureLineIdsInBreakdown(customerOrderId, orderBreakdown).breakdown;
        await setDoc(customerOrderIdOrderRef, {
            orderBreakdown: persistedOrderBreakdown,
            customerDetails: {
                name: userName,
                phone: userPhone,
                email: userEmail,
                address: userAddress,
                directions: userDirections,
                pickupSpot: selectedPickupSpot,
                deliveryOption,
                deliveryDetails: {
                    type: deliveryOption,
                    boxCollectionName: deliveryOption === 'boxCollection' ? userName : null,
                    deliveryFee: deliveryOption === 'homeDelivery' ? selectedSpotData.deliveryFee : 0,
                }
            },
            businessIds: businessIds,
                createdAt: new Date().toISOString(),
            paymentStatus: 'pending_payment',
            grandTotal: totalWithDelivery,
            ...buildOrderAccountPayload(checkoutUid)
        });

        // Update the original orders with the actual document ID
        await updateOrdersWithReference(Object.keys(itemsByOrder), customerOrderId);

        // Add the order to the user's document
        if (checkoutUid) {
            try {
                const userDocRef = doc(db, "users", checkoutUid);
                await setDoc(userDocRef, {
                    orders: arrayUnion(customerOrderId)
                }, { merge: true });
            } catch (error) {
                console.error("Error updating user document:", error);
            }
        }

        // Get all orderIds instead of just the first one
        const orderIds = Object.keys(itemsByOrder);
        console.log('orderIds', orderIds);

        try {
            // Call to create Bit payment - pass all orderIds
            const paymentData = {
                amount: totalWithDelivery,
                userName,
                userPhone,
                userEmail,
                successUrl: `${window.location.origin}/payment-success/`,
                cancelUrl: `${window.location.origin}/payment-cancel/`,
                description: `תשלום עבור תוצרת חקלאית`,
                customerOrderId, // Include the temporary order ID
                orderIds: orderIds, // Send all orderIds instead of just one
            };

            // Add product data for each item in the cart
            let productIndex = 0;
            Object.entries(itemsByOrder).forEach(([orderId, orderData]) => {
                orderData.items.forEach(item => {
                    if (item.quantity > 0) {
                        paymentData[`productData[${productIndex}][catalogNumber]`] = item.catalogNumber;
                        paymentData[`productData[${productIndex}][quantity]`] = item.quantity;
                        paymentData[`productData[${productIndex}][price]`] = getEstimatedLineTotal(item);
                        paymentData[`productData[${productIndex}][itemDescription]`] = item.name || item.productName || 'Unknown Item';
                        paymentData[`productData[${productIndex}][vatType]`] = item.vatType ?? 3;
                        productIndex++;
                    }
                });
            });
    
            console.log("Sending payment data:", paymentData);
            // Prod Environment
            const paymentResponse = await axios.post('https://us-central1-auth-development-323c3.cloudfunctions.net/createBitPayment', paymentData, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
                // Test Environment
            // const paymentResponse = await axios.post('http://127.0.0.1:5001/auth-development-323c3/us-central1/createBitPayment', paymentData, {
            //     headers: {
            //         'Content-Type': 'application/json'
            //     }
            // });
    
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

    const checkIfOrderEnded = async (orderId, pickupSpot = null) => {
        try {
            const orderDoc = doc(db, "Orders", orderId);
            const docSnap = await getDoc(orderDoc);
    
            if (docSnap.exists()) {
                const orderData = docSnap.data();
                // Use per-pickup-spot ending time if available
                const spotToCheck = pickupSpot || selectedPickupSpot;
                const endingTime = getEndingTimeForSpot(orderData, spotToCheck);
                if (endingTime) {
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
    const handleFreeOrder = async (checkoutUid = null) => {
        try {
            setLoading(true);
            
            // Check and update stock levels first
            const filteredForStock = Object.entries(itemsByOrder).reduce((acc, [oid, data]) => {
                acc[oid] = {
                    ...data,
                    items: data.items.filter(i => i.id !== SHIPPING_PRODUCT_ID && !i.isShipping)
                };
                return acc;
            }, {});
            const stockResult = await checkAndUpdateStock(filteredForStock);
            
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
            const customerOrderRef = doc(collection(db, "customerOrders"));
            const customerOrderId = customerOrderRef.id;
            
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
                            estimatedChargeQuantity: getEstimatedChargeableQuantity(item),
                            estimatedLineTotal: getEstimatedLineTotal(item),
                            price: item.price,
                            ...buildPricingSnapshot(item),
                            selectedOption: item.selectedOption || "None",
                            catalogNumber: item.catalogNumber || '',
                            vatType: item.vatType ?? 3,
                            isShipping: item.isShipping === true,
                            measurementType: item.measurementType || 'kg',
                            unitSize: item.unitSize || 1,
                            averageWeightKg: item.averageWeightKg || 1
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
            const persistedOrderBreakdown = ensureLineIdsInBreakdown(customerOrderId, orderBreakdown).breakdown;
            const customerOrderData = {
                orderBreakdown: persistedOrderBreakdown,
                customerDetails: {
                    name: userName,
                    phone: userPhone,
                    email: userEmail,
                    address: userAddress,
                    directions: userDirections,
                    pickupSpot: selectedPickupSpot,
                    deliveryOption,
                    deliveryDetails: {
                        type: deliveryOption,
                        boxCollectionName: deliveryOption === 'boxCollection' ? userName : null,
                        deliveryFee: deliveryOption === 'homeDelivery' ? selectedSpotData.deliveryFee : 0,
                    }
                },
                businessIds: businessIds,
                createdAt: new Date().toISOString(),
                paymentStatus: 'completed',
                paymentMethod: 'free',
                grandTotal: totalWithDelivery,
                ...buildOrderAccountPayload(checkoutUid)
            };
            
            // Create a customer order document
            await setDoc(customerOrderRef, customerOrderData);
            console.log('customerOrderRef', customerOrderRef);
            
            // Now call the function that's defined at component level
            await updateOrdersWithReference(orderIds, customerOrderRef.id);

            // Also add the order to the user's document if user is logged in
            if (checkoutUid) {
                try {
                    // Get a reference to the user document
                    const userDocRef = doc(db, "users", checkoutUid);
                    
                    // Update the user document
                    await setDoc(userDocRef, {
                        // Add the order ID to the orders array field
                        orders: arrayUnion(customerOrderRef.id)
                    }, { merge: true });
                    
                    console.log(`Added order ${customerOrderRef.id} to user ${checkoutUid}'s orders list`);
                } catch (error) {
                    console.error("Error updating user document with order reference:", error);
                }
            }

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

    // Update the proceedToCheckout function to check for terms and pickup spot
    const proceedToCheckout = async (resolvedUid) => {
        // First check agreement to terms
        if (!agreeToTerms) {
            Swal.fire({
                icon: 'warning',
                title: 'אישור תנאי שימוש',
                text: 'יש לאשר את תנאי השימוש לפני ביצוע ההזמנה',
                confirmButtonText: 'הבנתי'
            });
            return;
        }

        // Then check for pickup spot selection if needed
        if (availablePickupSpots.length > 0 && (!selectedPickupSpot || selectedPickupSpot === 'הכל')) {
            Swal.fire({
                icon: 'warning',
                title: 'נא לבחור נקודת איסוף',
                text: 'יש לבחור נקודת איסוף עבור ההזמנה שלך',
                confirmButtonText: 'הבנתי'
            });
            return;
        }

        // Check general form validity (name, phone, email, etc.)
        if (!formIsValid) {
            // Show general form validation popup
            setShowPopup(true);
            return;
        }

        let checkoutUid = resolvedUid;
        if (resolvedUid === undefined) {
            const accountResolution = resolveCheckoutAccountAction({ currentUser, createAccount });
            if (accountResolution.action === CHECKOUT_ACCOUNT_ACTIONS.REQUEST_AUTH) {
                setShowAccountModal(true);
                return;
            }
            checkoutUid = accountResolution.uid;
        }
        
        try {
            setLoading(true);
            
            // Check stock before proceeding to payment
            const filteredForStock = Object.entries(itemsByOrder).reduce((acc, [oid, data]) => {
                acc[oid] = {
                    ...data,
                    items: data.items.filter(i => i.id !== SHIPPING_PRODUCT_ID && !i.isShipping)
                };
                return acc;
            }, {});
            const stockResult = await checkAndUpdateStock(filteredForStock);
            
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
            
            // Check if the entire payable amount is 0 (considering shipping as well)
            if (totalWithDelivery === 0) {
                handleFreeOrder(checkoutUid);
                return;
            }

            // Continue with payment processing
            handleSubmitOrder(checkoutUid);
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
        try {
            // Call the backend function instead of performing the transaction in the frontend
            // Prod Environment
            const response = await axios.post('https://us-central1-auth-development-323c3.cloudfunctions.net/checkAndUpdateStock', {
            // Test Environment
            // const response = await axios.post('http://127.0.0.1:5001/auth-development-323c3/us-central1/checkAndUpdateStock', {
                orderItems
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            console.log('response', response);
            
            // Return the response data, which should match the structure of the original function
            return response.data;
        } catch (error) {
            console.error("Error checking stock:", error);
            
            // If the error response contains data, return it (this preserves the same structure)
            if (error.response && error.response.data) {
                return error.response.data;
            }
            
            // Otherwise return a generic error
            return { 
                success: false, 
                error: error.message || "Failed to check stock availability" 
            };
        }
    };


    return (
        <div className="bg-gray-50 min-h-screen py-8 px-4" dir="rtl">
            <CheckoutAccountModal
                open={showAccountModal}
                prefill={{ email: userEmail, name: userName, phone: userPhone, community: selectedPickupSpot }}
                onAuthenticated={(uid) => {
                    setShowAccountModal(false);
                    proceedToCheckout(uid);
                }}
                onContinueAsGuest={() => {
                    setCreateAccount(false);
                    setShowAccountModal(false);
                    proceedToCheckout(null);
                }}
                onCancel={() => setShowAccountModal(false)}
            />
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
                <div className="bg-blue-600 text-white px-6 py-4">
                    <h1 className="text-2xl font-bold">השלמת הזמנה</h1>
                </div>
                
                <div className="p-6">
                    {/* User Details Form - FIRST */}
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">פרטים אישיים</h2>
                        
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

                            {!userLoggedIn && (
                                <div className="md:col-span-2 w-full">
                                    <div className="flex w-full items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                                        <input
                                            id="createCheckoutAccount"
                                            type="checkbox"
                                            checked={createAccount}
                                            onChange={(e) => setCreateAccount(e.target.checked)}
                                            className="!m-0 !h-4 !w-4 !min-w-4 !max-w-4 !shrink-0 !p-0 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <label
                                            htmlFor="createCheckoutAccount"
                                            className="!m-0 !block min-w-0 flex-1 cursor-pointer text-sm font-semibold leading-5 text-blue-900"
                                        >
                                            תיצור לי משתמש למעקב אחרי הזמנות ועוד
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => setShowAccountInfo((open) => !open)}
                                            className="!m-0 !inline-flex !h-8 !w-8 !min-w-8 !max-w-8 !shrink-0 !p-0 items-center justify-center rounded-full border border-blue-500 bg-white text-xs font-bold text-blue-700 hover:bg-blue-100"
                                            aria-expanded={showAccountInfo}
                                            aria-label="מידע נוסף על יצירת חשבון"
                                        >
                                            i
                                        </button>
                                    </div>
                                    {showAccountInfo && (
                                        <p className="mt-1 text-xs leading-5 text-blue-900">
                                            לפני התשלום תוכלו לבחור סיסמה או להתחבר עם Google. עם משתמש אפשר לעקוב אחרי הזמנות, לבקש החזר ולהסיר פריטים מההזמנה. אפשר להסיר את הסימון ולהמשיך כאורחים.
                                        </p>
                                    )}
                                </div>
                            )}

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
                                        <option value="">בחר נקודת איסוף</option>
                                        {pickupSpots.map((spot) => (
                                            <option key={spot} value={spot}>
                                                {spot}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            
                            {selectedSpotData && selectedSpotData.options.length >= 1 && selectedSpotData.options.includes('homeDelivery') && (
                                <div className="form-group md:col-span-2 bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                                        אפשרויות איסוף
                                    </h3>
                                    <div className="space-y-2">
                                        {selectedSpotData.options.includes('pickup') && (
                                            <button
                                                type="button"
                                                onClick={() => setDeliveryOption('pickup')}
                                                className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                                                    deliveryOption === 'pickup' 
                                                    ? 'border-blue-600 bg-blue-500 text-white shadow-lg' 
                                                    : 'border-gray-400 bg-white text-gray-900 hover:border-blue-400 hover:bg-blue-50'
                                                }`}
                                            >
                                                <span className="font-medium text-sm">איסוף עצמי מ{selectedPickupSpot}</span>
                                                <span className={`font-bold text-sm ${deliveryOption === 'pickup' ? 'text-white' : 'text-green-600'}`}>חינם</span>
                                            </button>
                                        )}
                                        
                                        {selectedSpotData.options.includes('homeDelivery') && (
                                            <button
                                                type="button"
                                                onClick={() => setDeliveryOption('homeDelivery')}
                                                className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                                                    deliveryOption === 'homeDelivery' 
                                                    ? 'border-blue-600 bg-blue-500 text-white shadow-lg' 
                                                    : 'border-gray-400 bg-white text-gray-900 hover:border-blue-400 hover:bg-blue-50'
                                                }`}
                                            >
                                                <span className="font-medium text-sm">משלוח עד הבית (באזור {selectedPickupSpot})</span>
                                                <span className={`font-bold text-sm ${deliveryOption === 'homeDelivery' ? 'text-white' : 'text-gray-900'}`}>{selectedSpotData.deliveryFee}₪</span>
                                            </button>
                                        )}
                                        
                                        {selectedSpotData.options.includes('boxCollection') && (
                                            <button
                                                type="button"
                                                onClick={() => setDeliveryOption('boxCollection')}
                                                className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                                                    deliveryOption === 'boxCollection' 
                                                    ? 'border-blue-600 bg-blue-500 text-white shadow-lg' 
                                                    : 'border-gray-400 bg-white text-gray-900 hover:border-blue-400 hover:bg-blue-50'
                                                }`}
                                            >
                                                <span className="font-medium text-sm">איסוף מארגז שמור ב {selectedPickupSpot}</span>
                                                <span className={`font-bold text-sm ${deliveryOption === 'boxCollection' ? 'text-white' : 'text-green-600'}`}>חינם</span>
                                            </button>
                                        )}
                                    </div>
                                    
                                    {deliveryOption !== 'pickup' && (
                                        <div className="mt-4 pt-4 border-t border-gray-200">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-600">סכום ההזמנה:</span>
                                                <span className="font-medium">
                                                    {/* Calculate subtotal by subtracting shipping cost from cartTotal if shipping is included */}
                                                    {(deliveryOption === 'homeDelivery' 
                                                        ? (cartTotal - (cartItems.filter(ci => ci.id === SHIPPING_PRODUCT_ID).reduce((sum, i) => sum + (i.price * i.quantity), 0)))
                                                        : cartTotal).toFixed(2)} ₪
                                                </span>
                                            </div>
                                            {deliveryOption !== 'pickup' && (
                                                <div className="flex justify-between text-sm mt-2">
                                                    <span className="text-gray-600">דמי משלוח:</span>
                                                    <span className="font-medium">{deliveryOption === 'homeDelivery' ? (cartItems.filter(ci => ci.id === SHIPPING_PRODUCT_ID).reduce((sum, i) => sum + (i.price * i.quantity), 0)) : 0} ₪</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-lg font-small mt-2 pt-2 border-t border-gray-200">
                                                <span>סה"כ לתשלום:</span>
                                                <span>{totalWithDelivery} ₪</span>
                                            </div>
                                        </div>
                                    )}
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

                    {/* Add address and directions fields when homeDelivery is selected */}
                    {deliveryOption === 'homeDelivery' && (
                        <>
                            <div className="form-group md:col-span-2">
                                <label htmlFor="homeDeliveryAddress" className="block text-sm font-medium text-gray-700 mb-1">
                                    כתובת למשלוח <span className="text-red-500">*</span>
                                </label>
                                <input
                                    id="homeDeliveryAddress"
                                    type="text"
                                    placeholder="כתובת מלאה למשלוח"
                                    value={userAddress} 
                                    onChange={(e) => setUserAddress(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div className="form-group md:col-span-2">
                                <label htmlFor="deliveryDirections" className="block text-sm font-medium text-gray-700 mb-1">
                                    הנחיות למשלוח (אופציונלי)
                                </label>
                                <textarea
                                    id="deliveryDirections"
                                    placeholder="הנחיות נוספות למשלוח - למשל: קומה, דירה, הנחיות חניה וכו'"
                                    value={userDirections}
                                    onChange={(e) => setUserDirections(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </>
                    )}
                </div>
                    </div>

                    {/* Order Total - SECOND */}
                    <div className="mb-6 bg-gradient-to-r from-blue-50 to-blue-100 p-4 sm:p-6 rounded-lg border-2 border-blue-200">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-lg sm:text-2xl font-bold text-gray-900">סה"כ לתשלום:</span>
                            <span className="text-xl sm:text-3xl font-bold text-blue-600 whitespace-nowrap">{totalWithDelivery.toFixed(2)}₪</span>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600 mt-2">
                            {Object.keys(itemsByOrder).length} הזמנות • {Object.values(itemsByOrder).reduce((total, order) => total + order.items.length, 0)} פריטים
                        </p>
                    </div>

                    {/* Terms and Buy Button - THIRD */}
                    <div className="mb-6 space-y-4">
                        <div className="flex items-center justify-center">
                            <input
                                type="checkbox" 
                                id="agreeToTerms" 
                                checked={agreeToTerms}
                                onChange={(e) => setAgreeToTerms(e.target.checked)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ml-2"
                            />
                            <label htmlFor="agreeToTerms" className="text-sm text-gray-700">
                                קראתי ואני מסכים ל<Link to="/terms-of-service" target="_blank" className="text-blue-600 hover:underline font-medium">תנאי השימוש</Link>
                            </label>
                        </div>

                        <button
                            onClick={() => proceedToCheckout()}
                            disabled={!agreeToTerms || !formIsValid}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-lg text-base sm:text-lg transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-blue-300 shadow-lg"
                        >
                            {totalWithDelivery === 0 ? 'אישור הזמנה' : `לתשלום - ${totalWithDelivery.toFixed(2)}₪`}
                        </button>

                        <button
                            onClick={handleCancel}
                            className="w-full bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg border-2 border-gray-300 transition-colors duration-200"
                        >
                            חזור לעגלה
                        </button>
                    </div>

                    {/* Compact Order Details - FOURTH */}
                    <div className="border-t-2 border-gray-200 pt-6">
                        <details className="group">
                            <summary className="cursor-pointer list-none flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                                <span className="text-lg font-semibold text-gray-800">פירוט ההזמנה</span>
                                <svg className="w-5 h-5 text-gray-600 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </summary>
                            
                            <div className="mt-4 space-y-4">
                                {Object.entries(itemsByOrder).map(([orderId, orderData]) => (
                                    <div key={orderId} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                                            <h3 className="font-semibold text-gray-800">{orderData.items[0]?.businessName || "Unknown Business"}</h3>
                                            <span className="text-sm font-medium text-blue-600">{orderData.total.toFixed(2)}₪</span>
                                        </div>
                                        
                                        <div className="divide-y divide-gray-100">
                                            {orderData.items.map((item, index) => (
                                                <div key={index} className="px-4 py-2 flex justify-between items-center text-sm">
                                                    <div className="flex-1">
                                                        <span className="font-medium text-gray-800">{item.name}</span>
                                                        {item.selectedOption && item.selectedOption !== 'ללא' && (
                                                            <span className="text-gray-500 text-xs mr-2">({item.selectedOption})</span>
                                                        )}
                                                    </div>
                                                    <div className="text-left">
                                                        <span className="text-gray-600">
                                                            {item.measurementType === 'unit'
                                                              ? `${item.quantity} יח' (~${getEstimatedChargeableQuantity(item).toFixed(2)} ק"ג) × ${item.price}₪/ק"ג`
                                                              : `${item.quantity} × ${item.price}₪`}
                                                        </span>
                                                        <span className="font-medium text-gray-800 mr-2">= {getEstimatedLineTotal(item).toFixed(2)}₪</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {orderData.minimumOrderAmount > 0 && orderData.total < orderData.minimumOrderAmount && (
                                            <div className="bg-red-50 px-4 py-2 border-t border-red-100">
                                                <p className="text-xs text-red-600">
                                                    ⚠️ סכום מינימום: {orderData.minimumOrderAmount}₪ (חסרים {(orderData.minimumOrderAmount - orderData.total).toFixed(2)}₪)
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </details>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderConfirmation;
