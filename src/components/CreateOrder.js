import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { db, auth } from '../firebase/firebase';
import { collection, addDoc, getDocs, doc, getDoc} from "firebase/firestore";
import './CreateOrder.css';  // Ensure this path is correct
import LoadingSpinner from './LoadingSpinner';
import Swal from 'sweetalert2'; // Import SweetAlert2
import communityToRegion from '../utils/communityToRegion'; // Adjust the path as necessary

const CreateOrder = () => {
    const [producers, setProducers] = useState([]);
    const [selectedProducerId, setSelectedProducerId] = useState(null);
    const [orderName, setOrderName] = useState('');
    const navigate = useNavigate();
    const [user] = useAuthState(auth);
    const [link, setLink] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedDuration, setSelectedDuration] = useState(''); // New state for duration

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

    // Function to calculate ending date based on duration
    const calculateEndingDate = (duration) => {
        const currentTime = new Date();
        switch (duration) {
            case '3_days':
                currentTime.setDate(currentTime.getDate() + 3);
                break;
            case '5_days':
                currentTime.setDate(currentTime.getDate() + 5);
                break;
            case '1_week':
                currentTime.setDate(currentTime.getDate() + 7);
                break;
            case '2_weeks':
                currentTime.setDate(currentTime.getDate() + 14);
                break;
            case '1_month':
                currentTime.setMonth(currentTime.getMonth() + 1);
                break;
            default:
                return null;
        }
        return currentTime;
    };

    const handleCreateOrder = async () => {
        if (!selectedProducerId || !orderName.trim() || !selectedDuration) {
            alert("אנא בחרו ספק, הזינו שם הזמנה, ובחרו זמן סיום.");
            return;
        }
        
        const currentTime = new Date();
        const endingTime = calculateEndingDate(selectedDuration);
        if (!endingTime) {
            alert("אנא בחרו משך זמן תקין.");
            return;
        }

        try {
            const producer = producers.find(p => p.id === selectedProducerId);
            // Fetch coordinator's data
            const userDoc = doc(db, 'coordinators', user.uid);
            const userSnap = await getDoc(userDoc);
            let coordinatorCommunity = '';
            if (userSnap.exists()) {
                const userData = userSnap.data();
                coordinatorCommunity = userData.community;
            } else {
                console.log('Coordinator user document not found.');
                alert('אירעה שגיאה בעת יצירת ההזמנה.');
                return;
            }

            const coordinatorRegion = communityToRegion[coordinatorCommunity] || 'אחר';

            const docRef = await addDoc(collection(db, "Orders"), {
                Coordinator_Email: user.email, 
                Producer_ID: selectedProducerId,
                Order_Name: orderName,
                Order_Time: currentTime,
                Ending_Time: endingTime,
                Producer_Name: producer.name,
                Coordinator_Community: coordinatorCommunity,
                Coordinator_Region: coordinatorRegion,
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
            <p className="ending-time-explanation">
                אנא בחרו את משך הזמן עד סיום ההזמנה:
            </p>
            <select
                className="duration-select"
                value={selectedDuration}
                onChange={(e) => setSelectedDuration(e.target.value)}
            >
                <option value="" disabled>בחרו משך זמן</option>
                <option value="3_days">3 ימים</option>
                <option value="5_days">5 ימים</option>
                <option value="1_week">שבוע</option>
                <option value="2_weeks">שבועיים</option>
                <option value="1_month">חודש</option>
            </select>
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
