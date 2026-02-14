import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { doc, updateDoc, getDoc, setDoc, collection, addDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db } from '../firebase/firebase';
import './OrderConfirmation.css';
import LoadingSpinner from './LoadingSpinner';
import LoadingSpinnerPayment from './LoadingSpinnerPayment';
import Swal from 'sweetalert2';
import { useAuth } from '../contexts/authContext';
import { useCart } from '../contexts/CartContext';
import { cityToRegion, getRegionByCity } from '../utils/israelRegions';
import { getEstimatedChargeableQuantity, getEstimatedLineTotal } from '../utils/pricing';

const OrderConfirmationMerchant = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { itemsByOrder, cartTotal, clearCart, removeOrderFromCart, cartItems } = useCart();
    
    const [loading, setLoading] = useState(false);
    const [userName, setUserName] = useState(() => {
        return localStorage.getItem('orderUserName') || '';
    });
    const [userPhone, setUserPhone] = useState(() => {
        return localStorage.getItem('orderUserPhone') || '';
    });
    const [userEmail, setUserEmail] = useState('');
    const [formIsValid, setFormIsValid] = useState(false);
    const [agreeToTerms, setAgreeToTerms] = useState(false);
    const [userAddress, setUserAddress] = useState('');
    const [userDirections, setUserDirections] = useState('');
    
    // Merchant-specific state
    const [selectedCity, setSelectedCity] = useState('');
    const [selectedRegion, setSelectedRegion] = useState(''); // From cart items
    const [cityValidationError, setCityValidationError] = useState('');
    const [citySearchTerm, setCitySearchTerm] = useState('');
    const [showCitySuggestions, setShowCitySuggestions] = useState(false);
    
    const { userLoggedIn, currentUser } = useAuth();
    const [totalWithDelivery, setTotalWithDelivery] = useState(cartTotal);

    // Extract selectedRegion from cart on mount
    useEffect(() => {
        const merchantItems = Object.values(itemsByOrder).flatMap(order => order.items);
        const firstMerchantItem = merchantItems.find(item => item.isMerchantOrder);
        if (firstMerchantItem && firstMerchantItem.selectedRegion) {
            setSelectedRegion(firstMerchantItem.selectedRegion);
        }
    }, [itemsByOrder]);

    useEffect(() => {
        if (userLoggedIn && currentUser) {
            if (!localStorage.getItem('orderUserName')) {
                setUserName(currentUser.name || '');
            }
            setUserEmail(currentUser.email || '');
            if (!localStorage.getItem('orderUserPhone')) {
                setUserPhone(currentUser.phoneNumber || '');
            }
        }
    }, [userLoggedIn, currentUser]);

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
        setTotalWithDelivery(cartTotal);
    }, [cartTotal]);

    // Close city suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            const cityInput = document.getElementById('merchantCity');
            const suggestionBox = document.getElementById('citySuggestions');
            
            if (showCitySuggestions && 
                cityInput && 
                suggestionBox &&
                !cityInput.contains(event.target) && 
                !suggestionBox.contains(event.target)) {
                setShowCitySuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showCitySuggestions]);

    const validateMerchantCity = (city) => {
        if (!city) {
            setCityValidationError('נא לבחור עיר');
            return false;
        }
        
        // Get the region for the selected city
        const cityRegion = getRegionByCity(city);
        
        if (!cityRegion) {
            setCityValidationError('העיר לא נמצאה במערכת. אנא פנה לתמיכה.');
            return false;
        }
        
        // Check if city's region matches the selected region from cart
        if (cityRegion !== selectedRegion) {
            setCityValidationError(`העיר ${city} נמצאת באזור ${cityRegion} ולא באזור ${selectedRegion} שנבחר`);
            return false;
        }
        
        // Validate against each order's serviceRegions
        const incompatibleOrders = [];
        Object.entries(itemsByOrder).forEach(([orderId, orderData]) => {
            // Fetch order's serviceRegions from cart metadata
            const orderServiceRegions = orderData.items[0]?.serviceRegions || [];
            if (orderServiceRegions.length > 0 && !orderServiceRegions.includes(cityRegion)) {
                incompatibleOrders.push(orderData.items[0]?.businessName || 'Unknown Business');
            }
        });
        
        if (incompatibleOrders.length > 0) {
            setCityValidationError(
                `העסקים הבאים לא משלחים לאזור ${cityRegion}: ${incompatibleOrders.join(', ')}`
            );
            return false;
        }
        
        setCityValidationError('');
        return true;
    };

    useEffect(() => {
        const isValid = userName.trim() !== '' && 
                        userPhone.trim() !== '' && 
                        userEmail.trim() !== '' &&
                        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail) &&
                        selectedCity !== '' &&
                        userAddress.trim() !== '' &&
                        !cityValidationError;
        setFormIsValid(isValid);
    }, [userName, userPhone, userEmail, selectedCity, userAddress, cityValidationError]);

    const handleSubmitOrder = async () => {
        if (!formIsValid) {
            Swal.fire({
                icon: 'error',
                title: 'פרטים חסרים',
                text: 'אנא מלא את כל השדות הנדרשים',
                confirmButtonText: 'הבנתי'
            });
            return;
        }

        if (!agreeToTerms) {
            Swal.fire({
                icon: 'warning',
                title: 'אישור תנאי שימוש',
                text: 'יש לאשר את תנאי השימוש לפני ביצוע ההזמנה',
                confirmButtonText: 'הבנתי'
            });
            return;
        }

        if (!validateMerchantCity(selectedCity)) {
            return;
        }

        // Validate merchant minimum for each order
        const failedMinimums = [];
        Object.entries(itemsByOrder).forEach(([orderId, orderData]) => {
            const merchantMin = orderData.items[0]?.merchantMinOrderTotal || 0;
            if (merchantMin > 0 && orderData.total < merchantMin) {
                const businessName = orderData.items[0]?.businessName || 'Unknown';
                failedMinimums.push(`${businessName}: נדרש ₪${merchantMin}, סכום נוכחי ₪${orderData.total.toFixed(2)}`);
            }
        });

        if (failedMinimums.length > 0) {
            Swal.fire({
                icon: 'warning',
                title: 'לא הגעת למינימום הנדרש',
                html: '<div style="text-align: right;">' + failedMinimums.join('<br>') + '</div>',
                confirmButtonText: 'הבנתי'
            });
            return;
        }

        setLoading(true);
        const customerOrderId = `temp_${new Date().getTime()}`;
        const customerOrderIdOrderRef = doc(collection(db, "customerOrders"), customerOrderId);
        
        const orderBreakdown = {};
        const businessIds = [];
        
        Object.entries(itemsByOrder).forEach(([orderId, orderData]) => {
            const orderItems = [];
            
            orderData.items.forEach(item => {
                if (item.quantity > 0) {
                    orderItems.push({
                        productId: item.id,
                        productName: item.name,
                        quantity: item.quantity,
                        estimatedChargeQuantity: getEstimatedChargeableQuantity(item),
                        estimatedLineTotal: getEstimatedLineTotal(item),
                        price: item.price,
                        selectedOption: item.selectedOption || "None",
                        catalogNumber: item.catalogNumber || '',
                        vatType: item.vatType ?? 3,
                        measurementType: item.measurementType || 'kg',
                        unitSize: item.unitSize || 1,
                        averageWeightKg: item.averageWeightKg || 1
                    });
                }
            });
            
            businessIds.push(orderData.businessId);
            const businessName = orderData.items[0]?.businessName || "Unknown Business";
            
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
                city: selectedCity,
                address: userAddress,
                directions: userDirections,
                deliveryRegion: selectedRegion,
                deliveryType: 'merchant'
            },
            businessIds: businessIds,
            createdAt: new Date().toISOString(),
            paymentStatus: 'pending_payment',
            grandTotal: totalWithDelivery,
            userId: currentUser?.uid || null,
            isMerchantOrder: true
        });

        // Update orders with reference
        try {
            const updatePromises = Object.keys(itemsByOrder).map(async (orderId) => {
                try {
                    const orderRef = doc(db, "IndependentOrders", orderId);
                    await updateDoc(orderRef, {
                        customerOrderIds: arrayUnion(customerOrderId)
                    });
                } catch (orderError) {
                    console.error(`Error updating order ${orderId}:`, orderError);
                }
            });
            await Promise.all(updatePromises);
        } catch (error) {
            console.error("Error updating orders with customer order reference:", error);
        }

        // Add order to user document
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

        const orderIds = Object.keys(itemsByOrder);

        try {
            const paymentData = {
                amount: totalWithDelivery,
                userName,
                userPhone,
                userEmail,
                successUrl: `${window.location.origin}/payment-success/`,
                cancelUrl: `${window.location.origin}/payment-cancel/`,
                description: `תשלום עבור הזמנת סוחר`,
                customerOrderId,
                orderIds: orderIds,
            };

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

            const paymentResponse = await axios.post('https://us-central1-auth-development-323c3.cloudfunctions.net/createBitPayment', paymentData, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (paymentResponse.data.paymentLink) {
                window.location.href = paymentResponse.data.paymentLink;
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

    if (loading) {
        return <LoadingSpinnerPayment />;
    }

    const allCartItems = Object.values(itemsByOrder).flatMap(orderData => 
        orderData.items.map(item => ({
            ...item,
            businessName: orderData.businessName || "Unknown Business"
        }))
    );

    // Filter cities based on search term
    const filteredCities = Object.keys(cityToRegion)
        .filter(city => city.includes(citySearchTerm))
        .sort()
        .slice(0, 50); // Limit to 50 results for performance

    const handleCitySelect = (city) => {
        setSelectedCity(city);
        setCitySearchTerm(city);
        setShowCitySuggestions(false);
        validateMerchantCity(city);
    };

    return (
        <div className="bg-gray-50 min-h-screen py-8 px-4" dir="rtl">
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
                <div className="bg-green-600 text-white px-6 py-4">
                    <h1 className="text-2xl font-bold">השלמת הזמנת סוחר</h1>
                </div>
                
                <div className="p-6">
                    {/* User Details Form */}
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
                                    className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${userLoggedIn ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                />
                                {userLoggedIn && (
                                    <p className="mt-1 text-sm text-gray-500">
                                        כתובת האימייל מקושרת לחשבון שלך ואינה ניתנת לשינוי
                                    </p>
                                )}
                            </div>

                            {/* Merchant Region Display (Read-only) */}
                            <div className="form-group md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    אזור משלוח
                                </label>
                                <input
                                    type="text"
                                    value={selectedRegion}
                                    readOnly
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                                />
                                <p className="text-xs text-gray-500 mt-1">האזור שנבחר בעת הוספת הפריטים לסל</p>
                            </div>

                            {/* City Selection with Autocomplete Search */}
                            <div className="form-group md:col-span-2 relative">
                                <label htmlFor="merchantCity" className="block text-sm font-medium text-gray-700 mb-1">
                                    עיר/יישוב <span className="text-red-500">*</span>
                                </label>
                                <input
                                    id="merchantCity"
                                    type="text"
                                    value={citySearchTerm}
                                    onChange={(e) => {
                                        setCitySearchTerm(e.target.value);
                                        setShowCitySuggestions(true);
                                        if (e.target.value === '') {
                                            setSelectedCity('');
                                            setCityValidationError('');
                                        }
                                    }}
                                    onFocus={() => setShowCitySuggestions(true)}
                                    placeholder="התחל להקליד את שם העיר..."
                                    className={`w-full px-3 py-2 border ${cityValidationError ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500`}
                                    required
                                    autoComplete="off"
                                />
                                
                                {/* Suggestions Dropdown */}
                                {showCitySuggestions && citySearchTerm && filteredCities.length > 0 && (
                                    <div 
                                        id="citySuggestions"
                                        className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
                                    >
                                        {filteredCities.map((city) => (
                                            <button
                                                key={city}
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleCitySelect(city);
                                                }}
                                                className="w-full text-right px-3 py-2 hover:bg-green-50 focus:bg-green-50 focus:outline-none text-gray-800 border-b border-gray-100 last:border-b-0"
                                            >
                                                <span className="font-medium">{city}</span>
                                                <span className="text-xs text-gray-500 mr-2">({getRegionByCity(city)})</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                
                                {cityValidationError && (
                                    <p className="text-red-500 text-sm mt-1">{cityValidationError}</p>
                                )}
                                <p className="text-xs text-gray-500 mt-1">חפש את העיר או היישוב שלך ובחר מהרשימה</p>
                            </div>

                            {/* Always show address fields for merchants */}
                            <div className="form-group md:col-span-2">
                                <label htmlFor="merchantAddress" className="block text-sm font-medium text-gray-700 mb-1">
                                    כתובת מלאה <span className="text-red-500">*</span>
                                </label>
                                <input
                                    id="merchantAddress"
                                    type="text"
                                    placeholder="רחוב, מספר בית"
                                    value={userAddress} 
                                    onChange={(e) => setUserAddress(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                />
                            </div>

                            <div className="form-group md:col-span-2">
                                <label htmlFor="merchantDirections" className="block text-sm font-medium text-gray-700 mb-1">
                                    הנחיות למשלוח (אופציונלי)
                                </label>
                                <textarea
                                    id="merchantDirections"
                                    placeholder="הנחיות נוספות למשלוח - קומה, דירה, שעות קבלה וכו'"
                                    value={userDirections}
                                    onChange={(e) => setUserDirections(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Order Total */}
                    <div className="mb-6 bg-gradient-to-r from-green-50 to-green-100 p-4 sm:p-6 rounded-lg border-2 border-green-200">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-lg sm:text-2xl font-bold text-gray-900">סה"כ לתשלום:</span>
                            <span className="text-xl sm:text-3xl font-bold text-green-600 whitespace-nowrap">{totalWithDelivery.toFixed(2)}₪</span>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600 mt-2">
                            {Object.keys(itemsByOrder).length} הזמנות • {Object.values(itemsByOrder).reduce((total, order) => total + order.items.length, 0)} פריטים
                        </p>
                    </div>

                    {/* Minimum Order Warnings */}
                    {(() => {
                        const belowMinimumOrders = Object.entries(itemsByOrder)
                            .filter(([orderId, orderData]) => {
                                const merchantMin = orderData.items[0]?.merchantMinOrderTotal || 0;
                                return merchantMin > 0 && orderData.total < merchantMin;
                            })
                            .map(([orderId, orderData]) => ({
                                businessName: orderData.items[0]?.businessName || 'Unknown',
                                current: orderData.total,
                                minimum: orderData.items[0]?.merchantMinOrderTotal || 0,
                                missing: (orderData.items[0]?.merchantMinOrderTotal || 0) - orderData.total
                            }));

                        if (belowMinimumOrders.length > 0) {
                            return (
                                <div className="mb-6 bg-red-50 border-2 border-red-300 rounded-lg p-4">
                                    <div className="flex items-start gap-2 mb-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <div className="flex-1">
                                            <h3 className="text-lg font-bold text-red-800 mb-2">לא הגעת למינימום הנדרש</h3>
                                            <p className="text-sm text-red-700 mb-3">עליך להוסיף עוד פריטים מהעסקים הבאים:</p>
                                            <div className="space-y-2">
                                                {belowMinimumOrders.map((order, index) => (
                                                    <div key={index} className="bg-white rounded-md p-3 border border-red-200">
                                                        <p className="font-semibold text-red-900">{order.businessName}</p>
                                                        <p className="text-sm text-red-700 mt-1">
                                                            סכום נוכחי: ₪{order.current.toFixed(2)} | 
                                                            מינימום נדרש: ₪{order.minimum.toFixed(0)} | 
                                                            <span className="font-bold"> חסרים: ₪{order.missing.toFixed(2)}</span>
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}

                    {/* Terms and Buy Button */}
                    <div className="mb-6 space-y-4">
                        <div className="flex items-center justify-center">
                            <input
                                type="checkbox" 
                                id="agreeToTerms" 
                                checked={agreeToTerms}
                                onChange={(e) => setAgreeToTerms(e.target.checked)}
                                className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded ml-2"
                            />
                            <label htmlFor="agreeToTerms" className="text-sm text-gray-700">
                                קראתי ואני מסכים ל<Link to="/terms-of-service" target="_blank" className="text-green-600 hover:underline font-medium">תנאי השימוש</Link>
                            </label>
                        </div>

                        <button
                            onClick={handleSubmitOrder}
                            disabled={!agreeToTerms || !formIsValid}
                            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-lg text-base sm:text-lg transition-colors duration-200 focus:outline-none focus:ring-4 focus:ring-green-300 shadow-lg"
                        >
                            לתשלום - {totalWithDelivery.toFixed(2)}₪
                        </button>

                        <button
                            onClick={handleCancel}
                            className="w-full bg-white hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg border-2 border-gray-300 transition-colors duration-200"
                        >
                            חזור לעגלה
                        </button>
                    </div>

                    {/* Compact Order Details */}
                    <div className="border-t-2 border-gray-200 pt-6">
                        <details className="group">
                            <summary className="cursor-pointer list-none flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                                <span className="text-lg font-semibold text-gray-800">פירוט ההזמנה</span>
                                <svg className="w-5 h-5 text-gray-600 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </summary>
                            
                            <div className="mt-4 space-y-4">
                                {Object.entries(itemsByOrder).map(([orderId, orderData]) => {
                                    const merchantMin = orderData.items[0]?.merchantMinOrderTotal || 0;
                                    const isBelowMinimum = merchantMin > 0 && orderData.total < merchantMin;
                                    
                                    return (
                                        <div key={orderId} className={`bg-white border ${isBelowMinimum ? 'border-red-300' : 'border-gray-200'} rounded-lg overflow-hidden`}>
                                            <div className={`${isBelowMinimum ? 'bg-red-50' : 'bg-gray-50'} px-4 py-2 border-b ${isBelowMinimum ? 'border-red-200' : 'border-gray-200'} flex justify-between items-center`}>
                                                <div className="flex-1">
                                                    <h3 className="font-semibold text-gray-800">{orderData.items[0]?.businessName || "Unknown Business"}</h3>
                                                    {isBelowMinimum && (
                                                        <p className="text-xs text-red-600 mt-1">
                                                            ⚠️ מינימום נדרש: ₪{merchantMin} (חסרים ₪{(merchantMin - orderData.total).toFixed(2)})
                                                        </p>
                                                    )}
                                                </div>
                                                <span className={`text-sm font-medium ${isBelowMinimum ? 'text-red-600' : 'text-green-600'}`}>{orderData.total.toFixed(2)}₪</span>
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
                                    </div>
                                    );
                                })}
                            </div>
                        </details>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderConfirmationMerchant;

