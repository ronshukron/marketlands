import React from 'react';
import './LoadingSpinnerPayment.css';

const PaymentProcessingSpinner = () => {
    return (
        <div className="payment-processing-overlay">
            <div className="payment-processing-content">
                <div className="payment-spinner"></div>
                <div className="payment-processing-text">
                    {/* <h2>מעבד את התשלום</h2> */}
                    <h2>אנא המתינו, עוברים לתשלום מאובטח.</h2>
                    {/* <p>זה עשוי לקחת מספר שניות.</p> */}
                </div>
            </div>
        </div>
    );
};

export default PaymentProcessingSpinner;