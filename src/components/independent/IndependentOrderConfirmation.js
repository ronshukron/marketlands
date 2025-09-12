import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import { pickupSpots, pickupSpotsData } from '../../data/pickupSpots';
import LoadingSpinner from '../LoadingSpinner';
import Swal from 'sweetalert2';

const IndependentOrderConfirmation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId, orderName, items = [], total = 0 } = location.state || {};
  const { userLoggedIn, currentUser } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userAddress, setUserAddress] = useState('');
  const [userDirections, setUserDirections] = useState('');
  const [selectedPickupSpot, setSelectedPickupSpot] = useState(() => {
    return localStorage.getItem('selectedPickupSpot') || '';
  });
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [formIsValid, setFormIsValid] = useState(false);

  const isEmpty = !items || items.length === 0;

  // Initialize user data if logged in
  useEffect(() => {
    if (userLoggedIn && currentUser) {
      setUserName(currentUser.name || '');
      setUserEmail(currentUser.email || '');
      setUserPhone(currentUser.phoneNumber || '');
    }
  }, [userLoggedIn, currentUser]);

  // Form validation
  useEffect(() => {
    const isValid = userName.trim() !== '' && 
                    userPhone.trim() !== '' && 
                    userEmail.trim() !== '' &&
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail) &&
                    selectedPickupSpot !== '' &&
                    agreeToTerms;
    setFormIsValid(isValid);
  }, [userName, userPhone, userEmail, selectedPickupSpot, agreeToTerms]);

  const handleSubmit = async () => {
    if (!formIsValid) {
      Swal.fire({
        icon: 'warning',
        title: 'נתונים חסרים',
        text: 'אנא מלא את כל השדות הנדרשים ואשר את תנאי השימוש',
        confirmButtonText: 'הבנתי'
      });
      return;
    }

    if (isEmpty) {
      Swal.fire('אין פריטים', 'אין פריטים לביצוע תשלום.', 'warning');
      return;
    }

    setLoading(true);
    try {
      // TODO: Call createCommunityThresholdPayment with proper payload
      const paymentPayload = {
        orderId,
        items,
        total,
        customerDetails: {
          name: userName,
          phone: userPhone,
          email: userEmail,
          address: userAddress,
          directions: userDirections,
          pickupSpot: selectedPickupSpot
        },
        selectedPickupSpot
      };

      console.log('Submitting independent payment', paymentPayload);
      
      // Placeholder for actual payment call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      Swal.fire({
        icon: 'success',
        title: 'תשלום נשלח',
        text: 'בקרוב יופעל תשלום קהילתי. תקבל עדכון כשהסף יושג.',
        confirmButtonText: 'הבנתי'
      }).then(() => {
        navigate('/', { 
          state: { 
            message: 'ההזמנה הקהילתי שלך נרשמה בהצלחה' 
          } 
        });
      });
    } catch (e) {
      console.error(e);
      Swal.fire('שגיאה', 'אירעה שגיאה בעת יצירת התשלום. נסו שוב מאוחר יותר.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!orderId && isEmpty) {
    return (
      <div className="max-w-3xl mx-auto p-4" dir="rtl">
        <h1 className="text-xl font-bold mb-4">אישור הזמנה - חקלאים עצמאיים</h1>
        <p className="text-gray-600">אין נתוני הזמנה. חזרו לטופס ההזמנה.</p>
        <button onClick={() => navigate(-1)} className="mt-2 bg-gray-200 hover:bg-gray-300 text-gray-900 py-2 px-3 rounded">חזרה</button>
      </div>
    );
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="bg-gray-50 min-h-screen py-8 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        <div className="bg-green-600 text-white px-6 py-4">
          <h1 className="text-2xl font-bold">אישור הזמנה קהילתית</h1>
          <p className="text-green-100 mt-1">{orderName || orderId}</p>
        </div>
        
        <div className="p-6">
          {isEmpty ? (
            <p className="text-gray-600">אין פריטים.</p>
          ) : (
            <>
              {/* Order Summary */}
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">פריטים בהזמנה</h2>
                <div className="bg-gray-50 rounded-lg p-4">
                  <ul className="space-y-3">
                    {items.map((item, idx) => (
                      <li key={`${item.id}_${idx}`} className="flex justify-between items-center">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-800">{item.name}</h3>
                          {item.selectedOption && (
                            <p className="text-sm text-gray-600">אופציה: {item.selectedOption}</p>
                          )}
                          <p className="text-sm text-gray-600">₪{item.price} × {item.quantity}</p>
                        </div>
                        <div className="font-medium text-gray-900">
                          ₪{(item.price * item.quantity).toFixed(2)}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-gray-200 mt-4 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">סה"כ:</span>
                      <span className="text-lg font-bold text-green-600">₪{Number(total).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Details Form */}
              <div className="border-t border-gray-200 pt-6 mb-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">פרטי הקונה</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="form-group">
                    <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-1">
                      שם מלא <span className="text-red-500">*</span>
                    </label>
                    <input 
                      id="userName"
                      type="text" 
                      placeholder="שם מלא" 
                      value={userName} 
                      onChange={(e) => setUserName(e.target.value)} 
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="userPhone" className="block text-sm font-medium text-gray-700 mb-1">
                      מספר טלפון <span className="text-red-500">*</span>
                    </label>
                    <input 
                      id="userPhone"
                      type="tel" 
                      placeholder="מספר טלפון" 
                      value={userPhone} 
                      onChange={(e) => setUserPhone(e.target.value)} 
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  
                  <div className="form-group md:col-span-2">
                    <label htmlFor="userEmail" className="block text-sm font-medium text-gray-700 mb-1">
                      כתובת אימייל <span className="text-red-500">*</span>
                    </label>
                    <input 
                      id="userEmail"
                      type="email" 
                      placeholder="כתובת אימייל" 
                      value={userEmail} 
                      onChange={(e) => setUserEmail(e.target.value)} 
                      required
                      readOnly={userLoggedIn}
                      className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${userLoggedIn ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    />
                    {userLoggedIn && (
                      <p className="mt-1 text-sm text-gray-500">
                        כתובת האימייל מקושרת לחשבון שלך ואינה ניתנת לשינוי
                      </p>
                    )}
                  </div>

                  {/* Pickup Spot Selection */}
                  <div className="form-group md:col-span-2">
                    <label htmlFor="pickupSpot" className="block text-sm font-medium text-gray-700 mb-1">
                      נקודת איסוף <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="pickupSpot"
                      value={selectedPickupSpot}
                      onChange={(e) => setSelectedPickupSpot(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      required
                    >
                      <option value="">בחר נקודת איסוף</option>
                      {pickupSpots.map((spot) => (
                        <option key={spot} value={spot}>
                          {spot}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-sm text-gray-500">
                      בחר את נקודת האיסוף הקרובה אליך. ההזמנה תתקדם רק אם הקהילה תגיע לסף המינימום.
                    </p>
                  </div>

                  {/* Optional Address */}
                  <div className="form-group md:col-span-2">
                    <label htmlFor="userAddress" className="block text-sm font-medium text-gray-700 mb-1">
                      כתובת (אופציונלי)
                    </label>
                    <input
                      id="userAddress"
                      type="text"
                      placeholder="כתובת מלאה"
                      value={userAddress} 
                      onChange={(e) => setUserAddress(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>

                  {/* Optional Directions */}
                  <div className="form-group md:col-span-2">
                    <label htmlFor="userDirections" className="block text-sm font-medium text-gray-700 mb-1">
                      הנחיות נוספות (אופציונלי)
                    </label>
                    <textarea
                      id="userDirections"
                      placeholder="הנחיות נוספות לחקלאי או למתנדב"
                      value={userDirections}
                      onChange={(e) => setUserDirections(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                </div>

                {/* Terms Agreement */}
                <div className="flex items-center mb-6">
                  <input
                    type="checkbox" 
                    id="agreeToTerms" 
                    checked={agreeToTerms}
                    onChange={(e) => setAgreeToTerms(e.target.checked)}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded ml-2"
                  />
                  <label htmlFor="agreeToTerms" className="text-sm text-gray-700">
                    קראתי ואני מסכים ל<Link to="/terms-of-service" target="_blank" className="text-green-600 hover:underline">תנאי השימוש</Link>
                  </label>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-4 rtl:space-x-reverse">
                  <button
                    onClick={handleSubmit}
                    disabled={!formIsValid}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    הירשם להזמנה קהילתית
                  </button>
                  <button
                    onClick={() => navigate(-1)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 px-4 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    חזרה
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default IndependentOrderConfirmation; 