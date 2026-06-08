import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import { collection, addDoc, getDoc, doc } from 'firebase/firestore';
import { db, storage } from '../../firebase/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Swal from 'sweetalert2';
import './CreateOrderForBusiness.css';
import communityToRegion from '../../utils/communityToRegion';
import usePickupSpots from '../../hooks/usePickupSpots';
import LoadingSpinner from '../LoadingSpinner';

// Add this custom style to the component for better radio and checkbox appearance
const customInputStyle = `
  appearance-none h-5 w-5 border border-gray-300 rounded-full 
  checked:bg-blue-500 checked:border-transparent focus:outline-none 
  cursor-pointer transition-all duration-200 ease-in-out relative
  after:content-[''] after:w-2.5 after:h-2.5 after:rounded-full 
  after:absolute after:top-1/2 after:left-1/2 after:transform 
  after:-translate-x-1/2 after:-translate-y-1/2 after:bg-white 
  after:opacity-0 checked:after:opacity-100
`;

const customCheckboxStyle = `
  appearance-none h-5 w-5 border border-gray-300 rounded 
  checked:bg-blue-500 checked:border-transparent focus:outline-none 
  cursor-pointer transition-all duration-200 ease-in-out relative
  after:content-[''] after:w-2 after:h-3.5 after:border-white
  after:border-r-2 after:border-b-2 after:absolute after:rotate-45
  after:left-[6px] after:top-[2px] after:opacity-0 checked:after:opacity-100
`;

