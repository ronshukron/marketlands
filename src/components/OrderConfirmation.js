import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { doc, updateDoc, getDoc, setDoc, collection } from "firebase/firestore";
import { db } from '../firebase/firebase';
import './OrderConfirmation.css';
import LoadingSpinner from './LoadingSpinner';
import LoadingSpinnerPayment from './LoadingSpinnerPayment';
import Swal from 'sweetalert2';

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


    useEffect(() => {
        const isValid = userName.trim() !== '' && 
                        userPhone.trim() !== '' && 
                        userEmail.trim() !== '' &&
                        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);
        setFormIsValid(isValid);
    }, [userName, userPhone, userEmail]);

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
        navigate(`/order-form/${orderId}`);
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
        <div className="confirmation-container">
            <h1>תודה לך על ההזמנה</h1>
            <h2>פרטי ההזמנה</h2>
            <ul>
                {cartProducts.map((item, index) => (
                    <li key={index}>
                        {item.name} - {item.quantity} x {item.price}₪ = {item.quantity * item.price}₪
                        <br />
                        <strong>אופציה:</strong> {item.selectedOption}
                        <div className="quantity-controls">
                            <button onClick={() => handleQuantityChange(index, false)}>-</button>
                            <span>{item.quantity}</span>
                            <button onClick={() => handleQuantityChange(index, true)}>+</button>
                        </div>
                    </li>
                ))}
            </ul>
            <h3>סה"כ: {total.toFixed(2)}₪</h3>
            
            <div className="user-details-container">
                <h3>פרטי תשלום</h3>
                <div className="user-details">
                    <div className={`input-group ${userName.trim() === '' ? 'invalid' : ''}`}>
                        <label htmlFor="userName">שם מלא</label>
                        <input 
                            id="userName"
                            type="text" 
                            placeholder="שם מלא" 
                            value={userName} 
                            onChange={(e) => setUserName(e.target.value)} 
                            required
                        />
                    </div>
                    <div className={`input-group ${userPhone.trim() === '' ? 'invalid' : ''}`}>
                        <label htmlFor="userPhone">מספר טלפון</label>
                        <input 
                            id="userPhone"
                            type="tel" 
                            placeholder="מספר טלפון" 
                            value={userPhone} 
                            onChange={(e) => setUserPhone(e.target.value)} 
                            required
                        />
                    </div>
                    <div className={`input-group ${userEmail.trim() === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail) ? 'invalid' : ''}`}>
                        <label htmlFor="userEmail">כתובת אימייל</label>
                        <input 
                            id="userEmail"
                            type="email" 
                            placeholder="כתובת אימייל" 
                            value={userEmail} 
                            onChange={(e) => setUserEmail(e.target.value)} 
                            required
                        />
                    </div>
                </div>
            </div>

            <div className="terms-agreement">
                <label htmlFor="agreeToTerms">
                    קראתי ואני מסכים ל<Link to="/terms-of-service" target="_blank">-תנאי השימוש</Link>
                </label>
                <input className='terms-checkbox'
                    type="checkbox" 
                    id="agreeToTerms" 
                    checked={agreeToTerms}
                    onChange={(e) => setAgreeToTerms(e.target.checked)}
                />

            </div>

            <div className="button-container">
                <button onClick={handleCancel} className="cancel-button">ביטול</button>
                <button onClick={handleSubmitOrder} className="sub-button">עבור לדף תשלום</button>

                {/* <button onClick={handleSubmitOrder} className="submit-button"></button> */}
            </div>

            {/* {paymentUrl && (                                  // for iframe
                <div className="payment-iframe-container">
                    <iframe 
                        src={paymentUrl} 
                        width="100%" 
                        height="600px" 
                        title="Bit Payment"
                    />
                </div>
            )} */}

            {showPopup && (
                <div className="popup">
                    <div className="popup-content">
                        <h3>נא למלא את כל השדות</h3>
                        <button onClick={() => setShowPopup(false)}>אישור</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrderConfirmation;
