import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Swal from 'sweetalert2';
import emailjs from '@emailjs/browser';
import LoadingSpinner from './LoadingSpinner'; // Import the LoadingSpinner component
import './OrderConfirmationSuccess.css';

const OrderConfirmationSuccess = () => {
    const location = useLocation();
    const { cartProducts, orderId, memberKey } = location.state || { cartProducts: [], orderId: '', memberKey: '' };
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false); // Loading state for the send email button

    const handleBackToHome = () => {
        navigate('/');
    };

    const orderDetailsLink = `${window.location.origin}/order-details/${orderId}/${memberKey}`;

    const handleCopyLink = () => {
        navigator.clipboard.writeText(orderDetailsLink)
            .then(() => {
                Swal.fire({
                    icon: 'success',
                    title: 'הקישור הועתק בהצלחה',
                    text: 'תוכלו לעקוב או למחוק את ההזמנה באמצעות הקישור',
                    showConfirmButton: false,
                    timer: 3000
                });
            })
            .catch(err => {
                Swal.fire({
                    icon: 'error',
                    title: 'שגיאה',
                    text: 'העתקת הקישור נכשלה',
                    showConfirmButton: false,
                    timer: 2000
                });
            });
    };

    const handleSendEmail = () => {
        setLoading(true); // Start loading
        emailjs.send('service_ao0jk0r', 'template_ivj0o9k', {
            to_name: 'Recipient', // You can adjust this as needed
            from_name: 'Community Cart',
            message: `${orderDetailsLink}`,
            to_email: email
        }, 'U0OVJdWDI7Q-Pl9uT')
            .then((response) => {
                Swal.fire({
                    icon: 'success',
                    title: 'הקישור נשלח בהצלחה',
                    text: 'אנא בדוק את תיבת הדוא"ל שלך',
                    showConfirmButton: false,
                    timer: 2000
                });
                setEmail('');
            }, (err) => {
                Swal.fire({
                    icon: 'error',
                    title: 'שגיאה',
                    text: 'שליחת הדוא"ל נכשלה',
                    showConfirmButton: false,
                    timer: 2000
                });
            })
            .finally(() => {
                setLoading(false); // Stop loading
            });
    };

    if (loading) {
        return <LoadingSpinner />;
    }

    return (
        <div className="success-container">
            <h1>הזמנה הושלמה בהצלחה</h1>
            <p>תודה רבה על ההזמנה שלך. פרטי ההזמנה שלך נשמרו בהצלחה</p>
            <p>תוכלו להעתיק את הקישור הבא ולעקוב או למחוק את ההזמנה שלכם</p>
            <input type="text" value={orderDetailsLink} readOnly className="link-input" />
            <button onClick={handleCopyLink} className="copy-link-button">העתק קישור</button>
            <div className="email-section">
                <p>הזן את הדוא"ל שלך כדי לקבל את הקישור:</p>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="הכנס כתובת דואל"
                    className="email-input"
                />
                <button onClick={handleSendEmail} className="send-email-button" disabled={loading}>
                    {loading ? <LoadingSpinner /> : 'שלח קישור לדוא"ל'}
                </button>
            </div>
            <button onClick={handleBackToHome} className="back-home-button">חזור לדף הבית</button>
        </div>
    );
};

export default OrderConfirmationSuccess;
