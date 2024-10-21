// src/components/OrderConfirmationFree.js

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { doc, getDoc, setDoc, collection } from "firebase/firestore";
import { db } from '../../firebase/firebase';
import Swal from 'sweetalert2';
import './OrderConfirmationFree.css'; // You can create a separate CSS file or reuse existing styles

const OrderConfirmationFree = () => {
  const location = useLocation();
  const { cartProducts: initialCartProducts, orderId } = location.state || { cartProducts: [], orderId: '' };
  const navigate = useNavigate();
  const [cartProducts, setCartProducts] = useState(initialCartProducts);
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [formIsValid, setFormIsValid] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [orderData, setOrderData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch order data to get payment apps and other details
    const fetchOrderData = async () => {
      try {
        const orderDocRef = doc(db, "Orders", orderId);
        const orderSnap = await getDoc(orderDocRef);
        if (orderSnap.exists()) {
          setOrderData(orderSnap.data());
        } else {
          console.log("Order does not exist!");
          navigate('/error');
        }
      } catch (error) {
        console.error("Error fetching order data:", error);
        navigate('/error');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderData();
  }, [orderId, navigate]);

  useEffect(() => {
    const isValid = userName.trim() !== '' &&
      userPhone.trim() !== '' &&
      userEmail.trim() !== '' &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);
    setFormIsValid(isValid);
  }, [userName, userPhone, userEmail]);

  const total = cartProducts.reduce((acc, item) => acc + item.quantity * item.price, 0);

  const handleSubmitOrder = async () => {
    if (!formIsValid) {
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אנא מלא את כל השדות הנדרשים.',
        confirmButtonText: 'אישור',
      });
      return;
    }

    if (!agreeToTerms) {
      Swal.fire({
        icon: 'warning',
        title: 'הסכמה לתנאי שימוש',
        text: 'יש לאשר את תנאי השימוש לפני ביצוע ההזמנה.',
        confirmButtonText: 'אישור',
      });
      return;
    }

    // Check if order has ended
    const orderHasEnded = await checkIfOrderEnded();
    if (orderHasEnded) {
      Swal.fire({
        icon: 'error',
        title: 'ההזמנה הסתיימה',
        text: 'צר לנו, אבל זמן ההזמנה הזו כבר הסתיימה.',
        confirmButtonText: 'אישור',
      }).then(() => {
        navigate(`/order-form-business/${orderId}`);
      });
      return;
    }

    setLoading(true);

    try {
      // Fetch the current Total_Amount from the order document
      const orderDocRef = doc(db, "Orders", orderId);
      const orderDocSnap = await getDoc(orderDocRef);
      let currentTotalAmount = 0;
      if (orderDocSnap.exists()) {
          const orderData = orderDocSnap.data();
          currentTotalAmount = orderData.Total_Amount || 0; // Set to 0 if undefined
      }
      // Create order in Firestore under the Orders collection
      const memberData = {
        Name: userName,
        Email: userEmail,
        Phone: userPhone,
        Mem_Order_Time: new Date().getTime(),
        OrderValue: total,
      };

      cartProducts.forEach(product => {
        if (product.quantity > 0) {
          memberData[product.uid] = {
            Name: product.name,
            Quantity: product.quantity,
            Price: product.price,
            Option: product.selectedOption || "None",
          };
        }
      });

      const newTotalAmount = currentTotalAmount + total;

      // Update the order document with the member's data
      // const orderDocRef = doc(db, "Orders", orderId);
      await setDoc(orderDocRef, {
        [`Member_${memberData.Mem_Order_Time}`]: memberData,
        Total_Amount: newTotalAmount, // Update the total amount
      }, { merge: true });

      // Navigate to payment instructions page
      navigate('/payment-instructions', { state: { orderData, memberData } });
    } catch (error) {
      console.error("Error submitting order:", error);
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אירעה שגיאה בעת שליחת ההזמנה. נסה שוב מאוחר יותר.',
        confirmButtonText: 'אישור',
      });
    }
  };

  const checkIfOrderEnded = async () => {
    try {
      const orderDoc = doc(db, "Orders", orderId);
      const docSnap = await getDoc(orderDoc);

      if (docSnap.exists()) {
        const orderData = docSnap.data();
        if (orderData.endingTime) {
          const endingTime = orderData.endingTime.toDate();
          const currentTime = new Date();
          if (currentTime >= endingTime) {
            return true; // Order has ended
          }
        }
      } else {
        console.log("Order does not exist!");
        navigate('/error');
      }
    } catch (error) {
      console.error("Error checking if order has ended:", error);
    }
    return false; // Order has not ended
  };

  if (loading) {
    return <div>טוען...</div>;
  }

  return (
    <div className="confirmation-container">
      <h1>סיכום הזמנה</h1>
      <h2>פרטי ההזמנה</h2>
      <ul>
        {cartProducts.map((item, index) => (
          <li key={index}>
            {item.name} - {item.quantity} x {item.price}₪ = {item.quantity * item.price}₪
            <br />
            <strong>אופציה:</strong> {item.selectedOption}
          </li>
        ))}
      </ul>
      <h3>סה"כ לתשלום: {total.toFixed(2)}₪</h3>

      <div className="user-details-container">
        <h3>פרטי לקוח</h3>
        <div className="user-details">
          <div className={`input-group ${userName.trim() === '' ? 'invalid' : ''}`}>
            <label htmlFor="userName">שם מלא</label>
            <input
              id="userName"
              type="text"
              placeholder="שם מלא"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
            />
          </div>
          <div className={`input-group ${userPhone.trim() === '' ? 'invalid' : ''}`}>
            <label htmlFor="userPhone">מספר טלפון</label>
            <input
              id="userPhone"
              type="tel"
              placeholder="מספר טלפון"
              value={userPhone}
              onChange={(e) => setUserPhone(e.target.value)}
              required
            />
          </div>
          <div className={`input-group ${userEmail.trim() === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail) ? 'invalid' : ''}`}>
            <label htmlFor="userEmail">כתובת אימייל</label>
            <input
              id="userEmail"
              type="email"
              placeholder="כתובת אימייל"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              required
            />
          </div>
        </div>
      </div>

      <div className="terms-agreement">
        <label htmlFor="agreeToTerms">
          קראתי ואני מסכים ל<Link to="/terms-of-service" target="_blank">-תנאי השימוש</Link>
        </label>
        <input
          className='terms-checkbox'
          type="checkbox"
          id="agreeToTerms"
          checked={agreeToTerms}
          onChange={(e) => setAgreeToTerms(e.target.checked)}
        />
      </div>

      <div className="button-container">
        <button onClick={handleSubmitOrder} className="submit-button">אישור הזמנה והמשך לתשלום</button>
      </div>
    </div>
  );
};

export default OrderConfirmationFree;
