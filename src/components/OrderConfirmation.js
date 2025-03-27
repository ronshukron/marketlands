import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { doc, updateDoc, getDoc, setDoc, collection } from "firebase/firestore";
import { db } from '../firebase/firebase';
import './OrderConfirmation.css';
import LoadingSpinner from './LoadingSpinner';
import LoadingSpinnerPayment from './LoadingSpinnerPayment';
import Swal from 'sweetalert2';
import { useAuth } from '../contexts/authContext';

const OrderConfirmation = () => {
    const location = useLocation();
    const { cartProducts: initialCartProducts, orderId } = location.state || { cartProducts: [], orderId: '' };
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [cartProducts, setCartProducts] = useState(initialCartProducts);
    const [userName, setUserName] = useState('');
    const [userPhone, setUserPhone] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [paymentUrl, setPaymentUrl] = useState('');
    const [formIsValid, setFormIsValid] = useState(false);
    const [showPopup, setShowPopup] = useState(false);
    const [agreeToTerms, setAgreeToTerms] = useState(false);
    const [userAddress, setUserAddress] = useState(''); 
    const [requestAddress, setRequestAddress] = useState(false); 
    const [orderData, setOrderData] = useState({});
    const [minimumOrderAmount, setMinimumOrderAmount] = useState(0);
    const { userLoggedIn, currentUser } = useAuth();

    useEffect(() => {
        console.log("currentUser", currentUser);
        
        if (userLoggedIn && currentUser) {
            setUserName(currentUser.name || '');
            setUserEmail(currentUser.email || '');
            setUserPhone(currentUser.phoneNumber || '');
        }
    }, [userLoggedIn, currentUser]);

    useEffect(() => {
        // Fetch order data to get if address is requested
        const fetchOrderData = async () => {
            try {
                const orderDocRef = doc(db, "Orders", orderId);
                const orderSnap = await getDoc(orderDocRef);
                if (orderSnap.exists()) {
                    const orderInfo = orderSnap.data();
                    setOrderData(orderInfo);
                    setRequestAddress(orderInfo.requestAddress || false);
                    setMinimumOrderAmount(orderInfo.minimumOrderAmount || 0);
                } else {
                    console.log("Order does not exist!");
                    navigate('/error');
                }
            } catch (error) {
                console.error("Error fetching order data:", error);
                navigate('/error');
            }
        };
        fetchOrderData();
    }, [orderId, navigate]);

    useEffect(() => {
        const isValid = userName.trim() !== '' && 
                        userPhone.trim() !== '' && 
                        userEmail.trim() !== '' &&
                        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail) &&
                        (!requestAddress || userAddress.trim() !== ''); 
        setFormIsValid(isValid);
    }, [userName, userPhone, userEmail, userAddress, requestAddress]);

    const total = cartProducts.reduce((acc, item) => acc + item.quantity * item.price, 0);

    const handleSubmitOrder = async () => {
        if (!formIsValid) {
            setShowPopup(true);
            return;
        }

        if (!agreeToTerms) {
            alert('יש לאשר את תנאי השימוש לפני ביצוע ההזמנה');
            return;
        }

        // Check minimum order amount
        if (total < minimumOrderAmount) {
            Swal.fire({
                icon: 'error',
                title: 'סכום מינימום להזמנה',
                text: `סכום ההזמנה המינימלי הוא ${minimumOrderAmount}₪. סכום ההזמנה הנוכחי הוא ${total}₪`,
                confirmButtonText: 'הבנתי'
            });
            return;
        }

        const orderHasEnded = await checkIfOrderEnded();
        if (orderHasEnded) {
            Swal.fire({
                icon: 'error',
                title: 'ההזמנה הסתיימה',
                text: 'צר לנו, אבל זמן ההזמנה הזו כבר הסתיימה.',
                confirmButtonText: 'אישור',
            }).then(() => {
                navigate(`/order-form-business/${orderId}`);
            });
            return;
        }
    
        setLoading(true);
        const tempOrderId = `temp_${new Date().getTime()}`; // Generate a temporary ID
        const tempOrderRef = doc(collection(db, "pendingOrders"), tempOrderId);
        
        let newMemberData = {
            Name: userName,
            Email: userEmail,
            Phone: userPhone,
            Address: userAddress, 
            Mem_Order_Time: new Date().getTime(),
            OrderValue: cartProducts.reduce((total, product) => total + (product.quantity * product.price), 0)
        };

        cartProducts.forEach(product => {
            if (product.quantity > 0) {
                newMemberData[product.uid] = {
                    Name: product.name,
                    Quantity: product.quantity,
                    Price: product.price,
                    Option: product.selectedOption || "None"
                };
            }
        });

        try {
            // Create temporary order document
            await setDoc(tempOrderRef, {
                ...newMemberData,
                status: 'pending_payment',
                createdAt: new Date().toISOString(),
                orderId: orderId // Include the orderId from the Orders collection
            });
    
            // Call to create Bit payment
            const paymentData = {
                amount: newMemberData.OrderValue,
                userName,
                userPhone,
                userEmail,
                successUrl: `${window.location.origin}/payment-success/`,
                cancelUrl: `${window.location.origin}/payment-cancel/`,
                description: `תשלום עבור תוצרת חקלאית`,
                tempOrderId, // Include the temporary order ID
                orderId // Include the orderId from the Orders collection
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
        navigate(`/order-form-business/${orderId}`);
    };

    const checkIfOrderEnded = async () => {
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

    const handleQuantityChange = (index, increment) => {
        setCartProducts(cartProducts.map((product, i) => {
            if (i === index) {
                return { ...product, quantity: increment ? product.quantity + 1 : Math.max(product.quantity - 1, 0) };
            }
            return product;
        }));
    };

    return (
        <div className="bg-gray-50 min-h-screen py-8 px-4" dir="rtl">
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
                <div className="bg-blue-600 text-white px-6 py-4">
                    <h1 className="text-2xl font-bold">סיכום הזמנה</h1>
                </div>
                
                <div className="p-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">פריטים בהזמנה</h2>
                    
                    <div className="mb-6 rounded-lg border border-gray-200 overflow-hidden">
                        <ul className="divide-y divide-gray-200">
                            {cartProducts.map((item, index) => (
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
                                        <div className="flex items-center space-x-1 rtl:space-x-reverse">
                                            <button 
                                                onClick={() => handleQuantityChange(index, false)}
                                                className="bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full w-8 h-8 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >-</button>
                                            <span className="w-8 text-center">{item.quantity}</span>
                                            <button 
                                                onClick={() => handleQuantityChange(index, true)}
                                                className="bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full w-8 h-8 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >+</button>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                    
                    <div className="bg-gray-50 p-4 rounded-lg mb-6">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-lg font-semibold">סה"כ:</span>
                            <span className="text-lg font-bold text-blue-600">{total.toFixed(2)}₪</span>
                        </div>
                        
                        {minimumOrderAmount > 0 && (
                            <p className={`text-sm ${total < minimumOrderAmount ? 'text-red-600' : 'text-blue-600'}`}>
                                {total < minimumOrderAmount 
                                    ? `סכום מינימום להזמנה: ${minimumOrderAmount}₪ (חסרים ${(minimumOrderAmount - total).toFixed(2)}₪)`
                                    : `✓ עברת את סכום המינימום להזמנה (${minimumOrderAmount}₪)`
                                }
                            </p>
                        )}
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
                                onClick={handleSubmitOrder}
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
