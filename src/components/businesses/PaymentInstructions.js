// src/components/PaymentInstructions.js

import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import './PaymentInstructions.css'; // Create or reuse styles as needed

const PaymentInstructions = () => {
  const location = useLocation();
  const { orderData, memberData } = location.state || {};

  if (!orderData || !memberData) {
    return <div>נתונים חסרים. אנא חזור להזמנה ונסה שוב.</div>;
  }

  return (
    <div className="payment-instructions-container">
      <h1>הוראות תשלום</h1>
      <p>תודה לך על ההזמנה!</p>
      <h2>סך הכל לתשלום: {memberData.OrderValue.toFixed(2)}₪</h2>

      {orderData.paymentApps.includes('paybox') && (
        <div className="payment-method">
          <h3>תשלום באמצעות פייבוקס</h3>
          <p>לחץ על הקישור כדי לבצע תשלום דרך פייבוקס:</p>
          <a href={`https://${orderData.payboxLink}`} target="_blank" rel="noopener noreferrer">
             מעבר לתשלום בפייבוקס
        </a>
        </div>
      )}

      {orderData.paymentApps.includes('bit') && (
        <div className="payment-method">
          <h3>תשלום באמצעות ביט</h3>
          <p>אנא בצע העברה בסך {memberData.OrderValue.toFixed(2)}₪ למספר הטלפון:</p>
          <p className="phone-number">{orderData.phoneNumber}</p>
        </div>
      )}

      <p>ההזמנה שלכם עוגנה בערכת, הספק ממתין לתשלום. </p>

      <div className="buttons-container">
        <Link to="/" className="home-button">חזרה לדף הבית</Link>
      </div>
    </div>
  );
};

export default PaymentInstructions;
