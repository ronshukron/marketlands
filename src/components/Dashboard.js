// src/components/Dashboard.js

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from '../firebase/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import './Dashboard.css';
import { format } from 'date-fns';
import LoadingSpinner from './LoadingSpinner';
import Swal from 'sweetalert2';

const Dashboard = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const [user] = useAuthState(auth);

    useEffect(() => {
        if (user) {
            fetchOrders();
        }
    }, [user]);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            // Fetch farmer orders where the user is the coordinator
            const farmerOrdersRef = collection(db, "Orders");
            const farmerOrdersQuery = query(farmerOrdersRef, where("Coordinator_Email", "==", user.email));
            const farmerOrdersSnapshot = await getDocs(farmerOrdersQuery);
            const fetchedFarmerOrders = farmerOrdersSnapshot.docs.map(doc => {
                const data = doc.data();
                const orderDate = parseDate(data.Order_Time) || parseDate(data.createdAt);
                return {
                    id: doc.id,
                    orderType: 'farmer',
                    ...data,
                    orderDate,
                };
            });

            // Fetch business orders where the user is the business owner
            const businessOrdersRef = collection(db, "Orders");
            const businessOrdersQuery = query(businessOrdersRef, where("businessEmail", "==", user.email));
            const businessOrdersSnapshot = await getDocs(businessOrdersQuery);
            const fetchedBusinessOrders = businessOrdersSnapshot.docs.map(doc => {
                const data = doc.data();
                const orderDate = parseDate(data.Order_Time) || parseDate(data.createdAt);
                return {
                    id: doc.id,
                    orderType: 'business',
                    ...data,
                    orderDate,
                };
            });

            // Combine orders and sort by date
            const combinedOrders = [...fetchedFarmerOrders, ...fetchedBusinessOrders];
            const sortedOrders = combinedOrders.sort((a, b) => {
                const dateA = a.orderDate ? a.orderDate.getTime() : 0;
                const dateB = b.orderDate ? b.orderDate.getTime() : 0;
                return dateB - dateA;
            });

            setOrders(sortedOrders.map(order => ({
                ...order,
                displayDate: order.orderDate ? formatDate(order.orderDate) : 'No date',
            })));
            setLoading(false);
        } catch (error) {
            console.error('Error fetching orders:', error);
            setLoading(false);
        }
    };

    const parseDate = (dateField) => {
        if (!dateField) return null;
        if (dateField.toDate) return dateField.toDate();
        return new Date(dateField);
    };

    const formatDate = (date) => {
        return date && !isNaN(date.getTime()) ? format(date, 'dd/MM/yyyy HH:mm') : 'No date';
    };

    const handleViewOrder = (order) => {
        const route = order.orderType === 'farmer' ? `/order-summary/${order.id}` : `/business-order-summary/${order.id}`;
        navigate(route);
    };

    const handleCopyLink = (order) => {
        const link = `${window.location.origin}/${order.orderType === 'farmer' ? 'order-form' : 'order-form-business'}/${order.id}`;
        navigator.clipboard.writeText(link)
            .then(() => {
                Swal.fire({
                    icon: 'success',
                    title: 'הקישור הועתק',
                    text: 'הקישור להזמנה הועתק ללוח שלך',
                    showConfirmButton: false,
                    timer: 1500
                });
            })
            .catch(err => console.error('Failed to copy link: ', err));
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="dashboard-container">
            <h1>לוח הזמנות</h1>
            <div className="orders-grid">
                {orders.map(order => (
                    <div key={order.id} className="order-card">
                        <h2 className="order-name">{order.Order_Name || order.orderName}</h2>
                        <p><strong>תאריך:</strong> {order.displayDate}</p>
                        <p><strong>ספק:</strong> {order.Producer_Name || order.businessName}</p>
                        <p><strong>עלות כוללת:</strong> {order.Total_Amount ? `${order.Total_Amount}₪` : 'N/A'}</p>
                        <div className="order-card-actions">
                            <button className="view-order-btn" onClick={() => handleViewOrder(order)}>צפה בהזמנה</button>
                            <button className="copy-link-btn" onClick={() => handleCopyLink(order)}>העתק קישור</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Dashboard;
