import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import usePickupSpots from '../../hooks/usePickupSpots';
import { createDelayedPaymentCheckout, DELAYED_PAYMENT_GATEWAYS } from '../../services/delayedPaymentGatewayService';
import { getEndingTimeForSpot } from '../../utils/orderUtils';
import { functionsEndpoint } from '../../utils/functionsClient';
import { getReusableCartonConfig, isDelayedPaymentSpot } from '../../services/paymentConfigService';
import { resolveCommunityName } from '../../services/pickupSpotsService';
import { getEstimatedChargeableQuantity, getEstimatedLineTotal } from '../../utils/pricing';
import {
    generateAvailableDeliveryDates,
    getWeekKey,
    isDeliveryDateOrderable,
    isAlwaysOnGroceryOrder,
    isShowingNextDeliveryWeek,
} from '../../utils/deliveryScheduleUtils';
import {
  getReferralConfig,
  getStoredReferralCode,
  recordReferralUse,
} from '../../services/referralService';
import { INTRODUCTION_BASKET_CATALOG_NUMBER } from '../../services/introductionBasketService';

async function processReferralReward({ orderId, buyerUid, orderTotal }) {
  const refCode = getStoredReferralCode();
  if (!refCode || !orderId) return;
  try {
    const config = await getReferralConfig();
    if (config.mode !== 'personal') return;
    const percent = Number(config.personalRewardPercent) || 0;
    const fixed = Number(config.personalRewardFixed) || 0;
    const reward = fixed > 0 ? fixed : (Number(orderTotal) * percent) / 100;
    if (reward <= 0) return;
    await recordReferralUse({
      refCode,
      orderId,
      buyerUid: buyerUid || null,
      rewardAmount: Math.round(reward * 100) / 100,
    });
  } catch (error) {
    console.error('Referral reward failed:', error);
  }
}

// Catalog numbers for shipping line items
const SHIPPING_CATALOG_NUMBER = process.env.REACT_APP_SHIPPING_CATALOG_NUMBER || '118';
const BOX_COLLECTION_CATALOG_NUMBER = process.env.REACT_APP_BOX_COLLECTION_CATALOG_NUMBER || '999002';
// Shipping product id in Firestore
const SHIPPING_PRODUCT_ID = 'Mdean61FIezxRcMUZjVn';

// ------------------------------------------------------------------
// HOLD BUFFER: % extra to hold on the customer's credit card (J5).
// e.g. 5 means hold 105% of order total so final weighing can go up.
// ------------------------------------------------------------------
const HOLD_BUFFER_PERCENT = 5;
// Catalog number for the buffer line item (weighing safety margin)
const BUFFER_LINE_CATALOG_NUMBER = process.env.REACT_APP_BUFFER_LINE_CATALOG_NUMBER || '999003';
const hebrewPickupSpotCollator = new Intl.Collator('he');

const sortPickupSpotsByHebrewAlphabet = (spots) =>
    [...spots].sort((a, b) => hebrewPickupSpotCollator.compare(a, b));

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const buildOrderLineFromCartItem = (item) => ({
    productId: item.id,
    productName: item.name,
    quantity: item.quantity,
    estimatedChargeQuantity: getEstimatedChargeableQuantity(item),
    estimatedLineTotal: getEstimatedLineTotal(item),
    price: item.price,
    selectedOption: item.selectedOption || "None",
    catalogNumber: item.catalogNumber || '',
    vatType: item.vatType ?? 3,
    isShipping: item.isShipping === true,
    isBasketComponent: item.isBasketComponent === true,
    isBasketAdjustment: item.isBasketAdjustment === true,
    basketId: item.basketId || '',
    basketInstanceId: item.basketInstanceId || '',
    basketTitle: item.basketTitle || '',
    basketPrice: Number(item.basketPrice) || 0,
    basketComponentSubtotal: Number(item.basketComponentSubtotal) || 0,
    basketCommunity: item.basketCommunity || '',
    measurementType: item.measurementType || 'kg',
    unitSize: item.unitSize || 1,
    averageWeightKg: item.averageWeightKg || 1
});

