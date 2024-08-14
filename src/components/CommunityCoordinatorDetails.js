// src/components/CommunityCoordinatorDetails.js
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from "firebase/firestore";
import { db } from '../firebase/firebase';
import './CommunityCoordinatorDetails.css';
import LoadingSpinner from './LoadingSpinner';
import emailjs from '@emailjs/browser';

const CommunityCoordinatorDetails = () => {
    const { coordinatorId } = useParams();
    const [coordinator, setCoordinator] = useState(null);
    const [loading, setLoading] = useState(true);
    const [formState, setFormState] = useState({
        from_name: '',
        from_email: '',
        to_name: '',
        message: ''
    });
    const [messageSent, setMessageSent] = useState(false);

    useEffect(() => {
        const fetchCoordinatorDetails = async () => {
            const docRef = doc(db, "CommunityCoordinators", coordinatorId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setCoordinator(data);
                setFormState({
                    ...formState,
                    to_name: data.Name
                });
            } else {
                console.log("No such document!");
            }
            setLoading(false);
        };

        fetchCoordinatorDetails();
    }, [coordinatorId]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormState({
            ...formState,
            [name]: value
        });
    };

    const handleSendMessage = (e) => {
        e.preventDefault();

        emailjs.send('service_ao0jk0r', 'template_333t6q8', formState, 'U0OVJdWDI7Q-Pl9uT')
            .then((response) => {
                console.log('SUCCESS!', response.status, response.text);
                setMessageSent(true);
                setFormState({ from_name: '', from_email: '', to_name: coordinator.Name, message: '' });
            }, (err) => {
                console.error('FAILED...', err);
            });
    };

    if (loading) {
        return <LoadingSpinner />;
    }

    if (!coordinator) return <div>No coordinator details available.</div>;

    return (
        <div className="coordinator-details-container">
            <h1>{coordinator.Name}</h1>
            <img src={coordinator.Image} alt={coordinator.Name} className="coordinator-image" />
            <p>{coordinator.Email} <strong>:אימייל</strong> </p>
            <p><strong>טלפון:</strong> {coordinator.Phone}</p>
            <p><strong>אזור:</strong> {coordinator.Location}</p>
            <p><strong>קהילות:</strong> {coordinator.communities ? coordinator.communities.join(', ') : 'None'}</p>
            <div className="message-box">
                <h2>שלח אימייל לרכז {coordinator.Name}</h2>
                <form onSubmit={handleSendMessage}>
                    <div className="form-group">
                        <label htmlFor="from_name">השם שלך</label>
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
                        <label htmlFor="from_email">האימייל שלך</label>
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
                    <button type="submit">שלח בקשה</button>
                    {messageSent && <p className="success-message">הודעה נשלחה בהצלחה!</p>}
                </form>
            </div>
        </div>
    );
};

export default CommunityCoordinatorDetails;
