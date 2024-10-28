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
  const [selectedAreas, setSelectedAreas] = useState([]); // New state for selected areas
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

    if (selectedAreas.length === 0) {
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
        regions: selectedAreas, // Include the selected areas
        imageUrl, // Include the image URL in the order document
        paymentMethod, // Include payment method
        paymentApps: paymentMethod === 'free' ? selectedPaymentApps : [], // Include selected payment apps
        payboxLink: selectedPaymentApps.includes('paybox') ? payboxLink : '', // Include Paybox link if applicable
        phoneNumber: selectedPaymentApps.includes('bit') ? phoneNumber : '', // Include phone number if Bit is selected
        requestAddress,
        schedule: orderType === 'recurring' ? schedule : [],
        orderType, // Include order type
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
    <div className="create-order-for-business-container">
      <h1>יצירת הזמנה חדשה</h1>
      <div className="form-group">
        <label htmlFor="orderName">שם ההזמנה:</label>
        <input
          type="text"
          id="orderName"
          value={orderName}
          placeholder="הכנס שם להזמנה"
          onChange={(e) => setOrderName(e.target.value)}
        />
      </div>

      {/* Order Type Selection */}
      <div className="order-type-selection">
        <p>בחרו סוג הזמנה:</p>
        <label>
          <input
            type="radio"
            name="orderType"
            value="one_time"
            checked={orderType === 'one_time'}
            onChange={(e) => setOrderType(e.target.value)}
          />
          הזמנה חד פעמית
        </label>
        <label>
          <input
            type="radio"
            name="orderType"
            value="recurring"
            checked={orderType === 'recurring'}
            onChange={(e) => setOrderType(e.target.value)}
          />
          הזמנה חוזרת אוטומטית
        </label>
      </div>

      {/* Duration Selection */}
      {orderType === 'one_time' && (
        <>
          <p className="ending-time-explanation">
            אנא בחרו את משך הזמן עד סיום ההזמנה:
          </p>
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
        </>
      )}

      {/* Schedule Selection */}
      {orderType === 'recurring' && (
        <div className="order-schedule">
          <h3>בחרו את הימים והשעות שבהם ההזמנה תהיה פעילה:</h3>
          {schedule.map((daySchedule, index) => (
            <div key={index} className="day-schedule">
              <label>
                <input
                  type="checkbox"
                  checked={daySchedule.active}
                  onChange={(e) =>
                    handleScheduleChange(index, 'active', e.target.checked)
                  }
                />
                {daySchedule.day}
              </label>
              {daySchedule.active && (
                <div className="time-range">
                  <input
                    type="time"
                    value={daySchedule.startTime}
                    onChange={(e) =>
                      handleScheduleChange(index, 'startTime', e.target.value)
                    }
                  />
                  עד
                  <input
                    type="time"
                    value={daySchedule.endTime}
                    onChange={(e) =>
                      handleScheduleChange(index, 'endTime', e.target.value)
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Image upload */}
      <div className="form-group">
        <label>העלו תמונה להזמנה:</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files[0])}
        />
      </div>

      {/* Request Address Option */}
      <div className="request-address">
        <label>
          <input
            type="checkbox"
            checked={requestAddress}
            onChange={(e) => setRequestAddress(e.target.checked)}
          />
          בקש כתובת ממשתמשים בעת ביצוע ההזמנה
        </label>
      </div>

      {/* Payment method selection */}
      <div className="payment-method-selection">
        <p className="payment-method-explanation">בחרו את אמצעי התשלום להזמנה:</p>
        <label>
          <input
            type="radio"
            name="paymentMethod"
            value="commission"
            checked={paymentMethod === 'commission'}
            onChange={(e) => setPaymentMethod(e.target.value)}
          />
          תשלום דרך האתר (עם עמלה)
        </label>
        <label>
          <input
            type="radio"
            name="paymentMethod"
            value="free"
            checked={paymentMethod === 'free'}
            onChange={(e) => setPaymentMethod(e.target.value)}
          />
          תשלום דרך אפליקציות חינמיות (ביט או פייבוקס)
        </label>
      </div>

      {/* Payment apps selection */}
      {paymentMethod === 'free' && (
        <>
          <p className="payment-apps-explanation">
            בחרו את אפליקציות התשלום הרצויות:
          </p>
          <div className="payment-apps-selection">
            <label>
              <input
                type="checkbox"
                name="paymentApps"
                value="paybox"
                checked={selectedPaymentApps.includes('paybox')}
                onChange={handlePaymentAppChange}
              />
              פייבוקס
            </label>
            <label>
              <input
                type="checkbox"
                name="paymentApps"
                value="bit"
                checked={selectedPaymentApps.includes('bit')}
                onChange={handlePaymentAppChange}
              />
              ביט
            </label>
          </div>

          {/* Paybox link input */}
          {selectedPaymentApps.includes('paybox') && (
            <>
              <p>הזינו את הקישור לפייבוקס:</p>
              <input
                type="text"
                value={payboxLink}
                placeholder="הכנס קישור לפייבוקס"
                onChange={(e) => setPayboxLink(e.target.value)}
              />
            </>
          )}

          {/* Bit phone number notice */}
          {selectedPaymentApps.includes('bit') && (
            <>
              <p className="phone-number-notice">
                שימו לב: מספר הטלפון שלכם יוצג ללקוחות לצורך תשלום דרך ביט.
              </p>
            </>
          )}
        </>
      )}

      {/* Area Selection */}
      <div className="form-group">
        <label>בחרו את האזורים בהם תופיע ההזמנה:</label>
        <div className="areas-selection">
          {areas.map((area) => (
            <label key={area}>
              <input
                type="checkbox"
                value={area}
                checked={selectedAreas.includes(area)}
                onChange={(e) => {
                  const { value, checked } = e.target;
                  if (checked) {
                    setSelectedAreas([...selectedAreas, value]);
                  } else {
                    setSelectedAreas(selectedAreas.filter((a) => a !== value));
                  }
                }}
              />
              {area}
            </label>
          ))}
        </div>
      </div>

      <button onClick={handleCreateOrder} disabled={loading}>
        {loading ? 'יוצר הזמנה...' : 'צור הזמנה'}
      </button>
    </div>
  );
};

export default CreateOrderForBusiness;
