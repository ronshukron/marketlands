import React, { useState } from 'react';
import emailjs from '@emailjs/browser';
import './ContactForm.css';

const ContactForm = () => {
    const [formState, setFormState] = useState({
        from_name: '',
        from_email: '', // Added email field
        to_name: 'Recipient', // Assuming a fixed recipient name; adjust as needed
        message: ''
    });

    const [messageSent, setMessageSent] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormState({
            ...formState,
            [name]: value
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        emailjs.send('service_ao0jk0r', 'template_333t6q8', formState, 'U0OVJdWDI7Q-Pl9uT')
            .then((response) => {
                console.log('SUCCESS!', response.status, response.text);
                setMessageSent(true);
                setFormState({ from_name: '', from_email: '', to_name: 'ron', message: '' });
            }, (err) => {
                console.error('FAILED...', err);
            });
    };

    return (
        <div className="contact-form-container">
            <h1>צרו קשר</h1>
            <p className="contact-info">
                נשמח לעמוד לרשותכם בכל שאלה או בקשה. אתם מוזמנים ליצור איתנו קשר דרך הטופס הבא או בטלפון: <strong>050-7932705</strong>.
            </p>
            <p className="contact-info"><strong>שעות פעילות:</strong> א'-ה' 08:00-18:00, ו' 08:00-13:00</p>
            <p className="contact-info">כתובת: אור הנר, 7919000</p>

            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="from_name">שם</label>
                    <input
                        type="text"
                        id="from_name"
                        name="from_name"
                        value={formState.from_name}
                        onChange={handleChange}
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="from_email">אימייל</label>
                    <input
                        type="email"
                        id="from_email"
                        name="from_email"
                        value={formState.from_email}
                        onChange={handleChange}
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="message">הודעה</label>
                    <textarea
                        id="message"
                        name="message"
                        value={formState.message}
                        onChange={handleChange}
                        required
                    />
                </div>
                <button type="submit">שלח</button>
                {messageSent && <p className="success-message">האימייל נשלח בהצלחה</p>}
            </form>
        </div>
    );
};

export default ContactForm;
