import React from 'react';
import { useNavigate } from 'react-router-dom';

const PaymentCancel = () => {
    const navigate = useNavigate();

    const handleBackToHome = () => {
        navigate('/');
    };

    return (
        <div className="payment-success-container">
            <h1>התשלום בוטל</h1>
            <p>נראה שהתשלום שלך בוטל או לא הושלם. ההזמנה שלך לא נשמרה.</p>
            <button onClick={handleBackToHome} className="back-home-button">חזור לדף הבית</button>
        </div>
    );
};

export default PaymentCancel;
