import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import { pickupSpots } from '../../data/pickupSpots';
import LoadingSpinner from '../LoadingSpinner';
import Swal from 'sweetalert2';
import axios from 'axios';
import { functionsEndpoint } from '../../utils/functionsClient';

const VolunteerPickupSpot = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, userLoggedIn } = useAuth();
  const order = useMemo(() => location.state?.order || null, [location.state]);
  
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    community: '',
    address: '',
    locationInstructions: ''
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [orderData, setOrderData] = useState(order);
  const [lockedCommunity, setLockedCommunity] = useState('');
  
  // Community dropdown states
  const [filteredSpots, setFilteredSpots] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef(null);

  // Require login to volunteer - gated UI handled in render

  // Load user's community from profile and lock it
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!userLoggedIn || !currentUser?.uid) return;
      setProfileLoading(true);
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          const userCommunityName = (data.communityName || '').trim();
          const finalCommunity = userCommunityName === 'הכל' ? '' : userCommunityName;
          setLockedCommunity(finalCommunity);
          setForm(prev => ({ 
            ...prev, 
            community: finalCommunity,
            fullName: data.name || prev.fullName,
            phone: data.phone || prev.phone
          }));
        }
      } catch (e) {
        console.error('Failed to load user profile', e);
      } finally {
        setProfileLoading(false);
      }
    };
    loadUserProfile();
  }, [userLoggedIn, currentUser?.uid]);

  // Load community from localStorage on component mount (only if not locked)
  useEffect(() => {
    try {
      const savedCommunity = localStorage.getItem('selectedPickupSpot');
      if (!lockedCommunity && savedCommunity && !form.community) {
        setForm(prev => ({ ...prev, community: savedCommunity }));
      }
    } catch (error) {
      console.error('Error loading community from localStorage:', error);
    }
  }, [form.community, lockedCommunity]);

  // Handle outside click for suggestions dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter communities based on input (only when not locked)
  useEffect(() => {
    if (lockedCommunity) {
      setFilteredSpots([]);
      return;
    }
    if (form.community) {
      const filtered = pickupSpots.filter(spot => 
        spot.toLowerCase().includes(form.community.toLowerCase())
      );
      setFilteredSpots(filtered);
    } else {
      setFilteredSpots([]);
    }
  }, [form.community, lockedCommunity]);

  // Fetch order data if not provided in navigation state
  React.useEffect(() => {
    if (!orderData && orderId) {
      setLoading(true);
      const fetchOrder = async () => {
        try {
          const orderRef = doc(db, 'IndependentOrders', orderId);
          const snap = await getDoc(orderRef);
          if (snap.exists()) {
            setOrderData({ id: orderId, ...snap.data() });
          } else {
            Swal.fire('שגיאה', 'הזמנה לא נמצאה', 'error');
            navigate('/');
          }
        } catch (error) {
          console.error('Error fetching order:', error);
          Swal.fire('שגיאה', 'אירעה שגיאה בטעינת נתוני ההזמנה', 'error');
          navigate('/');
        } finally {
          setLoading(false);
        }
      };
      fetchOrder();
    }
  }, [orderData, orderId, navigate]);

  function onChange(e) {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
  }

  const handleCommunityChange = (e) => {
    if (lockedCommunity) return; // prevent edits when locked
    const value = e.target.value;
    setForm(prev => ({ ...prev, community: value }));
    setShowSuggestions(true);
    
    // Save to localStorage as the user types
    try {
      if (value) {
        localStorage.setItem('selectedPickupSpot', value);
      } else {
        localStorage.removeItem('selectedPickupSpot');
      }
    } catch (error) {
      console.error('Error saving community to localStorage:', error);
    }
  };

  const handleSelectCommunity = (spot) => {
    if (lockedCommunity) return; // prevent selection when locked
    setForm(prev => ({ ...prev, community: spot }));
    setShowSuggestions(false);
    
    // Save selected community to localStorage
    try {
      localStorage.setItem('selectedPickupSpot', spot);
    } catch (error) {
      console.error('Error saving community to localStorage:', error);
    }
  };

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    
    // Validate form
    if (!form.fullName.trim() || !form.phone.trim() || !form.address.trim()) {
      Swal.fire('שגיאה', 'אנא מלא את כל השדות הנדרשים', 'warning');
      setLoading(false);
      return;
    }

    if (!currentUser?.uid) {
      Swal.fire('התחברות נדרשת', 'יש להתחבר לפני התנדבות לנקודת איסוף', 'info');
      setLoading(false);
      navigate('/login', { state: { redirectTo: `/independent/volunteer/${orderId}` } });
      return;
    }

    // Enforce locked community on submit
    const communityValue = lockedCommunity || form.community.trim();
    if (!communityValue) {
      Swal.fire('שגיאה', 'לא נמצאה קהילה בפרופיל המשתמש. אנא עדכן/י את הקהילה בהרשמה ונסו שוב.', 'warning');
      setLoading(false);
      return;
    }

    // Validate community is allowed by farmer
    if (!orderData?.pickupSpots?.includes(communityValue)) {
      Swal.fire({
        icon: 'warning',
        title: 'הקהילה שלך לא נכללת בהזמנה זו',
        html: `
          <p>החקלאי בחר להגביל את ההזמנה לקהילות מסוימות.</p>
          <p class="mt-2">הקהילות הכלולות בהזמנה:</p>
          <p class="mt-1 text-sm text-gray-600">${orderData?.pickupSpots?.join(', ') || 'לא נמצאו קהילות'}</p>
        `,
        confirmButtonText: 'הבנתי'
      });
      setLoading(false);
      return;
    }

    setSaving(true);
    try {
      // Create volunteer document in main volunteers collection
      const volunteerData = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        community: communityValue,
        address: form.address.trim(),
        locationInstructions: form.locationInstructions.trim(),
        volunteeredAt: new Date().toISOString(),
        userId: currentUser?.uid || null,
        orderId: orderId // Reference to the independent order
      };

      // Add volunteer to the main volunteers collection
      const volunteersRef = collection(db, 'volunteers');
      const volunteerDoc = await addDoc(volunteersRef, volunteerData);

      // Call backend function to update the independent order
      try {
        const url = functionsEndpoint('updateIndependentOrderVolunteer');
        console.log('url', url);
        await axios.post(url, {
          orderId,
          volunteerId: volunteerDoc.id,
          volunteerInfo: {
            id: volunteerDoc.id,
            fullName: form.fullName.trim(),
            phone: form.phone.trim(),
            community: communityValue,
            address: form.address.trim(),
            locationInstructions: form.locationInstructions.trim(),
            volunteeredAt: new Date().toISOString()
          }
        });
      } catch (error) {
        throw new Error('Failed to update order with volunteer info');
      }

      // Show success message and navigate to WhatsApp share
      Swal.fire({
        icon: 'success',
        title: 'תודה על ההתנדבות!',
        text: 'פרטיך נשמרו בהצלחה. כעת תוכל לשתף את ההזמנה בוואטסאפ כדי לעזור להגיע לסף המינימום.',
        confirmButtonText: 'המשך לשיתוף'
      }).then(() => {
        // Navigate to WhatsApp share screen
        navigateToWhatsAppShare();
      });

    } catch (error) {
      console.error('Error saving volunteer data:', error);
      Swal.fire('שגיאה', 'אירעה שגיאה בשמירת הנתונים. אנא נסה שוב.', 'error');
    } finally {
      setSaving(false);
      setLoading(false);
    }
  }

  function navigateToWhatsAppShare() {
    const shareMessage = encodeURIComponent(
      orderData?.volunteerWhatsappMessage ||
        `🌱 הצטרפו להזמנה קהילתית! 
        
אני מתנדב/ת לארח נקודת איסוף עבור הזמנה "${orderData?.orderName || orderId}" ב${(lockedCommunity || form.community)}.

📍 כתובת האיסוף: ${form.address}
${form.locationInstructions ? `🗺️ הנחיות נוספות: ${form.locationInstructions}` : ''}
💰 נדרש לגיע לסף מינימום לקהילה
⏰ זמן מוגבל!

הצטרפו עכשיו כדי שנוכל להזמין יחד תוצרת חקלאית איכותית! 🥕🍅`
    );
    
    const whatsappLink = `https://wa.me/?text=${shareMessage}`;
    
    // Navigate to a share confirmation page with WhatsApp link
    navigate('/volunteer-share-success', {
      state: {
        orderId,
        orderName: orderData?.orderName,
        volunteerInfo: { ...form, community: (lockedCommunity || form.community) },
        whatsappLink,
        shareMessage: decodeURIComponent(shareMessage)
      }
    });
  }

  if (loading || profileLoading) return <LoadingSpinner />;

  if (!userLoggedIn) {
    return (
      <div className="bg-gray-50 min-h-screen py-8 px-4" dir="rtl">
        <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-blue-600 text-white px-6 py-4">
            <h1 className="text-2xl font-bold">התנדבות לנקודת איסוף</h1>
            <p className="text-blue-100 mt-1">הזמנה: {orderData?.orderName || orderId}</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md p-4">
              <h2 className="font-semibold mb-1">נדרשת התחברות כדי להתנדב</h2>
              <p className="text-sm">כדי לשמור את פרטי ההתנדבות ולקבל עדכונים, יש להתחבר או להירשם.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/login', { state: { redirectTo: `/independent/volunteer/${orderId}` } })}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md transition-colors"
              >
                התחברות
              </button>
              <button
                onClick={() => navigate('/user-register', { state: { redirectTo: `/independent/volunteer/${orderId}` } })}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-3 px-4 rounded-md transition-colors"
              >
                הרשמה
              </button>
            </div>
            <p className="text-xs text-gray-500">נחזיר אותך לכאן מיד לאחר ההתחברות.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen py-8 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        <div className="bg-blue-600 text-white px-6 py-4">
          <h1 className="text-2xl font-bold">התנדבות לנקודת איסוף</h1>
          <p className="text-blue-100 mt-1">הזמנה: {orderData?.orderName || orderId}</p>
        </div>
        
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-2">למה להתנדב?</h2>
            <div className="bg-blue-50 rounded-lg p-4 mb-4">
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start">
                  <span className="text-blue-600 ml-2">•</span>
                  עזור לקהילה שלך להגיע לסף המינימום ולקבל תוצרת איכותית
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 ml-2">•</span>
                  תהיה איש הקשר המקומי לתושבי הקהילה
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 ml-2">•</span>
                  תקבל עדכונים ישירים על סטטוס ההזמנה
                </li>
              </ul>
            </div>
            
            {orderData?.volunteerIncentive && (
              <div className="bg-green-50 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-green-800 mb-1">תמריץ למתנדבים:</h3>
                <p className="text-green-700">{orderData.volunteerIncentive}</p>
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                  שם מלא <span className="text-red-500">*</span>
                </label>
                <input 
                  id="fullName"
                  name="fullName" 
                  type="text"
                  placeholder="שם מלא" 
                  value={form.fullName} 
                  onChange={onChange} 
                  required 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  מספר טלפון <span className="text-red-500">*</span>
                </label>
                <input 
                  id="phone"
                  name="phone" 
                  type="tel"
                  placeholder="מספר טלפון" 
                  value={form.phone} 
                  onChange={onChange} 
                  required 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="relative">
              <label htmlFor="community" className="block text-sm font-medium text-gray-700 mb-1">
                קהילה <span className="text-red-500">*</span>
              </label>
              <input 
                id="community"
                name="community" 
                type="text"
                placeholder="שם הקהילה או היישוב (חפש או בחר מהרשימה)" 
                value={lockedCommunity || (form.community === 'הכל' ? '' : form.community)} 
                onChange={handleCommunityChange} 
                onFocus={() => { if (!lockedCommunity) setShowSuggestions(true); }}
                required 
                readOnly={!!lockedCommunity}
                className={`w-full px-3 py-2 border ${lockedCommunity ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
              />
              
              {/* Suggestions dropdown */}
              {!lockedCommunity && showSuggestions && filteredSpots.length > 0 && (
                <div 
                  ref={suggestionRef}
                  className="absolute z-10 bg-white border border-gray-300 rounded-md mt-1 w-full max-h-40 overflow-y-auto shadow-lg"
                >
                  {filteredSpots.map((spot, index) => (
                    <div 
                      key={index} 
                      className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100 last:border-b-0"
                      onClick={() => handleSelectCommunity(spot)}
                    >
                      {spot}
                    </div>
                  ))}
                  {filteredSpots.length === 0 && form.community && (
                    <div className="px-4 py-2 text-gray-500 text-sm">
                      לא נמצאו תוצאות עבור "{form.community}"
                    </div>
                  )}
                </div>
              )}
              
              <p className="mt-1 text-sm text-gray-500">
                {lockedCommunity ? 'הקהילה נקבעה לפי הפרופיל שלך ולא ניתן לשנותה כאן.' : 'בחר את הקהילה שלך מהרשימה או חפש קהילה חדשה'}
              </p>
            </div>
            
            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                כתובת נקודת האיסוף <span className="text-red-500">*</span>
              </label>
              <input 
                id="address"
                name="address" 
                type="text"
                placeholder="כתובת מלאה לנקודת האיסוף" 
                value={form.address} 
                onChange={onChange} 
                required 
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                כתובת זו תהיה זמינה לתושבי הקהילה לאיסוף ההזמנה
              </p>
            </div>
            
            <div>
              <label htmlFor="locationInstructions" className="block text-sm font-medium text-gray-700 mb-1">
                הנחיות מיקום (אופציונלי)
              </label>
              <textarea 
                id="locationInstructions"
                name="locationInstructions" 
                placeholder="הנחיות נוספות למיקום: למשל - חניה, כניסה, זמני זמינות, וכו'" 
                value={form.locationInstructions} 
                onChange={onChange} 
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-vertical"
              />
              <p className="mt-1 text-sm text-gray-500">
                פרטים נוספים שיעזרו לאנשים למצוא ולהגיע לנקודת האיסוף
              </p>
            </div>
            
            <div className="flex gap-3 pt-4">
              <button 
                type="submit" 
                disabled={saving} 
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {saving ? 'שומר...' : 'התנדב כנקודת איסוף'}
              </button>
              <button 
                type="button"
                onClick={() => navigate(-1)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 px-4 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                חזרה
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default VolunteerPickupSpot; 