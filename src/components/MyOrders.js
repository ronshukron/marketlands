import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/authContext';
import { db } from '../firebase/firebase';
import { collection, query, getDocs } from 'firebase/firestore';
import './MyOrders.css';

const MyOrders = () => {
    const { currentUser } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchOrders = async () => {
            if (currentUser && currentUser.email) {
                const ordersRef = collection(db, 'Orders');
                const q = query(ordersRef);
                const querySnapshot = await getDocs(q);
                
                const fetchedOrders = querySnapshot.docs.flatMap(doc => {
                    const orderData = doc.data();
                    console.log(orderData);

                    return Object.entries(orderData)
                        .filter(([key, value]) => 
                            key.startsWith('Member_') && value.Email === currentUser.email
                        )
                        .map(([memberId, memberData]) => ({
                            orderId: doc.id,
                            memberId,
                            orderName: orderData.Order_Name,
                            producerName: orderData.Producer_Name,
                            orderTime: orderData.Mem_Order_Time,
                            ...memberData
                        }));
                });
                // console.log(fetchedOrders);
                setOrders(fetchedOrders);
                setLoading(false);
            }
        };

        fetchOrders();
    }, [currentUser]);

    const handleOrderClick = (orderId, memberId) => {
        navigate(`/order-details/${orderId}/${memberId}`);
    };

    const calculateOrderValue = (memberData) => {
        return Object.entries(memberData)
            .filter(([key, value]) => key !== 'Name' && key !== 'Email' && key !== 'Phone' && typeof value === 'object')
            .reduce((total, [_, product]) => total + (Number(product.Price) * product.Quantity), 0);
    };

    if (loading) {
        return <div>Loading orders...</div>;
    }

    return (
        <div className="my-orders-container">
            <h1>ההזמנות שלי</h1>
            {orders.length === 0 ? (
                <p>עוד לא ביצעתם שום הזמנה</p>
            ) : (
                <table className="orders-table">
                    <thead>
                        <tr>
                            <th>שם הזמנה</th>
                            <th>ספק</th>
                            <th>תאריך הזמנה</th>
                            <th>סה"כ עלות</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map((order, index) => (
                            <tr key={`${order.orderId}-${order.memberId}`} onClick={() => handleOrderClick(order.orderId, order.memberId)}>
                                <td>{order.orderName}</td>
                                <td>{order.producerName}</td>
                                <td>{order.Mem_Order_Time ? new Date(order.Mem_Order_Time).toLocaleDateString() : 'N/A'}</td>
                                <td>₪{order.OrderValue ? order.OrderValue.toFixed(2) : calculateOrderValue(order).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default MyOrders;