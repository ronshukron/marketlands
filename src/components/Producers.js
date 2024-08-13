// src/components/Producers.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from "firebase/firestore"; 
import { db } from '../firebase/firebase'; // Adjust this path based on your actual setup
import './Producers.css';
import LoadingSpinner from './LoadingSpinner';

const Producers = () => {
    const [producers, setProducers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProducers = async () => {
            const querySnapshot = await getDocs(collection(db, "Producers"));
            const producersData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().Name,
                imageUrl: doc.data().Image,
                ...doc.data()
            }));
            setProducers(producersData);
            setLoading(false);
        };

        fetchProducers();
    }, []);

    if (loading) {
        return <LoadingSpinner />;
    }


    return (
        <div>
            <h1 className="producers-header">הספקים שלנו</h1>
            <div className="producers-container">
                {producers.map(producer => (
                    <Link to={`/producers/${producer.id}`} key={producer.id} className="producer-item">
                        <img src={producer.imageUrl} alt={producer.name} />
                        <p>{producer.name}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
};

export default Producers;
