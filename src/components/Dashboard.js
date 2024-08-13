import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from '../firebase/firebase'; // Make sure the path is correct
import { useAuthState } from 'react-firebase-hooks/auth'; // for Firebase auth
import './Dashboard.css'; // CSS for styling the dashboard
import { format } from 'date-fns'; // You may need to install date-fns if not already installed
import LoadingSpinner from './LoadingSpinner';
import Swal from 'sweetalert2'; // Import SweetAlert2

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
        const ordersRef = collection(db, "Orders");
        const q = query(ordersRef, where("Coordinator_Email", "==", user.email));
        const querySnapshot = await getDocs(q);
        const fetchedOrders = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            Order_Time: doc.data().Order_Time ? doc.data().Order_Time.toDate() : null,
        }));

        // Sort orders by date, with the latest date first
        const sortedOrders = fetchedOrders.sort((a, b) => b.Order_Time - a.Order_Time);

        setOrders(sortedOrders.map(order => ({
            ...order,
            Order_Time: order.Order_Time ? formatDate(order.Order_Time) : 'No date',
        })));

        setLoading(false);
    };

    const formatDate = (date) => {
        return format(date, 'PPpp');
    };

    const handleRowClick = (orderId) => {
        navigate(`/order-summary/${orderId}`);
    };

    const handleCopyLink = (e, orderId) => {
        e.stopPropagation(); // Prevents the row click event
        const link = `${window.location.origin}/order-form/${orderId}`;
        navigator.clipboard.writeText(link)
            .then(() => {
                Swal.fire({
                    icon: 'success',
                    title: 'הקישור הועתק',
                    text: 'הקישור להזמנה הועתק למקלדת שלך',
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
                            <th>זמן</th>
                            <th>ספק</th>
                            <th>עלות כוללת</th>
                            <th>קישור להזמנה</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map(order => (
                            <tr key={order.id} onClick={() => handleRowClick(order.id)}>
                                <td>{order.Order_Name}</td>
                                <td>{order.Order_Time}</td>
                                <td>{order.Producer_Name}</td>
                                <td>{order.Total_Amount}₪</td>
                                <td>
                                    <button onClick={(e) => handleCopyLink(e, order.id)}>העתק קישור</button>
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
