import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from "firebase/firestore";
import { db } from '../firebase/firebase';
import './OrderSummary.css';
import LoadingSpinner from './LoadingSpinner';

const OrderSummary = () => {
    const { orderId } = useParams();
    const [orderData, setOrderData] = useState(null);
    const [producerMinValue, setProducerMinValue] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOrderData = async () => {
            const docRef = doc(db, "Orders", orderId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setOrderData(data);
                fetchProducerMinValue(data.Producer_ID);
            } else {
                console.log("No order data found");
            }
            setLoading(false);
        };

        fetchOrderData();
    }, [orderId]);

    const fetchProducerMinValue = async (producerId) => {
        const producerRef = doc(db, "Producers", producerId);
        const producerSnap = await getDoc(producerRef);
        if (producerSnap.exists()) {
            setProducerMinValue(producerSnap.data().Min_Value);
        }
    };

    const calculateProgress = () => {
        if (!producerMinValue) return 0;
        return (orderData.Total_Amount / producerMinValue) * 100;
    };

    const calculateMemberTotal = (memberDetails) => {
        return Object.values(memberDetails).filter(item => typeof item === 'object' && item.Quantity).reduce((total, item) => {
            return total + (item.Quantity * item.Price);
        }, 0);
    };

    if (loading) {
        return <LoadingSpinner />;
    }
    
    if (!orderData) return <div className="no-data">No data available for this order.</div>;

    const progress = calculateProgress();

    return (
        <div className="order-summary-container">
            <h1>סיכום הזמנה</h1>
            <h2>סהכ: ₪{orderData.Total_Amount}</h2>
            <h2>סכום מינימלי: ₪{producerMinValue}</h2>
            <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${progress}%`, backgroundColor: progress >= 100 ? 'green' : 'orange' }}>
                    {progress.toFixed(2)}%
                </div>
            </div>
            {Object.keys(orderData).filter(key => key.startsWith('Member_')).map((memberKey, index) => {
                const memberTotal = calculateMemberTotal(orderData[memberKey]);
                return (
                    <div key={index} className="order-member">
                        <h3>{orderData[memberKey].Name} - סה"כ: ₪{memberTotal}</h3>
                        <ul>
                            {Object.entries(orderData[memberKey]).filter(([key,]) => key !== 'Name').map(([productKey, productDetails], idx) => (
                                <li key={idx}>
                                    {productKey.split('_')[0]} ({productDetails.Option}): {productDetails.Quantity} יחידות ₪{productDetails.Price} 
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
};

export default OrderSummary;
