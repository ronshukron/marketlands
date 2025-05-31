import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from '../firebase/firebase';
import { useCart } from '../contexts/CartContext';
import './PaymentSuccess.css';
import LoadingSpinner from './LoadingSpinner';

const PaymentSuccess = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { clearCart } = useCart();

    useEffect(() => {
        // Clear the cart when component mounts
        clearCart();
        setLoading(false);
    }, [clearCart]);

    const handleBackToHome = () => {
        navigate('/');
    };

    // if (loading) {
    //     return <LoadingSpinner />;
    // }

    if (error) {
        return (
            <div className="payment-success-container">
                <h1>שגיאה בעיבוד התשלום</h1>
                <p>{error}</p>
                <button onClick={handleBackToHome} className="back-home-button">חזור לדף הבית</button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4" dir="rtl">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden text-center p-8">
                    <div className="mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-800 mb-4">תודה רבה!</h1>
                    <p className="text-xl text-gray-700 mb-8">התשלום בוצע בהצלחה</p>
                    <button 
                        onClick={handleBackToHome} 
                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-lg transition-colors duration-200 shadow-md"
                    >
                        חזור לדף הבית
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentSuccess;