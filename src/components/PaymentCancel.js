import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './PaymentSuccess.css';

const PaymentCancel = () => {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Parse and log query parameters if needed
        const queryParams = new URLSearchParams(location.search);
        const response = queryParams.get('response');
        const cField1 = queryParams.get('cField1');
        const cField2 = queryParams.get('cField2');
        
        console.log('Payment response:', response);
        console.log('Custom Field 1:', cField1);
        console.log('Custom Field 2:', cField2);
        
        // You can perform any necessary actions with these parameters here
    }, [location]);

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