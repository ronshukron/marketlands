// src/components/MyStore.js

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/authContext';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
} from 'firebase/firestore';
import { db, storage } from '../../firebase/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate, useParams } from 'react-router-dom';
import './MyStore.css';
import defaultBackground from '../../images/Field.jpg';
import defaultProfile from '../../images/freshlybaledfield.jpg';
import { FaPhoneAlt, FaWhatsapp } from 'react-icons/fa'; 

const MyStore = () => {
  const { currentUser } = useAuth();
  const { businessId } = useParams(); // Get businessId from URL
  const [businessData, setBusinessData] = useState(null);
  const [storeDescription, setStoreDescription] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [storeMoreInfo, setStoreMoreInfo] = useState('');
  const [editingMoreInfo, setEditingMoreInfo] = useState(false);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const navigate = useNavigate();

  const [backgroundImageUrl, setBackgroundImageUrl] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');

  const isOwner = currentUser && businessData && currentUser.uid === businessId;

  const businessPhone = businessData?.phone || '0500000000';
  const whatsappLink = `https://wa.me/972${businessPhone.replace(/^0/, '').replace(/-/g, '')}`;

  useEffect(() => {
    if (businessId) {
      fetchBusinessData();
      fetchProducts();
      fetchActiveOrders();
    }
  }, [businessId]);

  const fetchBusinessData = async () => {
    try {
      const businessDocRef = doc(db, 'businesses', businessId);
      const businessDocSnap = await getDoc(businessDocRef);
      if (businessDocSnap.exists()) {
        const data = businessDocSnap.data();
        setBusinessData(data);
        setStoreDescription(data.storeDescription || '');
        setStoreMoreInfo(data.storeMoreInfo || '');
        setPhoneNumber(data.phone || '');
        setBackgroundImageUrl(data.backgroundImageUrl || defaultBackground);
        setProfileImageUrl(data.profileImageUrl || defaultProfile);
      } else {
        console.error('Business not found');
        navigate('/not-found');
      }
    } catch (error) {
      console.error('Error fetching business data:', error);
      navigate('/error');
    }
  };

  const fetchProducts = async () => {
    try {
      const q = query(
        collection(db, 'Products'),
        where('Owner_ID', '==', businessId)
      );
      const querySnapshot = await getDocs(q);
      const fetchedProducts = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setProducts(fetchedProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchActiveOrders = async () => {
    try {
      const currentTime = new Date();
      const adjustedCurrentTime = new Date(currentTime.getTime() + 60 * 60 * 1000); // Adjust for timezone if needed

      // Fetch orders where businessId == current businessId
      const q = query(
        collection(db, 'Orders'),
        where('businessId', '==', businessId)
      );
      const querySnapshot = await getDocs(q);

      const ordersData = [];
      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        const endingTime = data.Ending_Time || data.endingTime;
        let orderType = data.orderType;
        if (!orderType) {
          if (data.schedule) {
            orderType = 'recurring';
          } else if (endingTime) {
            orderType = 'one_time';
          } else {
            orderType = 'unknown';
          }
        }
        const schedule = data.schedule; // For recurring orders

        let isActive = false;

        if (orderType === 'one_time') {
          if (endingTime && endingTime.toDate() > adjustedCurrentTime) {
            isActive = true;
          }
        } else if (orderType === 'recurring') {
          if (schedule && isOrderActiveNow(schedule)) {
            isActive = true;
          }
        } else {
          // Skip unknown order types
          continue;
        }

        if (isActive) {
          let order = {
            id: docSnap.id,
            ...data,
          };
          ordersData.push(order);
        }
      }

      setOrders(ordersData);
    } catch (error) {
      console.error('Error fetching active orders:', error);
    }
  };

  const isOrderActiveNow = (schedule) => {
    const now = new Date();
    const currentDayIndex = now.getDay(); // Sunday - Saturday : 0 - 6
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Minutes since midnight

    // Map of days to indices (adjusted for Hebrew days)
    const dayIndexMap = {
      0: ['Sunday', 'ראשון'],
      1: ['Monday', 'שני'],
      2: ['Tuesday', 'שלישי'],
      3: ['Wednesday', 'רביעי'],
      4: ['Thursday', 'חמישי'],
      5: ['Friday', 'שישי'],
      6: ['Saturday', 'שבת'],
    };

    const dayNames = dayIndexMap[currentDayIndex];

    const daySchedule = schedule.find((day) => dayNames.includes(day.day));

    if (daySchedule && daySchedule.active) {
      const [startHour, startMinute] = daySchedule.startTime.split(':').map(Number);
      const [endHour, endMinute] = daySchedule.endTime.split(':').map(Number);

      let startTimeInMinutes = startHour * 60 + startMinute;
      let endTimeInMinutes = endHour * 60 + endMinute;

      // Handle cases where end time is past midnight
      if (endTimeInMinutes <= startTimeInMinutes) {
        endTimeInMinutes += 24 * 60;
      }

      // Adjust current time if necessary
      let adjustedCurrentTime = currentTime;
      if (currentTime < startTimeInMinutes) {
        adjustedCurrentTime += 24 * 60;
      }

      return adjustedCurrentTime >= startTimeInMinutes && adjustedCurrentTime <= endTimeInMinutes;
    } else {
      return false;
    }
  };

  const calculateTimeRemaining = (order) => {
    let orderType = order.orderType;
    if (!orderType) {
      if (order.schedule) {
        orderType = 'recurring';
      } else if (order.Ending_Time || order.endingTime) {
        orderType = 'one_time';
      } else {
        orderType = 'unknown';
      }
    }

    const now = new Date();

    if (orderType === 'one_time') {
      const endingTime = order.Ending_Time || order.endingTime;
      if (endingTime) {
        const end = endingTime.toDate();
        const adjustedEndTime = new Date(end.getTime() - 60 * 60 * 1000); // Adjust if needed
        const diff = adjustedEndTime - now;
        if (diff <= 0) {
          return 'ההזמנה הסתיימה';
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);

        let timeString = '';
        if (days > 0) timeString += `${days} ימים `;
        if (hours > 0) timeString += `${hours} שעות `;
        if (minutes > 0) timeString += `${minutes} דקות`;

        return timeString || 'פחות מדקה';
      } else {
        return 'תאריך סיום לא זמין';
      }
    } else if (orderType === 'recurring') {
      const schedule = order.schedule;
      if (schedule) {
        const isActive = isOrderActiveNow(schedule);
        return isActive ? 'פעיל כעת' : 'לא פעיל כעת';
      } else {
        return 'לוח זמנים לא זמין';
      }
    } else {
      return 'סוג הזמנה לא ידוע';
    }
  };

  const handleDescriptionEdit = () => {
    setEditingDescription(true);
  };

  const handleDescriptionSave = async () => {
    try {
      await updateDoc(doc(db, 'businesses', businessId), {
        storeDescription,
      });
      setEditingDescription(false);
    } catch (error) {
      console.error('Error updating store description:', error);
    }
  };

  const handleMoreInfoEdit = () => {
    setEditingMoreInfo(true);
  };

  const handleMoreInfoSave = async () => {
    try {
      await updateDoc(doc(db, 'businesses', businessId), {
        storeMoreInfo,
      });
      setEditingMoreInfo(false);
    } catch (error) {
      console.error('Error updating store more info:', error);
    }
  };

  const handleProductClick = (productId) => {
    navigate(`/product/${productId}`);
  };

  const handleOrderClick = (orderId) => {
    navigate(`/order-form-business/${orderId}`);
  };

  const handleAddProduct = () => {
    navigate('/business-products');
  };

  const handleCreateOrder = () => {
    navigate('/Business-DashBoard');
  };

  const handleBackgroundImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const storageRef = ref(storage, `businesses/${businessId}/backgroundImage`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      await updateDoc(doc(db, 'businesses', businessId), {
        backgroundImageUrl: downloadURL,
      });
      setBackgroundImageUrl(downloadURL);
    } catch (error) {
      console.error('Error uploading background image:', error);
    }
  };

  const handleProfileImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const storageRef = ref(storage, `businesses/${businessId}/profileImage`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      await updateDoc(doc(db, 'businesses', businessId), {
        profileImageUrl: downloadURL,
      });
      setProfileImageUrl(downloadURL);
    } catch (error) {
      console.error('Error uploading profile image:', error);
    }
  };

  return (
    <div className="my-store-container">
      <div
        className="my-store-header"
        style={{ backgroundImage: `url(${backgroundImageUrl})` }}
      >
        <div className="my-store-profile-container">
          <img
            src={profileImageUrl}
            alt="Profile"
            className="my-store-profile-image"
          />
          {isOwner && (
            <>
              <input
                type="file"
                accept="image/*"
                id="profileImageInput"
                style={{ display: 'none' }}
                onChange={handleProfileImageChange}
              />
              <label htmlFor="profileImageInput" className="my-store-change-profile-button">
                שנה תמונה
              </label>
            </>
          )}
        </div>
        <h1>{businessData?.businessName || 'החנות שלי'}</h1>
        {isOwner && (
          <>
            <input
              type="file"
              accept="image/*"
              id="backgroundImageInput"
              style={{ display: 'none' }}
              onChange={handleBackgroundImageChange}
            />
            <label htmlFor="backgroundImageInput" className="my-store-change-background-button">
              שנה רקע
            </label>
          </>
        )}
      </div>

      <div className="my-store-description-section">
        <h2>תיאור החנות</h2>
        {editingDescription && isOwner ? (
          <div>
            <textarea
              value={storeDescription}
              onChange={(e) => setStoreDescription(e.target.value)}
              rows={5}
            ></textarea>
            <button className="my-store-button" onClick={handleDescriptionSave}>שמור</button>
          </div>
        ) : (
          <div>
            <p>{storeDescription || 'עדיין לא הוזן תיאור לחנות.'}</p>
            {isOwner && (
              <button className="my-store-small-button" onClick={handleDescriptionEdit}>ערוך תיאור</button>
            )}
          </div>
        )}
      </div>

      <div className="my-store-active-orders-section">
        <h2>מכירות חיות</h2>
        {orders.length > 0 ? (
          <div className="my-store-orders-list">
            {orders.map((order) => (
              <div key={order.id} className="my-store-order-item">
                <h3>{order.orderName || order.Order_Name}</h3>
                <p>סוג הזמנה: {order.orderType === 'one_time' ? 'חד פעמית' : 'מחזורית'}</p>
                <p>זמן שנותר: {calculateTimeRemaining(order)}</p>
                <button className="my-store-button my-store-item-button" onClick={() => handleOrderClick(order.id)}>צפה בהזמנה</button>
              </div>
            ))}
          </div>
        ) : (
          <p>אין הזמנות פעילות כרגע.</p>
        )}
        {isOwner && (
          <button className="my-store-small-button" onClick={handleCreateOrder}>עבור לאזור הדפי מכירה שלי</button>
        )}
      </div>

      <div className="my-store-description-section">
        <h2>מידע נוסף</h2>
        {editingMoreInfo && isOwner ? (
          <div>
            <textarea
              value={storeMoreInfo}
              onChange={(e) => setStoreMoreInfo(e.target.value)}
              rows={5}
            ></textarea>
            <button className="my-store-button" onClick={handleMoreInfoSave}>שמור</button>
          </div>
        ) : (
          <div>
            <p>{storeMoreInfo || 'עדיין לא הוזן תיאור לחנות.'}</p>
            {isOwner && (
              <button className="my-store-small-button" onClick={handleMoreInfoEdit}>ערוך תיאור</button>
            )}
          </div>
        )}
      </div>

      {/* Contact Us Section */}
      <div className="my-store-contact-section">
        <h2>צרו קשר</h2>
        {phoneNumber ? (
          <div className="contact-buttons">
            <div>
                <a href={`tel:${businessPhone}`} className="contact-button phone-button">
                    <FaPhoneAlt className="contact-icon" /> {businessPhone}
                </a>   
            </div>
         
            <div>
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="contact-button whatsapp-button">
                <FaWhatsapp className="contact-icon" /> WhatsApp
            </a>
            </div>
          </div>
        ) : (
          <p>מספר טלפון לא זמין.</p>
        )}
      </div>

      <div className="my-store-products-section">
        <h2>המוצרים שלי</h2>
        {products.length > 0 ? (
          <div className="my-store-products-list">
            {products.map((product) => (
              <div key={product.id} className="my-store-product-item">
                {product.images && product.images[0] && (
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    onClick={() => handleProductClick(product.id)}
                  />
                )}
                <h3>{product.name}</h3>
                <p>₪{product.price}</p>
                {isOwner ? (
                  <button className="my-store-button my-store-item-button" onClick={() => handleProductClick(product.id)}>צפה מוצר</button>
                ) : (
                  <button className="my-store-button my-store-item-button" onClick={() => handleProductClick(product.id)}>צפה במוצר</button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p>אין מוצרים להצגה.</p>
        )}
        {isOwner && (
          <button className="my-store-small-button" onClick={handleAddProduct}>עבור למוצרים שלי</button>
        )}
      </div>
    </div>
  );
};

export default MyStore;
