import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './PaymentSuccess.css';

const PaymentSuccess = () => {
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
        // without affecting the render of the component
    }, [location]);

    const handleBackToHome = () => {
        navigate('/');
    };

    return (
        <div className="payment-success-container">
            <h1>התשלום בוצע בהצלחה</h1>
            <p>תודה רבה על הזמנתך. פרטי ההזמנה נשמרו במערכת.</p>
            <button onClick={handleBackToHome} className="back-home-button">חזור לדף הבית</button>
        </div>
    );
};

export default PaymentSuccess;