// src/components/CommunityCoordinators.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from "firebase/firestore"; 
import { db } from '../firebase/firebase'; // Adjust this path based on your actual setup
import './CommunityCoordinators.css';
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
            <h1 className="producers-header">קהילות</h1>
            <div className="producers-container">
                {coordinators.map(coordinator => (
                    <Link to={`/coordinators/${coordinator.id}`} key={coordinator.id} className="producer-item">
                        <img src={coordinator.imageUrl} alt={coordinator.name} />
                        <p><strong>{coordinator.name}</strong></p>
                        <p><span>{coordinator.email}</span> <strong> :אימייל</strong> </p>
                        <p><span>{coordinator.phone}</span> <strong> :טלפון</strong> </p>
                        <p><strong>אזור:</strong> {coordinator.location}</p>
                        <p><strong>קהילות:</strong> {coordinator.communities ? coordinator.communities.join(', ') : 'None'}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
};

export default CommunityCoordinators;
