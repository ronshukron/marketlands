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

            // Combine orders
            const combinedOrders = [...fetchedFarmerOrders, ...fetchedBusinessOrders];

            // Sort orders by date, with the latest date first
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
        if (dateField.toDate) {
            return dateField.toDate();
        } else if (typeof dateField === 'string') {
            return new Date(dateField);
        } else if (typeof dateField === 'number') {
            // If the timestamp is in seconds, multiply by 1000
            return new Date(dateField.toString().length === 10 ? dateField * 1000 : dateField);
        } else {
            return null;
        }
    };

    const formatDate = (date) => {
        if (!date || isNaN(date.getTime())) {
            return 'No date';
        }
        return format(date, 'dd/MM/yyyy HH:mm');
    };

    const handleRowClick = (order) => {
        if (order.orderType === 'farmer') {
            navigate(`/order-summary/${order.id}`);
        } else if (order.orderType === 'business') {
            navigate(`/business-order-summary/${order.id}`);
        }
    };

    const handleCopyLink = (e, order) => {
        e.stopPropagation(); // Prevents the row click event
        let link = '';
        if (order.orderType === 'farmer') {
            link = `${window.location.origin}/order-form/${order.id}`;
        } else if (order.orderType === 'business') {
            link = `${window.location.origin}/order-form-business/${order.id}`;
        }
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

    if (loading) {
        return <LoadingSpinner />;
    }

    return (
        <div className="dashboard-container">
            <h1>לוח הזמנות</h1>
            <div className="table-container">
                <table className="orders-table">
                    <thead>
                        <tr>
                            <th>שם הזמנה</th>
                            <th>תאריך</th>
                            <th>ספק</th>
                            <th>עלות כוללת</th>
                            <th>קישור להזמנה</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map(order => (
                            <tr key={order.id} onClick={() => handleRowClick(order)}>
                                <td>{order.Order_Name || order.orderName}</td>
                                <td>{order.displayDate}</td>
                                <td>{order.Producer_Name || order.businessName}</td>
                                <td>{order.Total_Amount ? `${order.Total_Amount}₪` : 'N/A'}</td>
                                <td>
                                    <button onClick={(e) => handleCopyLink(e, order)}>העתק קישור</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Dashboard;
