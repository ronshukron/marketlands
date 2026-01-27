import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { doc, updateDoc, getDoc, setDoc, collection, addDoc, serverTimestamp, arrayUnion, runTransaction } from "firebase/firestore";
import { db } from '../../firebase/firebase';
import '../OrderConfirmation.css';
import LoadingSpinner from '../LoadingSpinner';
import LoadingSpinnerPayment from '../LoadingSpinnerPayment';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import { useCart } from '../../contexts/CartContext';
import { pickupSpots, pickupSpotsData } from '../../data/pickupSpots';
import { createGrowSuspendedPaymentProcess } from './delayedPaymentService';
import { getEndingTimeForSpot } from '../../utils/orderUtils';
import { functionsEndpoint } from '../../utils/functionsClient';
import { isDelayedPaymentSpot } from '../../services/paymentConfigService';

// Catalog numbers for shipping line items
const SHIPPING_CATALOG_NUMBER = process.env.REACT_APP_SHIPPING_CATALOG_NUMBER || '118';
const BOX_COLLECTION_CATALOG_NUMBER = process.env.REACT_APP_BOX_COLLECTION_CATALOG_NUMBER || '999002';
// Shipping product id in Firestore
const SHIPPING_PRODUCT_ID = 'Mdean61FIezxRcMUZjVn';

// ------------------------------------------------------------------
// HOLD BUFFER: % extra to hold on the customer's credit card (J5).
// e.g. 15 means hold 115% of order total so final weighing can go up.
// ------------------------------------------------------------------
const HOLD_BUFFER_PERCENT = 15;
// Catalog number for the buffer line item (weighing safety margin)
const BUFFER_LINE_CATALOG_NUMBER = process.env.REACT_APP_BUFFER_LINE_CATALOG_NUMBER || '999003';

/**
 * Delayed-payment variant of OrderConfirmation.
 *
 * Differences vs legacy:
 * - Creates a "delayed order" in customerOrders (J5 flow)
 * - Calls a different backend endpoint to create a Grow suspended payment process
 * - Stores delayed-order metadata fields (safe fields only; never store processToken on client)
 */
