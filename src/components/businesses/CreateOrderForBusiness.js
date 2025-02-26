import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import { collection, addDoc, getDoc, doc } from 'firebase/firestore';
import { db, storage } from '../../firebase/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Swal from 'sweetalert2';
import './CreateOrderForBusiness.css';
import communityToRegion from '../../utils/communityToRegion';
// Assuming you have a utility file with area definitions
import areas from '../../utils/areas'; 

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
  const [orderName, setOrderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [orderType, setOrderType] = useState('one_time'); // 'one_time' or 'recurring'
  const [selectedDuration, setSelectedDuration] = useState('');
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
  const [isFarmerOrder, setIsFarmerOrder] = useState(false);
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [bitPhoneNumber, setBitPhoneNumber] = useState('');
  const navigate = useNavigate();

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

    if (orderType === 'one_time' && !selectedDuration) {
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אנא בחרו משך זמן להזמנה.',
      });
      return;
    }

    if (isFarmerOrder && selectedAreas.length === 0) {
      Swal.fire({
        icon: 'error',
        title: 'שגיאה',
        text: 'אנא בחרו לפחות אזור אחד.',
      });
      return;
    }

    if (orderType === 'recurring') {
      const hasActiveSchedule = schedule.some(
        (day) => day.active && day.startTime && day.endTime
      );
      if (!hasActiveSchedule) {
        Swal.fire({
          icon: 'error',
          title: 'שגיאה',
          text: 'אנא בחרו לפחות יום ושעות פעילות להזמנה.',
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

    const endingTime =
      orderType === 'one_time' ? calculateEndingDate(selectedDuration) : null;

    if (orderType === 'one_time' && !endingTime) {
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

      // Create the order document with additional fields
      const orderData = {
        businessEmail: currentUser.email,
        businessId: currentUser.uid,
        orderName,
        selectedProducts,
        Order_Time: currentTime,
        endingTime: endingTime || null,
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
        schedule: orderType === 'recurring' ? schedule : [],
        orderType, // Include order type
        isFarmerOrder: isFarmerOrder,
        areas: isFarmerOrder ? selectedAreas : [],
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
      <h1 className="text-2xl font-bold text-center mb-6">יצירת הזמנה חדשה</h1>
      
      {/* Main Form Container */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
        {/* Order Name */}
        <div className="space-y-2">
          <label htmlFor="orderName" className="block text-sm font-medium text-gray-700">
            שם ההזמנה:
          </label>
          <input
            type="text"
            id="orderName"
            value={orderName}
            placeholder="הכנס שם להזמנה"
            onChange={(e) => setOrderName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Order Type Selection */}
        <div className="space-y-2">
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
        </div>

        {/* Duration Selection for One-time Orders */}
        {orderType === 'one_time' && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">
              בחרו את משך הזמן עד סיום ההזמנה:
            </p>
            <select
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="" disabled>בחרו משך זמן</option>
              <option value="3_days">3 ימים</option>
              <option value="5_days">5 ימים</option>
              <option value="1_week">שבוע</option>
              <option value="2_weeks">שבועיים</option>
              <option value="1_month">חודש</option>
            </select>
          </div>
        )}

        {/* Schedule Selection for Recurring Orders */}
        {orderType === 'recurring' && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">בחרו את הימים והשעות שבהם ההזמנה תהיה פעילה:</h3>
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
            העלו תמונה להזמנה:
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0])}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        {/* Request Address Option */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={requestAddress}
            onChange={(e) => setRequestAddress(e.target.checked)}
            className={customCheckboxStyle}
          />
          <span className="text-sm text-gray-700">
            בקש כתובת ממשתמשים בעת ביצוע ההזמנה
          </span>
        </label>

        {/* Payment Method Selection */}
        <div className="space-y-2">
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
              <span className="text-sm text-gray-700">סליקת אשראי (כולל עמלה)</span>
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
        </div>

        {/* Payment Apps Selection */}
        {paymentMethod === 'free' && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">בחרו את אפליקציות התשלום הרצויות:</p>
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
                  הזינו את הקישור לפייבוקס:
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
                  הזינו את מספר הטלפון לתשלום בביט:
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

        {/* Farmer Order Option */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isFarmerOrder}
            onChange={(e) => setIsFarmerOrder(e.target.checked)}
            className={customCheckboxStyle}
          />
          <span className="text-sm text-gray-700">יצירת הזמנה לחקלאי</span>
        </label>

        {/* Areas Selection */}
        {isFarmerOrder && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">בחר אזורים:</p>
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
        )}

        {/* Submit Button */}
        <button
          onClick={handleCreateOrder}
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'יוצר הזמנה...' : 'צור הזמנה'}
        </button>
      </div>
    </div>
  );
};

export default CreateOrderForBusiness;
