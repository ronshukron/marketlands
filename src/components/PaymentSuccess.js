import React, { useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import './PaymentSuccess.css';

const PaymentSuccess = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();

    useEffect(() => {
        // Function to parse the URL parameters
        const parseParams = (paramString) => {
            const pairs = paramString.split('&');
            const result = {};
            pairs.forEach(pair => {
                const [key, value] = pair.split('=');
                if (key) {
                    result[key] = decodeURIComponent(value || '');
                }
            });
            return result;
        };

        // Parse parameters from either location.search or params.rest
        const queryParams = location.search
            ? parseParams(location.search.slice(1))
            : parseParams(params.rest || '');

        const response = queryParams.response;
        const cField1 = queryParams.cField1;
        const cField2 = queryParams.cField2;

        console.log('Payment response:', response);
        console.log('Custom Field 1:', cField1);
        console.log('Custom Field 2:', cField2);

        // You can perform any necessary actions with these parameters here
    }, [location, params]);

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