const buildIntroductionBasketSummaries = (items = []) => {
    const groups = {};

    items.forEach((item) => {
        if (!item.basketInstanceId) return;
        if (!groups[item.basketInstanceId]) {
            groups[item.basketInstanceId] = {
                basketId: item.basketId || '',
                basketInstanceId: item.basketInstanceId,
                title: item.basketTitle || 'סל היכרות',
                displayPrice: Number(item.basketPrice) || 0,
                componentSubtotal: Number(item.basketComponentSubtotal) || 0,
                community: item.basketCommunity || '',
                componentLineRefs: [],
                adjustmentTotal: 0,
            };
        }

        if (item.isBasketAdjustment) {
            groups[item.basketInstanceId].adjustmentTotal += getEstimatedLineTotal(item);
            return;
        }

        if (item.isBasketComponent) {
            groups[item.basketInstanceId].componentLineRefs.push({
                orderId: item.orderId || '',
                productId: item.id || '',
                productName: item.name || '',
                quantity: Number(item.quantity) || 0,
                selectedOption: item.selectedOption || '',
                estimatedLineTotal: getEstimatedLineTotal(item),
                businessId: item.businessId || '',
                businessName: item.businessName || '',
            });
        }
    });

    return Object.values(groups).map((basket) => ({
        ...basket,
        componentSubtotal: roundMoney(
            basket.componentSubtotal
            || basket.componentLineRefs.reduce((sum, line) => sum + (Number(line.estimatedLineTotal) || 0), 0)
        ),
        displayPrice: roundMoney(basket.displayPrice),
        adjustmentTotal: roundMoney(basket.adjustmentTotal),
    }));
};

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
    const [reusableCartonConfig, setReusableCartonConfig] = useState({
        enabledSpots: [],
        defaultSelectedSpots: [],
    });
    const [useReusableFarmerCartons, setUseReusableFarmerCartons] = useState(false);
    const [showReusableCartonInfo, setShowReusableCartonInfo] = useState(false);
    const { userLoggedIn, currentUser } = useAuth();
    const { pickupSpots, pickupSpotsData } = usePickupSpots();

    // Get pickup spots from the order
    const [availablePickupSpots, setAvailablePickupSpots] = useState([]);

    // Add a new state to track which pickup spots are available for each business order
    const [cartOrderMeta, setCartOrderMeta] = useState({});
    const [deliverySchedule, setDeliverySchedule] = useState(null);
    const [availableDeliveryDates, setAvailableDeliveryDates] = useState([]);
    const [selectedDeliveryDate, setSelectedDeliveryDate] = useState('');
    const [deliveryDateError, setDeliveryDateError] = useState('');
    const cartHasAlwaysOnGrocery = Object.values(cartOrderMeta).some((orderData) => isAlwaysOnGroceryOrder(orderData));
    const resolvedPickupSpot = useMemo(
        () => resolveCommunityName(selectedPickupSpot),
        [selectedPickupSpot]
    );
    const selectablePickupSpots = useMemo(() => {
        if (availablePickupSpots.length === 0) return [];
        const allowed = new Set(availablePickupSpots.map((spot) => resolveCommunityName(spot)));
        return sortPickupSpotsByHebrewAlphabet(
            pickupSpots.filter((spot) => allowed.has(resolveCommunityName(spot)))
        );
    }, [availablePickupSpots, pickupSpots]);
    
    // Get the selected pickup spot's data
    const selectedSpotData = resolvedPickupSpot ? pickupSpotsData[resolvedPickupSpot] : null;
    const reusableCartonAvailable = selectedPickupSpot && reusableCartonConfig.enabledSpots.includes(selectedPickupSpot);

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

    const isOrderUnavailableForSelectedDate = useCallback((orderId) => {
        const orderData = cartOrderMeta[orderId];
        if (!orderData || !isAlwaysOnGroceryOrder(orderData)) return false;
        if (!deliverySchedule || !selectedDeliveryDate || !selectedPickupSpot) return false;
        return !isDeliveryDateOrderable(selectedDeliveryDate, deliverySchedule, new Date(), orderData, selectedPickupSpot);
    }, [cartOrderMeta, deliverySchedule, selectedDeliveryDate, selectedPickupSpot]);
    const cutoffCartItems = useMemo(() => {
        const items = [];
        Object.entries(itemsByOrder).forEach(([orderId, orderData]) => {
            if (!isOrderUnavailableForSelectedDate(orderId)) return;
            const businessName = orderData.items[0]?.businessName || 'Unknown Business';
            orderData.items
                .filter((item) => !item.isShipping)
                .forEach((item) => items.push({ ...item, orderId, businessName }));
        });
        return items;
    }, [itemsByOrder, isOrderUnavailableForSelectedDate]);
    const effectiveItemsByOrder = useMemo(() => {
        const next = {};
        Object.entries(itemsByOrder).forEach(([orderId, orderData]) => {
            if (isOrderUnavailableForSelectedDate(orderId)) return;
            const items = orderData.items || [];
            if (items.length === 0) return;
            next[orderId] = {
                ...orderData,
                items,
                total: items.reduce((sum, item) => sum + getEstimatedLineTotal(item), 0),
            };
        });
        return next;
    }, [itemsByOrder, isOrderUnavailableForSelectedDate]);
    const effectiveCartItems = useMemo(() => (
        Object.values(effectiveItemsByOrder).flatMap((orderData) => orderData.items || [])
    ), [effectiveItemsByOrder]);
    const introductionBasketsForOrder = useMemo(
        () => buildIntroductionBasketSummaries(effectiveCartItems),
        [effectiveCartItems]
    );
    const cutoffCartTotal = useMemo(
        () => cutoffCartItems.reduce((sum, item) => sum + getEstimatedLineTotal(item), 0),
        [cutoffCartItems]
    );
    const effectiveTotalWithDelivery = Math.max(0, totalWithDelivery - cutoffCartTotal);

    // Add this useEffect to update the total when delivery option changes
    useEffect(() => {
        let newTotal = cartTotal;
        if (selectedSpotData) {
            // boxCollection is free now; do not add any fee
            // homeDelivery shipping is a product in cart
        }
        setTotalWithDelivery(newTotal);
    }, [deliveryOption, selectedSpotData, cartTotal]);

    useEffect(() => {
        let isMounted = true;

        const loadReusableCartonConfig = async () => {
            const config = await getReusableCartonConfig();
            if (!isMounted) return;
            setReusableCartonConfig(config);
        };

        loadReusableCartonConfig();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        const isAvailable = selectedPickupSpot && reusableCartonConfig.enabledSpots.includes(selectedPickupSpot);
        const isDefaultSelected = selectedPickupSpot && reusableCartonConfig.defaultSelectedSpots.includes(selectedPickupSpot);

        setUseReusableFarmerCartons(Boolean(isAvailable && isDefaultSelected));
        setShowReusableCartonInfo(false);
    }, [selectedPickupSpot, reusableCartonConfig]);

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
            const orderMeta = {};
            
            // Fetch pickup spots for each order
            for (const orderId of orderIds) {
                try {
                    const orderDocRef = await getDoc(doc(db, "Orders", orderId));
                    if (orderDocRef.exists()) {
                        const orderData = orderDocRef.data();
                        orderMeta[orderId] = orderData;
                        
                        if (orderData.pickupSpots && orderData.pickupSpots.length > 0) {
                            orderData.pickupSpots.forEach((spot) => orderSpots.add(resolveCommunityName(spot)));
                        }
                    }
                } catch (error) {
                    console.error("Error fetching order pickup spots:", error);
                }
            }
            
            setCartOrderMeta(orderMeta);
            
            // Convert Set to Array
            setAvailablePickupSpots(Array.from(orderSpots));
            
            // Auto-select: prefer the saved spot from localStorage, then fallback to single-spot auto-select
            const savedSpot = resolveCommunityName(localStorage.getItem('selectedPickupSpot'));
            if (savedSpot && orderSpots.has(savedSpot)) {
                setSelectedPickupSpot(savedSpot);
            } else if (orderSpots.size === 1) {
                setSelectedPickupSpot(Array.from(orderSpots)[0]);
            }
        };
        
        collectPickupSpots();
    }, [userLoggedIn, currentUser, itemsByOrder]);

    // Persist selected pickup spot to localStorage whenever it changes
    useEffect(() => {
        if (selectedPickupSpot && selectedPickupSpot !== 'הכל') {
            localStorage.setItem('selectedPickupSpot', selectedPickupSpot);
        }
    }, [selectedPickupSpot]);

    useEffect(() => {
        const loadDeliverySchedule = async () => {
            setDeliveryDateError('');

            if (!cartHasAlwaysOnGrocery) {
                setDeliverySchedule(null);
                setAvailableDeliveryDates([]);
                setSelectedDeliveryDate('');
                return;
            }

            if (!selectedPickupSpot || selectedPickupSpot === 'הכל') {
                setDeliverySchedule(null);
                setAvailableDeliveryDates([]);
                setSelectedDeliveryDate('');
                setDeliveryDateError('יש לבחור קהילה כדי לבחור תאריך משלוח.');
                return;
            }

            const communityKey = resolveCommunityName(selectedPickupSpot);

            try {
                const scheduleSnap = await getDoc(doc(db, 'deliverySchedules', communityKey));
                if (!scheduleSnap.exists()) {
                    setDeliverySchedule(null);
                    setAvailableDeliveryDates([]);
                    setSelectedDeliveryDate('');
                    setDeliveryDateError('לא הוגדר לוח משלוחים לקהילה זו. יש לפנות למנהל המערכת.');
                    return;
                }

                const scheduleData = scheduleSnap.data();
                setDeliverySchedule(scheduleData);
                const scheduleDates = generateAvailableDeliveryDates(scheduleData);
                const currentWeekKey = getWeekKey(new Date());
                const currentWeekDates = scheduleDates.filter((dateKey) => getWeekKey(dateKey) === currentWeekKey);
                const nextVisibleWeekKey = currentWeekDates.length > 0 ? currentWeekKey : getWeekKey(scheduleDates[0]);
                const dates = scheduleDates.filter((dateKey) => getWeekKey(dateKey) === nextVisibleWeekKey);

                setAvailableDeliveryDates(dates);
                if (dates.length === 0) {
                    setSelectedDeliveryDate('');
                    setDeliveryDateError('אין תאריכי משלוח זמינים לקהילה זו כרגע.');
                    return;
                }

                setSelectedDeliveryDate((current) => {
                    const stored = localStorage.getItem(`selectedDeliveryDate:${communityKey}`);
                    if (dates.includes(current)) return current;
                    if (stored && dates.includes(stored)) return stored;
                    return dates[0];
                });
            } catch (error) {
                console.error('Error loading delivery schedule:', error);
                setDeliverySchedule(null);
                setAvailableDeliveryDates([]);
                setSelectedDeliveryDate('');
                setDeliveryDateError('טעינת לוח המשלוחים נכשלה. נסו שוב מאוחר יותר.');
            }
        };

        loadDeliverySchedule();
    }, [cartHasAlwaysOnGrocery, selectedPickupSpot, cartOrderMeta]);

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
                        (availablePickupSpots.length === 0 || (selectedPickupSpot && selectedPickupSpot !== 'הכל')) &&
                        (!cartHasAlwaysOnGrocery || (selectedDeliveryDate && !deliveryDateError)); 
        setFormIsValid(isValid);
    }, [userName, userPhone, userEmail, userAddress, requestAddress, selectedPickupSpot, availablePickupSpots, deliveryOption, cartHasAlwaysOnGrocery, selectedDeliveryDate, deliveryDateError]);

    useEffect(() => {
        if (selectedPickupSpot && selectedDeliveryDate) {
            localStorage.setItem(`selectedDeliveryDate:${selectedPickupSpot}`, selectedDeliveryDate);
        }
    }, [selectedPickupSpot, selectedDeliveryDate]);

    useEffect(() => {
        // Check if any order requires an address
        const needsAddress = Object.values(itemsByOrder).some(orderData => {
            return orderData.requestAddress === true;
        });
        
        setRequestAddress(needsAddress);
    }, [itemsByOrder]);

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

    const validateDeliveryDateSelection = () => {
        if (!cartHasAlwaysOnGrocery) return true;

        if (deliveryDateError || !selectedDeliveryDate) {
            Swal.fire({
                icon: 'error',
                title: 'נא לבחור תאריך משלוח',
                text: deliveryDateError || 'יש לבחור תאריך משלוח זמין עבור מוצרי החנות הקבועה.',
                confirmButtonText: 'הבנתי'
            });
            return false;
        }

        if (Object.keys(effectiveItemsByOrder).length === 0) {
            Swal.fire({
                icon: 'error',
                title: 'אין פריטים זמינים לתאריך הזה',
                text: 'כל הפריטים בעגלה עברו את זמן החיתוך לתאריך המשלוח שנבחר. בחרו תאריך אחר או חזרו לחנות.',
                confirmButtonText: 'הבנתי'
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

        if (!validateDeliveryDateSelection()) {
            return;
        }

        // Check if any order doesn't meet minimum order amount
        const invalidOrders = Object.entries(effectiveItemsByOrder).filter(([orderId, orderData]) => {
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
        for (const [orderId, orderData] of Object.entries(effectiveItemsByOrder)) {
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
        Object.entries(effectiveItemsByOrder).forEach(([orderId, orderData]) => {
            const orderItems = [];
            
            // Process each item in this order
            orderData.items.forEach(item => {
                if (item.quantity > 0) {
                    orderItems.push(buildOrderLineFromCartItem(item));
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
                items: orderItems,
                ...(cartHasAlwaysOnGrocery ? {
                    deliveryDate: selectedDeliveryDate,
                    deliveryWeekKey: getWeekKey(selectedDeliveryDate),
                    community: selectedPickupSpot
                } : {})
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
                },
                packagingPreference: {
                    useReusableFarmerCartons: Boolean(reusableCartonAvailable && useReusableFarmerCartons),
                    type: reusableCartonAvailable && useReusableFarmerCartons ? 'reusable_farmer_cartons' : 'new_carton'
                }
            },
            businessIds: businessIds,
            ...(introductionBasketsForOrder.length > 0 ? { introductionBaskets: introductionBasketsForOrder } : {}),
            createdAt: new Date().toISOString(),
            ...(cartHasAlwaysOnGrocery ? {
                fulfillment: {
                    community: selectedPickupSpot,
                    deliveryDate: selectedDeliveryDate,
                    deliveryWeekKey: getWeekKey(selectedDeliveryDate),
                    scheduleSource: 'deliverySchedules',
                    selectedAt: new Date().toISOString()
                },
                deliveryDate: selectedDeliveryDate,
                deliveryWeekKey: getWeekKey(selectedDeliveryDate),
                community: selectedPickupSpot
            } : {}),
            paymentStatus: 'pending_payment',
            paymentMethod: 'grow_delayed',
            grandTotal: effectiveTotalWithDelivery,
            // Delayed-order fields (safe client-side fields)
            isDelayedOrder: true,
            delayedOrderStatus: 'created_in_fe', // later: you will refine statuses
            delayedPayment: {
                provider: 'grow',
                status: 'created',
                checkoutFlow: 'dynamic_frontend_gateway',
                holdBufferPercent: HOLD_BUFFER_PERCENT,
                holdSum: Math.round(effectiveTotalWithDelivery * (1 + HOLD_BUFFER_PERCENT / 100) * 100) / 100
            },
            // If user is logged in, store their ID
            userId: currentUser?.uid || null
        }, { merge: true });

        // Update the original orders with the actual document ID
        await updateOrdersWithReference(Object.keys(effectiveItemsByOrder), customerOrderId);

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
        const orderIds = Object.keys(effectiveItemsByOrder);

        try {
            // Call backend to create Grow (J5) payment process.
            // Backend MUST be the one calling Grow.
            // Hold extra buffer so final weighing can exceed estimate.
            const holdAmount = Math.round(effectiveTotalWithDelivery * (1 + HOLD_BUFFER_PERCENT / 100) * 100) / 100;

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
                deliveryOption,
                ...(cartHasAlwaysOnGrocery ? { deliveryDate: selectedDeliveryDate } : {})
            };

            // Add product data for each item in the cart (invoice context)
            let productIndex = 0;
            let productLinesSum = 0;
            introductionBasketsForOrder.forEach((basket) => {
                const linePrice = Number(basket.displayPrice) || 0;
                if (linePrice <= 0) return;
                paymentData[`productData[${productIndex}][catalogNumber]`] = INTRODUCTION_BASKET_CATALOG_NUMBER;
                paymentData[`productData[${productIndex}][quantity]`] = 1;
                paymentData[`productData[${productIndex}][price]`] = linePrice;
                paymentData[`productData[${productIndex}][itemDescription]`] = `סל היכרות - ${basket.title}`;
                paymentData[`productData[${productIndex}][vatType]`] = 3;
                productLinesSum += linePrice;
                productIndex++;
            });
            Object.entries(effectiveItemsByOrder).forEach(([orderId, orderData]) => {
                orderData.items.forEach(item => {
                    if (item.quantity > 0 && !item.isBasketComponent && !item.isBasketAdjustment) {
                        const linePrice = getEstimatedLineTotal(item);
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
    
            const checkoutResult = await createDelayedPaymentCheckout(paymentData);
            const url = checkoutResult?.url;

            // Do not update customerOrdersDelayed from client after create:
            // Firestore rules allow create for guests but block updates.

            if (url) {
                window.location.href = url;
            } else {
                console.error('Failed to create delayed payment checkout', checkoutResult);
                Swal.fire('שגיאה', 'לא ניתן היה ליצור דף תשלום. נסו שוב מאוחר יותר.', 'error');
            }
        } catch (error) {
            console.error("Failed to create delayed payment:", error);
            Swal.fire('שגיאה', 'אירעה שגיאה בעת יצירת דף התשלום. נסו שוב מאוחר יותר.', 'error');
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
                if (isAlwaysOnGroceryOrder(orderData)) {
                    return false;
                }
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
            const filteredForStock = Object.entries(effectiveItemsByOrder).reduce((acc, [oid, data]) => {
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
            const orderIds = Object.keys(effectiveItemsByOrder);
            const customerOrderId = `temp_${new Date().getTime()}`;
            
            const orderBreakdown = {};
            const businessIds = [];
            // Process each order in the cart
            Object.entries(effectiveItemsByOrder).forEach(([orderId, orderData]) => {
                const orderItems = [];
                
                // Process each item in this order
                orderData.items.forEach(item => {
                    if (item.quantity > 0) {
                        orderItems.push(buildOrderLineFromCartItem(item));
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
                    items: orderItems,
                    ...(cartHasAlwaysOnGrocery ? {
                        deliveryDate: selectedDeliveryDate,
                        deliveryWeekKey: getWeekKey(selectedDeliveryDate),
                        community: selectedPickupSpot
                    } : {})
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
                    },
                    packagingPreference: {
                        useReusableFarmerCartons: Boolean(reusableCartonAvailable && useReusableFarmerCartons),
                        type: reusableCartonAvailable && useReusableFarmerCartons ? 'reusable_farmer_cartons' : 'new_carton'
                    }
                },
                businessIds: businessIds,
                ...(introductionBasketsForOrder.length > 0 ? { introductionBaskets: introductionBasketsForOrder } : {}),
                createdAt: new Date().toISOString(),
                ...(cartHasAlwaysOnGrocery ? {
                    fulfillment: {
                        community: selectedPickupSpot,
                        deliveryDate: selectedDeliveryDate,
                        deliveryWeekKey: getWeekKey(selectedDeliveryDate),
                        scheduleSource: 'deliverySchedules',
                        selectedAt: new Date().toISOString()
                    },
                    deliveryDate: selectedDeliveryDate,
                    deliveryWeekKey: getWeekKey(selectedDeliveryDate),
                    community: selectedPickupSpot
                } : {}),
                paymentStatus: 'completed',
                paymentMethod: 'free',
                grandTotal: effectiveTotalWithDelivery,
                // If user is logged in, store their ID
                userId: currentUser?.uid || null
            };
            
            // Create a customer order document
            const customerOrderRef = await addDoc(collection(db, "customerOrdersDelayed"), customerOrderData);
            
            // Now call the function that's defined at component level
            await updateOrdersWithReference(orderIds, customerOrderRef.id);
            await processReferralReward({
              orderId: customerOrderRef.id,
              buyerUid: currentUser?.uid,
              orderTotal: effectiveTotalWithDelivery,
            });

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
                            items: Object.values(effectiveItemsByOrder).reduce((total, order) => 
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
        
        if (!validateDeliveryDateSelection()) {
            return;
        }

        try {
            setLoading(true);
            
            // Check stock before proceeding to payment
            const filteredForStock = Object.entries(effectiveItemsByOrder).reduce((acc, [oid, data]) => {
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
            if (effectiveTotalWithDelivery === 0) {
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
            // const url = functionsEndpoint('checkAndUpdateStock');
            const url = 'https://us-central1-auth-development-323c3.cloudfunctions.net/checkAndUpdateStock';
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
                                        {selectablePickupSpots.map((spot) => (
                                            <option key={spot} value={spot}>
                                                {spot}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {cartHasAlwaysOnGrocery && (
                                <div className="form-group md:col-span-2 bg-green-50 rounded-lg p-3 border border-green-200">
                                    {isShowingNextDeliveryWeek(availableDeliveryDates) && (
                                        <p className="text-lg font-black text-amber-900 bg-amber-100 border-2 border-amber-400 rounded-lg p-3 mb-3">
                                            שימו לב: אין משלוח השבוע — ההזמנה תישלח בשבוע הבא!
                                        </p>
                                    )}

                                    {deliveryDateError && (
                                        <div className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                                            {deliveryDateError}
                                        </div>
                                    )}

                                    {availableDeliveryDates.length > 0 && (
                                        <>
                                            {availableDeliveryDates.length === 1 ? (
                                                <div className="rounded-lg border border-green-200 bg-white p-4">
                                                    <p className="text-sm font-medium text-green-800 mb-1">תאריך המשלוח</p>
                                                    <p className="text-xl font-black text-green-900">
                                                        {new Date(`${availableDeliveryDates[0]}T00:00:00`).toLocaleDateString('he-IL', {
                                                            weekday: 'long',
                                                            day: '2-digit',
                                                            month: '2-digit',
                                                            year: 'numeric',
                                                        })}
                                                    </p>
                                                    <p className="text-sm text-green-700 mt-2">
                                                        שעות משלוח: 13:00–22:00
                                                    </p>
                                                </div>
                                            ) : (
                                                <>
                                                    <h3 className="text-base font-semibold text-green-900 mb-1">
                                                        תאריך המשלוח
                                                    </h3>
                                                    <p className="text-xs text-green-800 mb-2">
                                                        שעות משלוח: 13:00–22:00
                                                    </p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {availableDeliveryDates.map((dateKey) => {
                                                            const date = new Date(`${dateKey}T00:00:00`);
                                                            const label = date.toLocaleDateString('he-IL', {
                                                                weekday: 'long',
                                                                day: '2-digit',
                                                                month: '2-digit',
                                                            });
                                                            const isSelected = selectedDeliveryDate === dateKey;
                                                            return (
                                                                <button
                                                                    key={dateKey}
                                                                    type="button"
                                                                    onClick={() => setSelectedDeliveryDate(dateKey)}
                                                                    className={`rounded-md border px-3 py-2 text-center text-sm transition-all ${
                                                                        isSelected
                                                                            ? 'border-green-700 bg-green-600 text-white shadow-sm'
                                                                            : 'border-green-200 bg-white text-green-900 hover:border-green-500'
                                                                    }`}
                                                                >
                                                                    <span className="font-semibold">{label}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}

                                    {availableDeliveryDates.length === 0 && (
                                        <p className="text-sm text-green-800">
                                            {deliverySchedule?.communityName || selectedPickupSpot
                                                ? `אין תאריכי משלוח זמינים עבור ${deliverySchedule?.communityName || selectedPickupSpot}`
                                                : 'בחרו קהילה כדי לראות תאריכי משלוח זמינים'}
                                        </p>
                                    )}

                                    {cutoffCartItems.length > 0 && (
                                        <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-800">
                                            <p className="font-semibold mb-1">
                                                הפריטים הבאים עברו את זמן החיתוך לתאריך הזה ולא יהיו חלק מההזמנה:
                                            </p>
                                            <ul className="list-disc list-inside space-y-0.5">
                                                {cutoffCartItems.map((item, index) => (
                                                    <li key={`${item.orderId}-${item.uid || item.id}-${index}`}>
                                                        {item.name || item.productName} ({item.businessName})
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {selectedSpotData && selectedSpotData.options?.includes('homeDelivery') && (
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

                            {reusableCartonAvailable && (
                                <div className="form-group md:col-span-2">
                                    <div className="flex items-center justify-start">
                                        <div className="inline-flex max-w-full flex-wrap items-center rounded-full bg-emerald-50 px-3 py-2">
                                            <input
                                                id="useReusableFarmerCartons"
                                                type="checkbox"
                                                checked={useReusableFarmerCartons}
                                                onChange={(e) => setUseReusableFarmerCartons(e.target.checked)}
                                                className="h-4 w-4 shrink-0 text-emerald-700 focus:ring-emerald-500 border-emerald-300 rounded ml-2"
                                            />
                                            <label htmlFor="useReusableFarmerCartons" className="cursor-pointer text-sm sm:text-base font-bold text-emerald-900">
                                                🌱 אני רוצה קרטון ממוחזר
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setShowReusableCartonInfo(prev => !prev)}
                                                className="mr-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-500 text-xs font-bold text-emerald-700 bg-white hover:bg-emerald-100"
                                                aria-expanded={showReusableCartonInfo}
                                                aria-label="מידע נוסף על קרטונים בשימוש חוזר"
                                            >
                                                i
                                            </button>
                                        </div>
                                    </div>
                                    {showReusableCartonInfo && (
                                        <div className="mx-auto mt-2 max-w-md rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-center text-xs sm:text-sm text-emerald-900">
                                            נשתמש בקרטונים חקלאים שהתוצרת הגיעה איתם מהחקלאים, במידה ויש כדי לחסוך קרטון חדש.
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
                            <span className="text-xl sm:text-3xl font-bold text-purple-700 whitespace-nowrap">{effectiveTotalWithDelivery.toFixed(2)}₪</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 mt-2">
                            <span className="text-sm sm:text-base text-gray-700">מסגרת אשראי (כולל {HOLD_BUFFER_PERCENT}% מרווח):</span>
                            <span className="text-base sm:text-lg font-semibold text-gray-700 whitespace-nowrap">{(effectiveTotalWithDelivery * (1 + HOLD_BUFFER_PERCENT / 100)).toFixed(2)}₪</span>
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
                            {effectiveTotalWithDelivery === 0
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


