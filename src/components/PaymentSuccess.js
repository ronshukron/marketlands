import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useCart } from '../contexts/CartContext';
import { confirmDelayedPayment } from '../services/delayedPaymentGatewayService';
import { parseGrowReturnParams, resolveReturnedCustomerOrderId } from '../utils/growReturnParams';
import {
  isFirestorePermissionError,
  resolveDelayedPaymentSuccessView,
} from '../utils/delayedPaymentConfirm';
import './PaymentSuccess.css';
import LoadingSpinner from './LoadingSpinner';

const readDelayedOrder = async (orderId) => {
  if (!orderId) return { exists: false, data: null, readable: false };
  try {
    const snap = await getDoc(doc(db, 'customerOrdersDelayed', orderId));
    return { exists: snap.exists(), data: snap.exists() ? snap.data() : null, readable: true };
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      return { exists: false, data: null, readable: false };
    }
    throw error;
  }
};

export const PaymentSuccessStatusView = ({ view, onBackToHome }) => {
  if (view.kind === 'error') {
    return (
      <div className="payment-success-container">
        <h1>שגיאה בעיבוד התשלום</h1>
        <p>{view.message}</p>
        <button onClick={onBackToHome} className="back-home-button">חזור לדף הבית</button>
      </div>
    );
  }

  if (view.kind === 'abandoned') {
    const growApproved = view.growResponse === 'success';
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4" dir="rtl">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden text-center p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">התשלום התקבל, ההזמנה לא אושרה במערכת</h1>
            <p className="text-lg text-gray-700 mb-4">
              {growApproved
                ? 'Grow אישר את העסקה, אבל ההזמנה סומנה נטושה כי לא הגיע אישור לשרת. אל תשלמו שוב.'
                : 'ההזמנה סומנה כנטושה. אל תשלמו שוב.'}
            </p>
            {view.orderId ? (
              <p className="text-sm text-gray-500 mb-8">מספר הזמנה: {view.orderId}</p>
            ) : null}
            <button
              onClick={onBackToHome}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-lg transition-colors duration-200 shadow-md"
            >
              חזור לדף הבית
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view.kind === 'not_paid') {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4" dir="rtl">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden text-center p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">התשלום לא הושלם</h1>
            <p className="text-lg text-gray-700 mb-4">
              התשלום לא הושלם. העגלה נשמרה.
            </p>
            {view.orderId ? (
              <p className="text-sm text-gray-500 mb-8">מספר הזמנה: {view.orderId}</p>
            ) : null}
            <button
              onClick={onBackToHome}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-lg transition-colors duration-200 shadow-md"
            >
              חזור לדף הבית
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view.kind === 'unrecoverable') {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4" dir="rtl">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden text-center p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">נדרשת פנייה לתמיכה</h1>
            <p className="text-lg text-gray-700 mb-4">
              לא ניתן לאשר את התשלום אוטומטית. פנו לתמיכה ואל תשלמו שוב.
            </p>
            {view.orderId ? (
              <p className="text-sm text-gray-500 mb-8">מספר הזמנה: {view.orderId}</p>
            ) : null}
            <button
              onClick={onBackToHome}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-lg transition-colors duration-200 shadow-md"
            >
              חזור לדף הבית
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view.kind === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4" dir="rtl">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden text-center p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">מאשרים את התשלום</h1>
            <p className="text-lg text-gray-700 mb-4">
              חזרתם מ-Grow בהצלחה. ההזמנה עדיין ממתינה לאישור בשרת. אין צורך לשלם שוב.
            </p>
            {view.orderId ? (
              <p className="text-sm text-gray-500 mb-8">מספר הזמנה: {view.orderId}</p>
            ) : null}
            <button
              onClick={onBackToHome}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-lg transition-colors duration-200 shadow-md"
            >
              חזור לדף הבית
            </button>
          </div>
        </div>
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
            onClick={onBackToHome}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-lg transition-colors duration-200 shadow-md"
          >
            חזור לדף הבית
          </button>
        </div>
      </div>
    </div>
  );
};

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearCart } = useCart();
  const [view, setView] = useState({ kind: 'loading', orderId: null });

  useEffect(() => {
    let cancelled = false;
    const params = parseGrowReturnParams(location);
    const orderId = resolveReturnedCustomerOrderId(location);
    const growResponse = String(params.get('response') || '').toLowerCase();

    const run = async () => {
      const next = await resolveDelayedPaymentSuccessView({
        orderId,
        growResponse,
        readDelayedOrder,
        confirmDelayedPaymentFn: confirmDelayedPayment,
        isCancelled: () => cancelled,
      });
      if (cancelled || !next) return;
      if (next.kind === 'success') clearCart();
      setView(next);
    };

    run().catch((error) => {
      if (cancelled) return;
      if (isFirestorePermissionError(error) && orderId) {
        setView({ kind: 'pending', orderId, growResponse });
        return;
      }
      setView({ kind: 'error', orderId, message: error?.message || 'confirm failed' });
    });

    return () => {
      cancelled = true;
    };
  }, [clearCart, location]);

  const handleBackToHome = () => {
    navigate('/');
  };

  if (view.kind === 'loading') {
    return <LoadingSpinner />;
  }

  return <PaymentSuccessStatusView view={view} onBackToHome={handleBackToHome} />;
};

export default PaymentSuccess;
