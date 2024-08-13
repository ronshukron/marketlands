import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from '../firebase/firebase';
import './OrderConfirmation.css';

const OrderConfirmation = () => {
    const location = useLocation();
    const { cartProducts: initialCartProducts, userName, orderId } = location.state || { cartProducts: [], userName: '', orderId: '' };
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [cartProducts, setCartProducts] = useState(initialCartProducts);

    const total = cartProducts.reduce((acc, item) => acc + item.quantity * item.price, 0);

    const handleSubmitOrder = async () => {
        setLoading(true);
        const orderDocRef = doc(db, "Orders", orderId);
        let newMemberData = {};
        const memberKey = `Member_${new Date().getTime()}`;
        newMemberData[`${memberKey}.Name`] = userName;
        let totalOrderValue = 0;

        cartProducts.forEach(product => {
            const quantity = product.quantity;
            if (quantity > 0) {
                // Use the unique identifier to differentiate between similar products
                newMemberData[`${memberKey}.${product.uid}`] = {
                    Name: product.name,
                    Quantity: product.quantity,
                    Price: product.price,
                    Option: product.selectedOption || "None"
                };
                totalOrderValue += quantity * product.price;
            }
        });

        try {
            const orderDocSnap = await getDoc(orderDocRef);
            const currentTotalAmount = orderDocSnap.exists() ? (orderDocSnap.data().Total_Amount || 0) : 0;
            const updatedTotalAmount = currentTotalAmount + totalOrderValue;

            await updateDoc(orderDocRef, {
                ...newMemberData,
                Total_Amount: updatedTotalAmount
            });

            console.log('Order updated successfully');
            navigate('/order-confirmation-success', { state: { cartProducts, userName, orderId, memberKey } });
        } catch (error) {
            console.error("Failed to update order:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        navigate(`/order-form/${orderId}`);
    };

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
            <div className="button-container">
                <button onClick={handleCancel} className="cancel-button">בטל הזמנה</button>
                <button onClick={handleSubmitOrder} disabled={loading} className="submit-button">
                    {loading ? 'מעבד הזמנה...' : 'שלח הזמנה'}
                </button>
            </div>
        </div>
    );
};

export default OrderConfirmation;