const CreateOrderForBusiness = () => {
  const { state } = useLocation();
  const { selectedProducts } = state || {};
  const { currentUser } = useAuth();
  const { pickupSpots, loaded: pickupSpotsLoaded } = usePickupSpots();
  const [orderName, setOrderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [orderMode, setOrderMode] = useState('classic');
  const [orderType, setOrderType] = useState('one_time'); // 'one_time' or 'recurring'
  const [imageFile, setImageFile] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('commission'); // 'commission' or 'free'
  const [selectedPaymentApps, setSelectedPaymentApps] = useState([]); // ['paybox', 'bit']
  const [payboxLink, setPayboxLink] = useState('');
  const [requestAddress, setRequestAddress] = useState(false);
  const [schedule, setSchedule] = useState([
    { day: 'ראשון', active: false, startTime: '', endTime: '' },
    { day: 'שני', active: false, startTime: '', endTime: '' },
    { day: 'שלישי', active: false, startTime: '', endTime: '' },
    { day: 'רביעי', active: false, startTime: '', endTime: '' },
    { day: 'חמישי', active: false, startTime: '', endTime: '' },
    { day: 'שישי', active: false, startTime: '', endTime: '' },
    { day: 'שבת', active: false, startTime: '', endTime: '' },
  ]);
  const [isFarmerOrder, setIsFarmerOrder] = useState(true);
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [bitPhoneNumber, setBitPhoneNumber] = useState('');
  const [minimumOrderAmount, setMinimumOrderAmount] = useState('');
  const [description, setDescription] = useState('');
  const [shippingDateStart, setShippingDateStart] = useState('');
  const [shippingDateEnd, setShippingDateEnd] = useState('');
  const [dateError, setDateError] = useState('');
  const [formValid, setFormValid] = useState(true);
  const navigate = useNavigate();
  const [selectedPickupSpots, setSelectedPickupSpots] = useState([]);
  // Per-pickup-spot ending times: { 'spotName': Date }
  const [endingTimeByPickupSpot, setEndingTimeByPickupSpot] = useState({});
  const isAlwaysOnGrocery = orderMode === 'always_on_grocery';

  useEffect(() => {
    if (!selectedProducts || selectedProducts.length === 0) {
      navigate('/business-products');
    }
  }, [selectedProducts, navigate]);

  const handleScheduleChange = (index, field, value) => {
    setSchedule((prevSchedule) => {
      const newSchedule = [...prevSchedule];
      newSchedule[index] = {
        ...newSchedule[index],
        [field]: value,
      };
      return newSchedule;
    });
  };

  // Handler for updating ending time for a specific pickup spot
  const handleEndingTimeChange = (spot, dateTimeString) => {
    setEndingTimeByPickupSpot((prev) => ({
      ...prev,
      [spot]: dateTimeString ? new Date(dateTimeString) : null,
    }));
  };

  // Apply the same ending time to all selected pickup spots
  const applyEndingTimeToAll = (dateTimeString) => {
    if (!dateTimeString) return;
    const newEndingTimes = {};
    selectedPickupSpots.forEach((spot) => {
      newEndingTimes[spot] = new Date(dateTimeString);
    });
    setEndingTimeByPickupSpot(newEndingTimes);
  };

  // Format a Date for datetime-local input
  const formatDateTimeLocal = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const validateDates = () => {
    // Clear previous errors
    setDateError('');
    
    // Check if both dates are provided
    if (!shippingDateStart || !shippingDateEnd) {
      setDateError('יש להזין תאריך התחלה וסיום למשלוח');
      setFormValid(false);
      return false;
    }
    
    // Check if end date is after start date
    const startDate = new Date(shippingDateStart);
    const endDate = new Date(shippingDateEnd);
    
    if (endDate < startDate) {
      setDateError('תאריך הסיום חייב להיות אחרי תאריך ההתחלה');
      setFormValid(false);
      return false;
    }
    
    setFormValid(true);
    return true;
  };

  const handleCreateOrder = async () => {
    if (loading) return;

    // Validate dates first for classic limited-time orders only.
    if (!isAlwaysOnGrocery && !validateDates()) {
      // Scroll to the date error
      const dateElement = document.getElementById('shippingDateStart');
      if (dateElement) {
        dateElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (!orderName.trim()) {
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אנא הזינו שם מודעה.',
      });
      return;
    }

    // Validate that all selected pickup spots have ending times
    if (!isAlwaysOnGrocery && orderType === 'one_time' && selectedPickupSpots.length > 0) {
      const spotsWithoutEndingTime = selectedPickupSpots.filter(
        (spot) => !endingTimeByPickupSpot[spot]
      );
      if (spotsWithoutEndingTime.length > 0) {
        Swal.fire({
          icon: 'error',
          title: 'שגיאה',
          text: `אנא הגדירו זמן סיום לכל נקודות האיסוף: ${spotsWithoutEndingTime.join(', ')}`,
        });
        return;
      }
    }

    // Always-on grocery also needs at least one community/pickup spot for storefront filtering.
    if (selectedPickupSpots.length === 0) {
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אנא בחרו לפחות נקודת איסוף אחת.',
      });
      return;
    }

    if (!isAlwaysOnGrocery && orderType === 'recurring') {
      const hasActiveSchedule = schedule.some(
        (day) => day.active && day.startTime && day.endTime
      );
      if (!hasActiveSchedule) {
        Swal.fire({
          icon: 'error',
          title: 'שגיאה',
          text: 'אנא בחרו לפחות יום ושעות פעילות המודעה.',
        });
        return;
      }
    }

    if (paymentMethod === 'free' && selectedPaymentApps.length === 0) {
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אנא בחרו לפחות אפליקציית תשלום אחת (ביט או פייבוקס).',
      });
      return;
    }

    if (
      paymentMethod === 'free' &&
      selectedPaymentApps.includes('paybox') &&
      !payboxLink.trim()
    ) {
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אנא הזינו קישור לפייבוקס.',
      });
      return;
    }

    if (paymentMethod === 'free' && selectedPaymentApps.includes('bit') && !bitPhoneNumber.trim()) {
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אנא הזינו מספר טלפון לתשלום בביט.',
      });
      return;
    }

    // Check if phone number is available if Bit is selected
    let phoneNumber = '';
    if (paymentMethod === 'free' && selectedPaymentApps.includes('bit')) {
      const userDoc = doc(db, 'businesses', currentUser.uid);
      const userSnap = await getDoc(userDoc);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        phoneNumber = userData.phone || '';
        if (!phoneNumber.trim()) {
          Swal.fire({
            icon: 'error',
            title: 'שגיאה',
            text: 'מספר הטלפון שלך לא נמצא במערכת. אנא עדכן את מספר הטלפון שלך בפרופיל.',
          });
          return;
        }
      } else {
        Swal.fire({
          icon: 'error',
          title: 'שגיאה',
          text: 'לא ניתן לאחזר את פרטי המשתמש שלך.',
        });
        return;
      }
    }

    // For backward compatibility, compute a single endingTime as the latest of all per-spot times
    let endingTime = null;
    if (!isAlwaysOnGrocery && orderType === 'one_time' && selectedPickupSpots.length > 0) {
      const allEndingTimes = selectedPickupSpots
        .map((spot) => endingTimeByPickupSpot[spot])
        .filter((t) => t instanceof Date && !isNaN(t.getTime()));
      if (allEndingTimes.length > 0) {
        endingTime = new Date(Math.max(...allEndingTimes.map((d) => d.getTime())));
      }
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
        phoneNumber = userData.phone || phoneNumber; // Ensure phoneNumber is set

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

      // Build endingTimeByPickupSpot map for Firestore (convert Date to Timestamp-compatible)
      const endingTimeByPickupSpotForDb = {};
      selectedPickupSpots.forEach((spot) => {
        const dt = endingTimeByPickupSpot[spot];
        if (dt instanceof Date && !isNaN(dt.getTime())) {
          endingTimeByPickupSpotForDb[spot] = dt;
        }
      });

      const commonOrderData = {
        businessEmail: currentUser.email,
        businessId: currentUser.uid,
        orderName,
        selectedProducts,
        Order_Time: currentTime,
        createdAt: currentTime,
        businessName,
        communityName,
        businessKind,
        region,
        imageUrl, // Include the image URL in the order document
        paymentMethod, // Include payment method
        paymentApps: selectedPaymentApps,
        payboxLink: payboxLink,
        phoneNumber: bitPhoneNumber, // Add the phone number to the order data
        requestAddress,
        isFarmerOrder: isFarmerOrder,
        areas: isFarmerOrder ? selectedAreas : [],
        minimumOrderAmount: minimumOrderAmount ? parseFloat(minimumOrderAmount) : 0,
        description,
        pickupSpots: selectedPickupSpots,
      };

      // Create the order document with additional fields
      const orderData = isAlwaysOnGrocery
        ? {
          ...commonOrderData,
          orderMode: 'always_on_grocery',
          orderType: 'always_on_grocery',
          alwaysOn: true,
          groceryStore: true,
          schedule: [],
          fulfillmentConfig: {
            type: 'community_delivery_schedule',
            allowCustomerDateSelection: true
          }
        }
        : {
          ...commonOrderData,
          orderMode: 'classic',
          endingTime: endingTime || null, // Legacy field for backward compatibility
          endingTimeByPickupSpot: endingTimeByPickupSpotForDb, // New per-spot ending times
          schedule: orderType === 'recurring' ? schedule : [],
          orderType, // Include order type
          shippingDateRange: {
            start: shippingDateStart,
            end: shippingDateEnd
          },
        };

      const docRef = await addDoc(collection(db, 'Orders'), orderData);

      Swal.fire({
        icon: 'success',
        title: 'המודעה נוצרה בהצלחה!',
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
        text: 'אירעה שגיאה בעת יצירת מודעה. נסו שוב מאוחר יותר.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentAppChange = (e) => {
    const { value, checked } = e.target;
    if (checked) {
      setSelectedPaymentApps([...selectedPaymentApps, value]);
    } else {
      setSelectedPaymentApps(selectedPaymentApps.filter((app) => app !== value));
    }
  };

  return (
    <div dir="rtl" className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-center mb-6"> יצירת מודעת מכירה חדשה</h1>
      
      {/* Main Form Container */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">סוג מודעה</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={`border rounded-lg p-4 cursor-pointer transition-colors ${orderMode === 'classic' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <input
                type="radio"
                name="orderMode"
                value="classic"
                checked={orderMode === 'classic'}
                onChange={(e) => setOrderMode(e.target.value)}
                className="ml-2"
              />
              <span className="font-medium">הזמנה מוגבלת בזמן</span>
              <p className="text-xs text-gray-500 mt-1">המודעה הקלאסית עם זמני סיום וטווח משלוח.</p>
            </label>
            <label className={`border rounded-lg p-4 cursor-pointer transition-colors ${isAlwaysOnGrocery ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}>
              <input
                type="radio"
                name="orderMode"
                value="always_on_grocery"
                checked={isAlwaysOnGrocery}
                onChange={(e) => setOrderMode(e.target.value)}
                className="ml-2"
              />
              <span className="font-medium">חנות מכולת קבועה</span>
              <p className="text-xs text-gray-500 mt-1">המוצרים זמינים כל עוד יש מלאי, והלקוח בוחר תאריך משלוח בקופה.</p>
            </label>
          </div>
        </div>

        {/* Order Name */}
        <div className="space-y-2">
          <label htmlFor="orderName" className="block text-sm font-medium text-gray-700">
            שם המודעה <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="orderName"
            value={orderName}
            placeholder="תות שדה פרימיום מהחקלאי"
            onChange={(e) => setOrderName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Order Type Selection */}
        {/* <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">בחרו סוג הזמנה:</p>
          <div className="flex gap-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="orderType"
                value="one_time"
                checked={orderType === 'one_time'}
                onChange={(e) => setOrderType(e.target.value)}
                className={customInputStyle}
              />
              <span className="text-sm text-gray-700">הזמנה חד פעמית</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="orderType"
                value="recurring"
                checked={orderType === 'recurring'}
                onChange={(e) => setOrderType(e.target.value)}
                className={customInputStyle}
              />
              <span className="text-sm text-gray-700">הזמנה חוזרת אוטומטית</span>
            </label>
          </div>
        </div> */}

        {/* Per-Pickup-Spot Ending Time Selection for One-time Orders */}
        {!isAlwaysOnGrocery && orderType === 'one_time' && selectedPickupSpots.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">
                זמן סיום הזמנות לפי נקודת איסוף: <span className="text-red-500">*</span>
              </p>
            </div>
            
            {/* Quick apply to all */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <label className="block text-sm font-medium text-blue-800 mb-2">
                החל זמן סיום אחיד לכל הנקודות:
              </label>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  onChange={(e) => applyEndingTimeToAll(e.target.value)}
                  className="flex-1 px-3 py-2 border border-blue-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Individual pickup spot ending times */}
            <div className="space-y-3">
              <p className="text-xs text-gray-500">או הגדירו זמן סיום שונה לכל נקודת איסוף:</p>
              {selectedPickupSpots.map((spot) => (
                <div key={spot} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="text-sm font-medium text-gray-700 min-w-[120px]">{spot}</span>
                  <input
                    type="datetime-local"
                    value={formatDateTimeLocal(endingTimeByPickupSpot[spot])}
                    onChange={(e) => handleEndingTimeChange(spot, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {endingTimeByPickupSpot[spot] && (
                    <span className="text-xs text-green-600">✓</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message when no pickup spots selected */}
        {!isAlwaysOnGrocery && orderType === 'one_time' && selectedPickupSpots.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              בחרו נקודות איסוף כדי להגדיר זמני סיום הזמנות
            </p>
          </div>
        )}

        {/* Schedule Selection for Recurring Orders */}
        {!isAlwaysOnGrocery && orderType === 'recurring' && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">
              בחרו את הימים והשעות שבהם ההזמנה תהיה פעילה: <span className="text-red-500">*</span>
            </h3>
            <div className="space-y-3">
              {schedule.map((daySchedule, index) => (
                <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-gray-50 rounded-md">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={daySchedule.active}
                      onChange={(e) => handleScheduleChange(index, 'active', e.target.checked)}
                      className={customCheckboxStyle}
                    />
                    <span className="text-sm font-medium w-16">{daySchedule.day}</span>
                  </label>
                  {daySchedule.active && (
                    <div className="flex items-center gap-2 text-sm">
                      <input
                        type="time"
                        value={daySchedule.startTime}
                        onChange={(e) => handleScheduleChange(index, 'startTime', e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded"
                      />
                      <span className="text-gray-500">עד</span>
                      <input
                        type="time"
                        value={daySchedule.endTime}
                        onChange={(e) => handleScheduleChange(index, 'endTime', e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Image Upload */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            העלו תמונה למודעה:
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0])}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        {/* Request Address Option */}
        {/* <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={requestAddress}
            onChange={(e) => setRequestAddress(e.target.checked)}
            className={customCheckboxStyle}
          />
          <span className="text-sm text-gray-700">
            בקש כתובת ממשתמשים בעת ביצוע ההזמנה
          </span>
        </label> */}

        {/* Payment Method Selection */}
        {/* <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">בחר שיטת תשלום:</p>
          <div className="flex flex-col sm:flex-row gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="paymentMethod"
                value="commission"
                checked={paymentMethod === 'commission'}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={customInputStyle}
              />
              <span className="text-sm text-gray-700">סליקת אשראי (כולל 2% עמלה)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="paymentMethod"
                value="free"
                checked={paymentMethod === 'free'}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={customInputStyle}
              />
              <span className="text-sm text-gray-700">תשלום בעזרת ביט\פייבוקס</span>
            </label>
          </div>
        </div> */}

        {/* Payment Apps Selection */}
        {paymentMethod === 'free' && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700 mt-3">
              בחרו אמצעי תשלום: <span className="text-red-500">*</span>
            </p>
            <div className="flex gap-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="paymentApps"
                  value="paybox"
                  checked={selectedPaymentApps.includes('paybox')}
                  onChange={handlePaymentAppChange}
                  className={customCheckboxStyle}
                />
                <span className="text-sm text-gray-700">פייבוקס</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="paymentApps"
                  value="bit"
                  checked={selectedPaymentApps.includes('bit')}
                  onChange={handlePaymentAppChange}
                  className={customCheckboxStyle}
                />
                <span className="text-sm text-gray-700">ביט</span>
              </label>
            </div>

            {selectedPaymentApps.includes('paybox') && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  קישור לדף פייבוקס: <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={payboxLink}
                  placeholder="הכנס קישור לפייבוקס"
                  onChange={(e) => setPayboxLink(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {selectedPaymentApps.includes('bit') && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  הזינו את מספר הטלפון לתשלום בביט: <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={bitPhoneNumber}
                  placeholder="הכנס מספר טלפון"
                  onChange={(e) => setBitPhoneNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                />
                <p className="text-xs text-gray-500">
                  * מספר זה יוצג ללקוחות לצורך ביצוע התשלום בביט
                </p>
              </div>
            )}
          </div>
        )}


        {/* Pickup Spot Selection */}
        <div className="mb-6">
          <label className="block text-gray-700 font-medium mb-2">נקודות איסוף</label>
          <div className="bg-white border border-gray-300 rounded-lg shadow-sm p-4">
            {!pickupSpotsLoaded ? (
              <div className="py-6">
                <LoadingSpinner />
              </div>
            ) : pickupSpots.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                לא נמצאו קהילות פעילות. פנו למנהל המערכת.
              </p>
            ) : (
              <>
                <div className="flex justify-end gap-2 mb-3 pb-3 border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setSelectedPickupSpots(pickupSpots.slice())}
                    className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    בחר הכל
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPickupSpots([])}
                    className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-200 rounded-md shadow-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors"
                  >
                    נקה הכל
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {pickupSpots.map((spot) => (
                    <div key={spot} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`spot-${spot}`}
                        checked={selectedPickupSpots.includes(spot)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPickupSpots([...selectedPickupSpots, spot]);
                          } else {
                            setSelectedPickupSpots(selectedPickupSpots.filter((s) => s !== spot));
                          }
                        }}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ml-3"
                      />
                      <label htmlFor={`spot-${spot}`} className="text-sm text-gray-800 select-none">
                        {spot}
                      </label>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>



        {/* Farmer Order Option */}
        {/* <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isFarmerOrder}
            onChange={(e) => setIsFarmerOrder(e.target.checked)}
            className={customCheckboxStyle}
          />
          <span className="text-sm text-gray-700">יצירת הזמנה לחקלאי</span>
        </label> */}

        {/* Areas Selection */}
        {/* {isFarmerOrder && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">
              בחר אזורי חלוקה: <span className="text-red-500">*</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {['צפון', 'מרכז', 'דרום', 'ירושלים', 'שרון', 'שפלה', 'יהודה ושומרון', 'אחר'].map((area) => (
                <label key={area} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    value={area}
                    checked={selectedAreas.includes(area)}
                    onChange={(e) => {
                      const { value, checked } = e.target;
                      if (checked) {
                        setSelectedAreas((prev) => [...prev, value]);
                      } else {
                        setSelectedAreas((prev) => prev.filter((a) => a !== value));
                      }
                    }}
                    className={customCheckboxStyle}
                  />
                  <span className="text-sm text-gray-700">{area}</span>
                </label>
              ))}
            </div>
          </div>
        )} */}

        {/* Minimum Order Amount */}
        <div className="form-group">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            סכום מינימום להזמנה (₪)
          </label>
          <input
            type="number"
            value={minimumOrderAmount}
            onChange={(e) => setMinimumOrderAmount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="השאר ריק אם אין סכום מינימום"
            min="0"
            step="0.01"
          />
        </div>

        {/* Description */}
        <div className="mb-6">
          <label className="block text-gray-700 mb-2" htmlFor="description">
            תיאור מודעה (אופציונלי)
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="הוסף תיאור, מידע על איסוף, או כל מידע אחר שהלקוחות צריכים לדעת"
            rows="4"
          />
        </div>

        {/* Shipping Date Range */}
        {!isAlwaysOnGrocery && (
        <div className="mb-6">
          <label className="block text-gray-700 mb-2">
            טווח תאריכים למשלוח <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1" htmlFor="shippingDateStart">
                מתאריך
              </label>
              <input
                id="shippingDateStart"
                type="date"
                value={shippingDateStart}
                onChange={(e) => {
                  setShippingDateStart(e.target.value);
                  if (shippingDateEnd) validateDates();
                }}
                className={`shadow appearance-none border ${dateError ? 'border-red-500' : 'border-gray-300'} rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 ${dateError ? 'focus:ring-red-500' : 'focus:ring-blue-500'}`}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1" htmlFor="shippingDateEnd">
                עד תאריך
              </label>
              <input
                id="shippingDateEnd"
                type="date"
                value={shippingDateEnd}
                onChange={(e) => {
                  setShippingDateEnd(e.target.value);
                  if (shippingDateStart) validateDates();
                }}
                className={`shadow appearance-none border ${dateError ? 'border-red-500' : 'border-gray-300'} rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 ${dateError ? 'focus:ring-red-500' : 'focus:ring-blue-500'}`}
                required
              />
            </div>
          </div>
          {dateError && (
            <p className="text-red-500 text-sm mt-1">{dateError}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            טווח התאריכים בו המוצרים יסופקו ללקוחות
          </p>
        </div>
        )}

        {isAlwaysOnGrocery && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-900">
            חנות קבועה לא דורשת זמן סיום או טווח משלוח. זמינות התאריכים תנוהל לפי לוחות המשלוחים לקהילות.
          </div>
        )}


        {/* Submit Button */}
        <button
          onClick={handleCreateOrder}
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'יוצר מודעה...' : (isAlwaysOnGrocery ? 'צור חנות קבועה' : 'צור מודעה')}
        </button>
      </div>
    </div>
  );
};

export default CreateOrderForBusiness;
