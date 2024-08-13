// src/components/CommunityCoordinators.js
import React, { useState, useEffect } from 'react';
import { collection, getDocs } from "firebase/firestore"; 
import { db } from '../firebase/firebase'; // Adjust this path based on your actual setup
import './Producers.css';
import LoadingSpinner from './LoadingSpinner';

const CommunityCoordinators = () => {
    const [coordinators, setCoordinators] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCoordinators = async () => {
            const querySnapshot = await getDocs(collection(db, "CommunityCoordinators"));
            const coordinatorsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().Name,
                email: doc.data().Email,
                phone: doc.data().Phone,
                imageUrl: doc.data().Image,
                location: doc.data().Location,
                communities: doc.data().Communities,
                ...doc.data()
            }));
            setCoordinators(coordinatorsData);
            setLoading(false);
        };

        fetchCoordinators();
    }, []);

    if (loading) {
        return <LoadingSpinner />;
    }

    return (
        <div>
            <h1 className="producers-header">קהילות קהילה שלנו</h1>
            <div className="producers-container">
                {coordinators.map(coordinator => (
                    <div key={coordinator.id} className="producer-item">
                        <img src={coordinator.imageUrl} alt={coordinator.name} />
                        {/* <p><strong>{coordinator.name}</strong></p> */}
                        {/* <p>Email: {coordinator.email}</p> */}
                        {/* <p>Phone: {coordinator.phone}</p> */}
                        <p>אזור: {coordinator.location}</p>
                        <p>קהילות: {coordinator.communities.join(", ")}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CommunityCoordinators;
