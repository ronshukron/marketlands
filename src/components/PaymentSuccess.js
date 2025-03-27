import React, { useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import './PaymentSuccess.css';
import OngoingOrders from './OngoingOrders'; // Import OngoingOrders component
import { useAuth } from '../contexts/authContext';

const PaymentSuccess = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();
    const { userLoggedIn } = useAuth();

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
        <div className="min-h-screen bg-gray-50 py-12 px-4" dir="rtl">
            <div className="max-w-3xl mx-auto mb-12">
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                    <div className="bg-blue-600 p-6 flex flex-col items-center">
                        <div className="bg-white rounded-full p-3 mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h1 className="text-3xl font-bold text-white text-center">התשלום בוצע בהצלחה!</h1>
                    </div>
                    
                    <div className="p-8 text-center">
                        <p className="text-xl text-gray-700 mb-6">
                            תודה רבה על הזמנתך. פרטי ההזמנה נשמרו במערכת.
                        </p>

                        {!userLoggedIn && (
                            <>
                                <p className="text-gray-600 mb-8">
                                    ניתן לעקוב אחרי ההזמנה שלכם אם נרשמים לאתר באותו אימייל שאיתו ביצעתם את התשלום
                                </p>
                                <button 
                                    onClick={handleRegister} 
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-lg transition-colors duration-200 shadow-md"
                                >
                                    הירשם לאתר
                                </button>
                            </>
                        )}
                        
                        <button 
                            onClick={handleBackToHome} 
                            className="mt-6 inline-block px-6 py-2 border border-blue-600  rounded-md hover:bg-blue-50 transition-colors duration-200"
                        >
                            חזרה לדף הבית
                        </button>
                    </div>
                </div>
            </div>
            
            <div className="max-w-6xl mx-auto">
                <div className="bg-white rounded-xl shadow-md overflow-hidden p-6 mb-4">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6">הזמנות פעילות נוספות</h2>
                    <OngoingOrders />
                </div>
            </div>
        </div>
    );
};

export default PaymentSuccess;