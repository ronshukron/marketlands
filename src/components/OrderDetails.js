import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteField } from "firebase/firestore";
import { db } from '../firebase/firebase';
import './OrderDetails.css';
import Swal from 'sweetalert2';
import LoadingSpinner from './LoadingSpinner';

const OrderDetails = () => {
    const { orderId, memberId } = useParams();
    const [orderDetails, setOrderDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchOrderDetails = async () => {
            const orderDocRef = doc(db, "Orders", orderId);
            const orderDoc = await getDoc(orderDocRef);

            if (orderDoc.exists()) {
                const orderData = orderDoc.data();
                const memberDetails = orderData[memberId];

                setOrderDetails({
                    ...memberDetails,
                    orderName: orderData.Order_Name,
                    producerName: orderData.Producer_Name,
                    orderTime: orderData.Order_Time.toDate().toLocaleString()
                });
            }
            setLoading(false);
        };

        fetchOrderDetails();
    }, [orderId, memberId]);

    const handleDeleteOrder = async () => {
        const orderDocRef = doc(db, "Orders", orderId);

        try {
            const orderDoc = await getDoc(orderDocRef);
            if (!orderDoc.exists()) {
                throw new Error("Order not found");
            }

            const orderData = orderDoc.data();
            const memberDetails = orderData[memberId];

            // Calculate total amount for the deleted order
            const totalOrderValue = Object.entries(memberDetails)
                .filter(([key]) => key !== 'Name')
                .reduce((sum, [key, value]) => {
                    return sum + (value.Quantity * value.Price);
                }, 0);

            await updateDoc(orderDocRef, {
                [memberId]: deleteField(),
                Total_Amount: orderData.Total_Amount - totalOrderValue
            });

            Swal.fire({
                icon: 'success',
                title: 'ההזמנה נמחקה בהצלחה',
                text: 'פרטי ההזמנה שלך נמחקו',
                showConfirmButton: true
            }).then(() => {
                navigate('/');
            });
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'שגיאה',
                text: 'נכשלה מחיקת ההזמנה',
                showConfirmButton: true
            });
            console.error("Error deleting order:", error);
        }
    };

    if (loading) {
        return <LoadingSpinner />;
    }

    if (!orderDetails) {
        return <div>הזמנה לא נמצאה</div>;
    }

    return (
        <div className="order-details-container">
            <h1>פרטי הזמנה</h1>
            <p><strong>שם המזמין:</strong> {orderDetails.Name}</p>
            {/* <p><strong>שם הזמנה:</strong> {orderDetails.orderName}</p> */}
            <p><strong>שם הספק:</strong> {orderDetails.producerName}</p>
            <p><strong>זמן ההזמנה:</strong> {orderDetails.orderTime}</p>
            <h2>מוצרים</h2>
            <ul>
                {Object.entries(orderDetails).map(([key, value]) => (
                    key !== 'orderName' && key !== 'producerName' && key !== 'orderTime' && value.Name && value.Option && value.Price && value.Quantity && (
                        <li key={key}>
                            <p><strong>שם המוצר:</strong> {value.Name}</p>
                            <p><strong>אופציה:</strong> {value.Option}</p>
                            <p><strong>מחיר:</strong> {value.Price}₪</p>
                            <p><strong>כמות:</strong> {value.Quantity}</p>
                        </li>
                    )
                ))}
            </ul>
            {/* <button className="delete-button" onClick={handleDeleteOrder}>מחק הזמנה</button> */}
        </div>
    );
};

export default OrderDetails;