const OrderConfirmationDelayed = () => {
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
    const [userAddress, setUserAddress] = useState(''); 
    const [requestAddress, setRequestAddress] = useState(false); 
    const [userDirections, setUserDirections] = useState('');
    const [selectedPickupSpot, setSelectedPickupSpot] = useState(() => {
        return localStorage.getItem('selectedPickupSpot') || '';
    });
    const { userLoggedIn, currentUser } = useAuth();

    // Get pickup spots from the order
    const [availablePickupSpots, setAvailablePickupSpots] = useState([]);

    // Add a new state to track which pickup spots are available for each business order
    const [businessPickupSpots, setBusinessPickupSpots] = useState({});
    
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
        const orderIds = Object.keys(itemsByOrder);

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
            const businessSpots = {};
            
            // Fetch pickup spots for each order
            for (const orderId of orderIds) {
                try {
                    const orderDocRef = await getDoc(doc(db, "Orders", orderId));
                    if (orderDocRef.exists()) {
                        const orderData = orderDocRef.data();
                        
                        // Save pickup spots for this business order
                        if (orderData.pickupSpots && orderData.pickupSpots.length > 0) {
                            businessSpots[orderId] = orderData.pickupSpots;
                            orderData.pickupSpots.forEach(spot => orderSpots.add(spot));
                        }
                    }
                } catch (error) {
                    console.error("Error fetching order pickup spots:", error);
                }
            }
            
            // Save the mapping of business orders to their available pickup spots
            setBusinessPickupSpots(businessSpots);
            
            // Convert Set to Array
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
            return orderData.requestAddress === true;
        });
        
        setRequestAddress(needsAddress);
    }, [itemsByOrder]);

    // Add this useEffect here, with the other useEffect hooks
    useEffect(() => {
        if (selectedPickupSpot && Object.keys(businessPickupSpots).length > 0) {
            validatePickupSpotCompatibility();
        }
    }, [selectedPickupSpot, businessPickupSpots]);

    // Check if user should be redirected to regular checkout when pickup spot changes
    useEffect(() => {
        const checkPaymentRoute = async () => {
            if (!selectedPickupSpot || selectedPickupSpot === '' || selectedPickupSpot === 'הכל') {
                return; // No spot selected yet
            }
            
            try {
                const shouldBeDelayed = await isDelayedPaymentSpot(selectedPickupSpot);
                
                // If this pickup spot is NOT configured for delayed payment, redirect to regular checkout
                if (!shouldBeDelayed) {
                    // Update localStorage with the new pickup spot
                    localStorage.setItem('selectedPickupSpot', selectedPickupSpot);
                    
                    // Navigate to regular order confirmation
                    navigate('/order-confirmation', {
                        state: {
                            cartProducts: cartItems,
                            redirectedFromDelayed: true
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

    // Then define the validatePickupSpotCompatibility function
    const validatePickupSpotCompatibility = () => {
        // Require a concrete pickup spot selection
        if (!selectedPickupSpot || selectedPickupSpot === "הכל") {
            Swal.fire({
                icon: 'error',
                title: 'נא לבחור נקודת איסוף',
                text: 'יש לבחור נקודת איסוף ספציפית עבור ההזמנה שלך',
                confirmButtonText: 'הבנתי'
            });
            return false;
        }
        
        const incompatibleItems = [];
        
        // Check each order to see if it can ship to the selected pickup spot
        Object.entries(itemsByOrder).forEach(([orderId, orderData]) => {
            const businessSpots = businessPickupSpots[orderId] || [];
            
            // If this business doesn't ship to the selected spot
            if (!businessSpots.includes(selectedPickupSpot)) {
                // Add items from this business to the incompatible list
                orderData.items.forEach(item => {
                    incompatibleItems.push({
                        name: item.name || item.productName || item.title || "Unknown Item",
                        businessName: item.businessName || "Unknown Business"
                    });
                });
            }
        });
        
        // If we found incompatible items, show an error
        if (incompatibleItems.length > 0) {
            const itemsList = incompatibleItems.map(item => 
                `${item.name} (${item.businessName})`
            ).join('\n');
            
            Swal.fire({
                html: `הפריטים הבאים אינם זמינים לנקודת האיסוף "${selectedPickupSpot}":<br><br>${itemsList.replace(/\n/g, '<br>')}`,
                icon: 'error',
                confirmButtonText: 'הבנתי',
                footer: 'עליך להסיר פריטים אלה מהעגלה או לבחור נקודת איסוף אחרת'
            });
            return false;
        }
        
        return true;
    };

    // Add this useEffect after the existing useEffects
    useEffect(() => {
        const checkExpiredOrders = async () => {
            if (Object.keys(itemsByOrder).length === 0) return;
            
            const expiredItems = [];
            const expiredOrderIds = [];
            
            // Check each order in the cart
            for (const [orderId, orderData] of Object.entries(itemsByOrder)) {
                const orderHasEnded = await checkIfOrderEnded(orderId);
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
    }, [itemsByOrder, navigate, removeOrderFromCart]);

    const handleSubmitOrder = async () => {
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
        const customerOrderIdOrderRef = doc(collection(db, "customerOrdersDelayed"), customerOrderId);
        
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
                        selectedOption: item.selectedOption || "None",
                        // Firestore does not allow undefined values anywhere in the document.
                        catalogNumber: item.catalogNumber || '',
                        vatType: item.vatType ?? 3,
                        isShipping: item.isShipping === true
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

        await setDoc(customerOrderIdOrderRef, {
            orderBreakdown,
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
                    // Avoid writing undefined if selectedSpotData is missing.
                    deliveryFee: deliveryOption === 'homeDelivery' ? (Number(selectedSpotData?.deliveryFee) || 0) : 0,
                }
            },
            businessIds: businessIds,
            createdAt: new Date().toISOString(),
            paymentStatus: 'pending_payment',
            paymentMethod: 'grow_j5',
            grandTotal: totalWithDelivery,
            // Delayed-order fields (safe client-side fields)
            isDelayedOrder: true,
            delayedOrderStatus: 'created_in_fe', // later: you will refine statuses
            delayedPayment: {
                provider: 'grow',
                chargeType: 2, // suspended charge (J5)
                status: 'created',
                holdBufferPercent: HOLD_BUFFER_PERCENT,
                holdSum: Math.round(totalWithDelivery * (1 + HOLD_BUFFER_PERCENT / 100) * 100) / 100
            },
            // If user is logged in, store their ID
            userId: currentUser?.uid || null
        }, { merge: true });

        // Update the original orders with the actual document ID
        await updateOrdersWithReference(Object.keys(itemsByOrder), customerOrderId);

        // Add the order to the user's document
        if (currentUser && currentUser.uid) {
            try {
                const userDocRef = doc(db, "users", currentUser.uid);
                await updateDoc(userDocRef, {
                    orders: arrayUnion(customerOrderId)
                });
            } catch (error) {
                console.error("Error updating user document:", error);
            }
        }

        // Get all orderIds instead of just the first one
        const orderIds = Object.keys(itemsByOrder);

        try {
            // Call backend to create Grow (J5) payment process.
            // Backend MUST be the one calling Grow.
            // Hold extra buffer so final weighing can exceed estimate.
            const holdAmount = Math.round(totalWithDelivery * (1 + HOLD_BUFFER_PERCENT / 100) * 100) / 100;

            const paymentData = {
                mode: 'weekly_delayed',
                amount: holdAmount,
                userName,
                userPhone,
                userEmail,
                successUrl: `${window.location.origin}/payment-success/`,
                cancelUrl: `${window.location.origin}/payment-cancel/`,
                description: `תשלום מושהה (J5) עבור תוצרת חקלאית`,
                customerOrderId,
                orderIds,
                pickupSpot: selectedPickupSpot,
                deliveryOption
            };

            // Add product data for each item in the cart (invoice context)
            let productIndex = 0;
            let productLinesSum = 0;
            Object.entries(itemsByOrder).forEach(([orderId, orderData]) => {
                orderData.items.forEach(item => {
                    if (item.quantity > 0) {
                        const linePrice = Math.round(item.quantity * item.price * 100) / 100;
                        paymentData[`productData[${productIndex}][catalogNumber]`] = item.catalogNumber;
                        paymentData[`productData[${productIndex}][quantity]`] = item.quantity;
                        paymentData[`productData[${productIndex}][price]`] = linePrice;
                        paymentData[`productData[${productIndex}][itemDescription]`] = item.name || item.productName || 'Unknown Item';
                        paymentData[`productData[${productIndex}][vatType]`] = item.vatType ?? 3;
                        productLinesSum += linePrice;
                        productIndex++;
                    }
                });
            });

            // Add buffer line so product lines sum == holdAmount
            const bufferAmount = Math.round((holdAmount - productLinesSum) * 100) / 100;
            if (bufferAmount > 0) {
                paymentData[`productData[${productIndex}][catalogNumber]`] = BUFFER_LINE_CATALOG_NUMBER;
                paymentData[`productData[${productIndex}][quantity]`] = 1;
                paymentData[`productData[${productIndex}][price]`] = bufferAmount;
                paymentData[`productData[${productIndex}][itemDescription]`] = 'מרווח ביטחון לשקילה (יוחזר/יופחת לפי משקל בפועל)';
                paymentData[`productData[${productIndex}][vatType]`] = 3; // exempt
                productIndex++;
            }

            console.log('paymentData', paymentData);
    
            const paymentResponse = await createGrowSuspendedPaymentProcess(paymentData);
    
            // Expecting { status: 1, data: { url } } (similar to independent flow)
            const url = paymentResponse?.data?.url || paymentResponse?.url;
            if (paymentResponse?.status === 1 && url) {
                window.location.href = url;
            } else {
                console.error('Failed to create suspended payment', paymentResponse);
                Swal.fire('שגיאה', 'לא ניתן היה ליצור תשלום מושהה. נסו שוב מאוחר יותר.', 'error');
            }
        } catch (error) {
            console.error("Failed to create delayed payment:", error);
            Swal.fire('שגיאה', 'אירעה שגיאה בעת יצירת התשלום המושהה. נסו שוב מאוחר יותר.', 'error');
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

    // Add this function to handle free orders (unchanged)
    const handleFreeOrder = async () => {
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
                    directions: userDirections,
                    pickupSpot: selectedPickupSpot,
                    deliveryOption,
                    deliveryDetails: {
                        type: deliveryOption,
                        boxCollectionName: deliveryOption === 'boxCollection' ? userName : null,
                    deliveryFee: deliveryOption === 'homeDelivery' ? (Number(selectedSpotData?.deliveryFee) || 0) : 0,
                    }
                },
                businessIds: businessIds,
                createdAt: new Date().toISOString(),
                paymentStatus: 'completed',
                paymentMethod: 'free',
                grandTotal: totalWithDelivery,
                // If user is logged in, store their ID
                userId: currentUser?.uid || null
            };
            
            // Create a customer order document
            const customerOrderRef = await addDoc(collection(db, "customerOrdersDelayed"), customerOrderData);
            
            // Now call the function that's defined at component level
            await updateOrdersWithReference(orderIds, customerOrderRef.id);

            // Also add the order to the user's document if user is logged in
            if (currentUser && currentUser.uid) {
                try {
                    // Get a reference to the user document
                    const userDocRef = doc(db, "users", currentUser.uid);
                    
                    // Update the user document
                    await updateDoc(userDocRef, {
                        // Add the order ID to the orders array field
                        orders: arrayUnion(customerOrderRef.id)
                    });
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
    const proceedToCheckout = async () => {
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
        
        // Check if all items can be shipped to the selected pickup spot
        if (!validatePickupSpotCompatibility()) {
            return;
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
        try {
            // Production: Always use production endpoint
            const url = functionsEndpoint('checkAndUpdateStock');
            
            // Local testing (uncomment to use emulator):
            // const forceLocal = process.env.REACT_APP_FORCE_FUNCTIONS_LOCAL === 'true';
            // const url = forceLocal
            //   ? 'http://127.0.0.1:5001/auth-development-323c3/us-central1/checkAndUpdateStock'
            //   : functionsEndpoint('checkAndUpdateStock');

            const response = await axios.post(url, {
                orderItems
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
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
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
                <div className="bg-purple-700 text-white px-6 py-4">
                    <h1 className="text-2xl font-bold">השלמת הזמנה </h1>
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
                                    className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${userLoggedIn ? 'bg-gray-100 cursor-not-allowed' : ''}`}
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
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
                                                    ? 'border-purple-700 bg-purple-600 text-white shadow-lg' 
                                                    : 'border-gray-400 bg-white text-gray-900 hover:border-purple-400 hover:bg-purple-50'
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
                                                    ? 'border-purple-700 bg-purple-600 text-white shadow-lg' 
                                                    : 'border-gray-400 bg-white text-gray-900 hover:border-purple-400 hover:bg-purple-50'
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
                                                    ? 'border-purple-700 bg-purple-600 text-white shadow-lg' 
                                                    : 'border-gray-400 bg-white text-gray-900 hover:border-purple-400 hover:bg-purple-50'
                                                }`}
                                            >
                                                <span className="font-medium text-sm">איסוף מארגז שמור ב {selectedPickupSpot}</span>
                                                <span className={`font-bold text-sm ${deliveryOption === 'boxCollection' ? 'text-white' : 'text-green-600'}`}>חינם</span>
                                            </button>
                                        )}
                                    </div>
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
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Order Total - SECOND */}
                    <div className="mb-6 bg-gradient-to-r from-purple-50 to-purple-100 p-4 sm:p-6 rounded-lg border-2 border-purple-200">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-lg sm:text-2xl font-bold text-gray-900">סה"כ הזמנה:</span>
                            <span className="text-xl sm:text-3xl font-bold text-purple-700 whitespace-nowrap">{totalWithDelivery.toFixed(2)}₪</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 mt-2">
                            <span className="text-sm sm:text-base text-gray-700">מסגרת אשראי (כולל {HOLD_BUFFER_PERCENT}% מרווח):</span>
                            <span className="text-base sm:text-lg font-semibold text-gray-700 whitespace-nowrap">{(totalWithDelivery * (1 + HOLD_BUFFER_PERCENT / 100)).toFixed(2)}₪</span>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600 mt-2">
                            נחזיק מסגרת גבוהה יותר למקרה שהמשקל הסופי יעלה על ההערכה. החיוב בפועל יהיה לפי השקילה ביום המשלוח.
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
                                className="h-4 w-4 text-purple-700 focus:ring-purple-500 border-gray-300 rounded ml-2"
                            />
                            <label htmlFor="agreeToTerms" className="text-sm text-gray-700">
                                קראתי ואני מסכים ל<Link to="/terms-of-service" target="_blank" className="text-purple-700 hover:underline font-medium">תנאי השימוש</Link>
                            </label>
                        </div>

                        <button
                            onClick={proceedToCheckout}
                            disabled={!agreeToTerms || !formIsValid}
                            className="w-full bg-purple-700 hover:bg-purple-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-lg text-base sm:text-lg transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-purple-300 shadow-lg"
                        >
                            {totalWithDelivery === 0
                                ? 'אישור הזמנה'
                                : "לתשלום"}
                        </button>

                        <button
                            onClick={handleCancel}
                            className="w-full bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg border-2 border-gray-300 transition-colors duration-200"
                        >
                            חזור לעגלה
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderConfirmationDelayed;


