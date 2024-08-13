import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { db, auth } from '../firebase/firebase';
import { collection, addDoc, getDocs } from "firebase/firestore";
import './CreateOrder.css';  // Ensure this path is correct
import LoadingSpinner from './LoadingSpinner';
import Swal from 'sweetalert2'; // Import SweetAlert2

const CreateOrder = () => {
    const [producers, setProducers] = useState([]);
    const [selectedProducerId, setSelectedProducerId] = useState(null);
    const [orderName, setOrderName] = useState('');
    const navigate = useNavigate();
    const [user] = useAuthState(auth);
    const [link, setLink] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProducers();
    }, []);

    const fetchProducers = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "Producers"));
            const fetchedProducers = querySnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().Name,
                imageUrl: doc.data().Image
            }));
            setProducers(fetchedProducers);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching producers: ", error);
        }
    };

    const handleProducerSelect = (producerId) => {
        setSelectedProducerId(producerId);
    };

    const handleCreateOrder = async () => {
        if (!selectedProducerId || !orderName.trim()) {
            alert("Please select a producer and enter an order name.");
            return;
        }
        try {
            const producer = producers.find(p => p.id === selectedProducerId);
            const docRef = await addDoc(collection(db, "Orders"), {
                Coordinator_Email: user.email, 
                Producer_ID: selectedProducerId,
                Order_Name: orderName,
                Order_Time: new Date(),
                Producer_Name: producer.name,
            });
            const newLink = `${window.location.origin}/order-form/${docRef.id}`;
            setLink(newLink);
            Swal.fire({
                icon: 'success',
                title: 'הקישור הועתק',
                text: 'הקישור להזמנה הועתק למקלדת שלך',
                showConfirmButton: false,
                timer: 1500
            });
            navigate(`/order-form/${docRef.id}`);
        } catch (e) {
          console.error("Error adding document: ", e);
        }
    };

    if (loading) {
        return <LoadingSpinner />;
    }

    return (
        <div className="create-order-container">
            <h1 className="create-order-header">יצירת הזמנה</h1>
            <input
                type="text"
                className="order-name-input"
                placeholder="הכניסו שם הזמנה"
                value={orderName}
                onChange={(e) => setOrderName(e.target.value)}
            />
            <div className="producer-grid">
                {producers.map(producer => (
                    <div
                        key={producer.id}
                        className={`producer-item ${selectedProducerId === producer.id ? 'selected' : ''}`}
                        onClick={() => handleProducerSelect(producer.id)}
                    >
                        <img src={producer.imageUrl} alt={producer.name} />
                        <p>{producer.name}</p>
                    </div>
                
                ))}
            </div>
            <button
                className="create-order-button"
                onClick={handleCreateOrder}
                disabled={!selectedProducerId || !orderName.trim()}
            >
                צור הזמנה
            </button>
            {link && <div className="link-container"><a href={link}>{link}</a></div>}
        </div>
    );
    
    
};

export default CreateOrder;
