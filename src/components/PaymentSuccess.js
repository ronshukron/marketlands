import React, { useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import './PaymentSuccess.css';
import OngoingOrders from './OngoingOrders'; // Import OngoingOrders component

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

    const handleRegister = () => {
        // Break out of iframe and navigate to registration page
        window.top.location.href = '/user-register';
    };

    return (
        <div className="payment-success-container">
            <h1>התשלום בוצע בהצלחה</h1>
            <p>תודה רבה על הזמנתך. פרטי ההזמנה נשמרו במערכת.</p>
            <p>ניתן לעקוב אחרי ההזמנה שלכם אם נרשמים לאתר באותו אימייל שאיתו ביצעתם את התשלום</p>
            <div className="buttons-container">
                <button onClick={handleRegister} className="register-button">הירשם לאתר</button>
            </div>
            {/* Include OngoingOrders component to display active orders */}
            <section className="ongoing-orders-section">
                {/* <h2>הזמנות פעילות</h2> */}
                <OngoingOrders /> {/* Display ongoing orders */}
            </section>
        </div>
    );
};

export default PaymentSuccess;