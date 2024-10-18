import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import { collection, addDoc, getDoc, doc } from 'firebase/firestore';
import { db, storage } from '../../firebase/firebase'; // Import storage
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; // Import storage functions
import Swal from 'sweetalert2';
import './CreateOrderForBusiness.css';
import communityToRegion from '../../utils/communityToRegion'; // Import communityToRegion mapping

const CreateOrderForBusiness = () => {
  const { state } = useLocation();
  const { selectedProducts } = state || {};
  const { currentUser } = useAuth();
  const [orderName, setOrderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState('');
  const [imageFile, setImageFile] = useState(null); // State for the uploaded image file
  const navigate = useNavigate();

  useEffect(() => {
    if (!selectedProducts || selectedProducts.length === 0) {
      navigate('/business-products'); // Redirect if no products were selected
    }
  }, [selectedProducts, navigate]);

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
    if (!orderName.trim()) {
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אנא הזינו שם להזמנה.',
      });
      return;
    }

    if (!selectedDuration) {
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אנא בחרו משך זמן להזמנה.',
      });
      return;
    }

    const endingTime = calculateEndingDate(selectedDuration);
    if (!endingTime) {
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'משך הזמן שנבחר אינו תקין.',
      });
      return;
    }

    setLoading(true);

    try {
      // Fetch business data from Firestore
      const userDoc = doc(db, 'businesses', currentUser.uid);
      const userSnap = await getDoc(userDoc);
      let businessName = '';
      let communityName = '';
      let businessKind = '';
      let region = '';
      if (userSnap.exists()) {
        const userData = userSnap.data();
        businessName = userData.businessName;
        communityName = userData.communityName || '';
        businessKind = userData.businessKind || '';
        // Map community to region
        if (communityName) {
          region = communityToRegion[communityName] || 'אחר';
        }
      }

      const currentTime = new Date();

      let imageUrl = '';
      if (imageFile) {
        // Upload image to Firebase Storage
        const storageRef = ref(
          storage,
          `products/${currentUser.uid}/${Date.now()}_${imageFile.name}`
        );
        const snapshot = await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(snapshot.ref);
      }

      // Create the order document with additional fields
      const orderData = {
        businessEmail: currentUser.email,
        businessId: currentUser.uid,
        orderName,
        selectedProducts,
        createdAt: currentTime,
        endingTime, // Include ending time in the order document
        businessName,
        communityName,
        businessKind,
        region,
        imageUrl, // Include the image URL in the order document
      };

      const docRef = await addDoc(collection(db, 'Orders'), orderData);

      Swal.fire({
        icon: 'success',
        title: 'ההזמנה נוצרה בהצלחה!',
        text: 'תוכלו לנהל את ההזמנה בלוח ההזמנות.',
        showConfirmButton: false,
        timer: 2000,
      });

      navigate(`/order-form-business/${docRef.id}`);
    } catch (error) {
      console.error('Error creating order:', error);
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אירעה שגיאה בעת יצירת ההזמנה. נסו שוב מאוחר יותר.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-order-for-business-container">
      <h1>יצירת הזמנה חדשה</h1>
      <input
        type="text"
        value={orderName}
        placeholder="הכנס שם להזמנה"
        onChange={(e) => setOrderName(e.target.value)}
      />

      {/* Select for order duration */}
      <p className="ending-time-explanation">אנא בחרו את משך הזמן עד סיום ההזמנה:</p>
      <select
        className="duration-select"
        value={selectedDuration}
        onChange={(e) => setSelectedDuration(e.target.value)}
      >
        <option value="" disabled>
          בחרו משך זמן
        </option>
        <option value="3_days">3 ימים</option>
        <option value="5_days">5 ימים</option>
        <option value="1_week">שבוע</option>
        <option value="2_weeks">שבועיים</option>
        <option value="1_month">חודש</option>
      </select>

      {/* Image upload */}
      <p className="image-upload-explanation">העלו תמונה להזמנה:</p>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setImageFile(e.target.files[0])}
      />

      <button onClick={handleCreateOrder} disabled={loading}>
        {loading ? 'יוצר הזמנה...' : 'צור הזמנה'}
      </button>
    </div>
  );
};

export default CreateOrderForBusiness;
