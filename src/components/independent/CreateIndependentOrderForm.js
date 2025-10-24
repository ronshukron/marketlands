import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp, getDoc, doc, updateDoc, getDocs, query, where, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import Swal from 'sweetalert2';
import { pickupSpots } from '../../data/pickupSpots';
import communityToRegion from '../../utils/communityToRegion';

const CreateIndependentOrderForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const selectedProducts = location.state?.selectedProducts || [];

  const [orderName, setOrderName] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState('');

  const [shippingDateStart, setShippingDateStart] = useState('');
  const [shippingDateEnd, setShippingDateEnd] = useState('');
  const [dateError, setDateError] = useState('');
  const [formValid, setFormValid] = useState(true);

  const [selectedPickupSpots, setSelectedPickupSpots] = useState([]);

  // Independent-specific fields
  const [minCommunityTotal, setMinCommunityTotal] = useState('');
  const [thresholdDeadlineDate, setThresholdDeadlineDate] = useState('');
  const [thresholdDeadlineTime, setThresholdDeadlineTime] = useState('');
  const [volunteerIncentive, setVolunteerIncentive] = useState('');
  const [volunteerWhatsappMessage, setVolunteerWhatsappMessage] = useState('');
  const [merchantMinOrderTotal, setMerchantMinOrderTotal] = useState('');
  const [whatsappImageFile, setWhatsappImageFile] = useState(null);
  const [whatsappImageUrl, setWhatsappImageUrl] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deadlineError, setDeadlineError] = useState('');
  
  // General WhatsApp group link - to be manually configured
  const GENERAL_WHATSAPP_GROUP_LINK = 'https://chat.whatsapp.com/KBkUDXJUw3n2v40JFxxLV1?mode=ems_copy_t'; 

  const validateDates = () => {
    setDateError('');
    if (!shippingDateStart || !shippingDateEnd) {
      setDateError('יש להזין תאריך התחלה וסיום למשלוח');
      setFormValid(false);
      return false;
    }
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

  const validateDeadline = (dateOverride = null, timeOverride = null) => {
    setDeadlineError('');
    
    const deadlineDate = dateOverride !== null ? dateOverride : thresholdDeadlineDate;
    const deadlineTime = timeOverride !== null ? timeOverride : thresholdDeadlineTime;
    
    if (!deadlineDate || !deadlineTime) {
      setDeadlineError('יש להזין תאריך ושעה לדדליין נכונים');
      return false;
    }
    if (!shippingDateStart) {
      setDeadlineError('יש להזין תאריך משלוח לפני בחירת דדליין');
      return false;
    }
    
    const combinedDeadline = new Date(`${deadlineDate}T${deadlineTime}`);
    // Shipping starts at midnight (00:00) of the shipping date
    const shippingStart = new Date(`${shippingDateStart}T08:00`);
    const now = new Date();
    
    // Check if deadline is more than 7 days in the future
    const diffFromNow = combinedDeadline - now;
    const daysFromNow = diffFromNow / (1000 * 60 * 60 * 24);
    
    if (daysFromNow > 7) {
      const deadlineFormatted = combinedDeadline.toLocaleString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      setDeadlineError(`הדדליין (${deadlineFormatted}) מרוחק מדי בעתיד. הדדליין לא יכול להיות יותר מ-7 ימים מהיום.`);
      return false;
    }
    
    // Calculate difference in hours between deadline and shipping
    const diffInMs = shippingStart - combinedDeadline;
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    
    if (diffInHours < 10) {
      const deadlineFormatted = combinedDeadline.toLocaleString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const shippingFormatted = shippingStart.toLocaleDateString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      
      if (diffInHours <= 0) {
        setDeadlineError(`הדדליין (${deadlineFormatted}) מאוחר או זהה לתאריך המשלוח (${shippingFormatted}). הדדליין חייב להיות לפחות 10 שעות לפני המשלוח.`);
      } else {
        setDeadlineError(`הפער בין הדדליין (${deadlineFormatted}) למשלוח (${shippingFormatted}) הוא ${diffInHours} שעות בלבד. נדרש פער של לפחות 10 שעות.`);
      }
      return false;
    }
    
    return true;
  };

  // Build full WhatsApp message with system data
  const buildFullWhatsappMessage = async (community) => {
    const userMessage = volunteerWhatsappMessage.trim();
    const combinedDeadline = new Date(`${thresholdDeadlineDate}T${thresholdDeadlineTime}`);
    
    // Format dates
    const deadlineStr = combinedDeadline.toLocaleString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const shippingStartStr = new Date(shippingDateStart).toLocaleDateString('he-IL');
    const shippingEndStr = new Date(shippingDateEnd).toLocaleDateString('he-IL');
    
    // Get WhatsApp group link for community
    let whatsappGroupLink = GENERAL_WHATSAPP_GROUP_LINK;
    try {
      const q = query(collection(db, 'communities'), where('name', '==', community));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const communityData = snap.docs[0].data();
        if (communityData.whatsappGroupLink) {
          whatsappGroupLink = communityData.whatsappGroupLink;
        }
      }
    } catch (e) {
      console.error('Failed to fetch community WhatsApp link', e);
    }
    
    // Build message
    // let message = `🌱 הזמנה קהילתית חדשה!\n\n`;
    let message = `\n\n`;
    message += `📦 ${orderName}\n\n`;
    
    if (userMessage) {
      message += `${userMessage}\n\n`;
    }
    
    message += `📅 תאריך סיום הזמנה: ${deadlineStr}\n`;
    message += `🚚 תאריכי משלוח: ${shippingStartStr} - ${shippingEndStr}\n`;
    // message += `💰 סכום מינימום לקהילה: ₪${minCommunityTotal}\n\n`;
    
    message += `🔗 לצפייה והזמנה: [קישור למודעה]\n\n`;
    
    if (whatsappGroupLink) {
      message += `👥 הצטרפו לקבוצת הוואטסאפ של הקהילה:\n${whatsappGroupLink}`;
    }
    
    return message;
  };

  // Show preview of WhatsApp message
  const handlePreviewMessage = async () => {
    if (!orderName.trim()) {
      Swal.fire({ icon: 'warning', title: 'חסר שם מודעה', text: 'אנא הזינו שם מודעה כדי לצפות בתצוגה מקדימה' });
      return;
    }
    if (!thresholdDeadlineDate || !thresholdDeadlineTime) {
      Swal.fire({ icon: 'warning', title: 'חסר תאריך סיום', text: 'אנא הזינו תאריך ושעה לדדליין' });
      return;
    }
    if (!shippingDateStart || !shippingDateEnd) {
      Swal.fire({ icon: 'warning', title: 'חסרים תאריכי משלוח', text: 'אנא הזינו תאריכי משלוח' });
      return;
    }
    if (!minCommunityTotal) {
      Swal.fire({ icon: 'warning', title: 'חסר סכום מינימום', text: 'אנא הזינו סכום מינימום לקהילה' });
      return;
    }
    
    // Show preview for first selected community or example
    const exampleCommunity = selectedPickupSpots.length > 0 ? selectedPickupSpots[0] : 'דוגמה';
    const fullMessage = await buildFullWhatsappMessage(exampleCommunity);
    
    Swal.fire({
      title: 'תצוגה מקדימה של הודעת וואטסאפ',
      html: `
        <div class="text-right" dir="rtl">
          <p class="text-sm text-gray-600 mb-3">דוגמה עבור קהילה: <strong>${exampleCommunity}</strong></p>
          ${whatsappImageFile ? `
            <div class="mb-3">
              <img src="${URL.createObjectURL(whatsappImageFile)}" alt="תמונת וואטסאפ" class="max-w-full h-auto rounded-lg border border-gray-200" style="max-height: 200px; margin: 0 auto;" />
            </div>
          ` : ''}
          <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-sm whitespace-pre-wrap text-right">
            ${fullMessage.replace(/\n/g, '<br>')}
          </div>
          <p class="text-xs text-gray-500 mt-3">* הקישור למודעה יתווסף אוטומטית לאחר יצירת המודעה</p>
          <p class="text-xs text-gray-500">* הקישור יכלול את שם הקהילה לסינון אוטומטי</p>
        </div>
      `,
      width: '600px',
      confirmButtonText: 'סגור'
    });
  };

  const handleCreate = async () => {
    if (saving) return;
    setError('');

    if (!orderName.trim()) {
      Swal.fire({ icon: 'error', title: 'שגיאה', text: 'אנא הזינו שם מודעה.' });
      return;
    }

    if (!validateDates()) {
      const dateElement = document.getElementById('shippingDateStart');
      if (dateElement) {
        dateElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (!minCommunityTotal || Number(minCommunityTotal) <= 0) {
      Swal.fire({ icon: 'error', title: 'שגיאה', text: 'אנא הזינו סכום מינימום קהילתי גדול מ-0.' });
      return;
    }

    if (!validateDeadline()) {
      const deadlineElement = document.getElementById('thresholdDeadlineDate');
      if (deadlineElement) {
        deadlineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      Swal.fire({ icon: 'error', title: 'שגיאה', text: deadlineError || 'אנא הזינו תאריך ושעה תקינים לדדליין.' });
      return;
    }

    setSaving(true);

    try {
      // Fetch business info
      let businessName = '';
      let communityName = '';
      let businessKind = '';
      let region = '';
      if (currentUser?.uid) {
        const bizRef = doc(db, 'businesses', currentUser.uid);
        const snap = await getDoc(bizRef);
        if (snap.exists()) {
          const data = snap.data();
          businessName = data.businessName || '';
          communityName = data.communityName || '';
          businessKind = data.businessKind || '';
          if (communityName) region = communityToRegion[communityName] || 'אחר';
        }
      }

      // Upload order image if provided (path aligned with Storage rules)
      let uploadedImageUrl = imageUrl;
      if (imageFile) {
        const storageRef = ref(
          storage,
          `businesses/${currentUser?.uid || 'anon'}/independent-orders/${Date.now()}_${imageFile.name}`
        );
        const snapshot = await uploadBytes(storageRef, imageFile);
        uploadedImageUrl = await getDownloadURL(snapshot.ref);
      }

      // Upload WhatsApp image if provided
      let uploadedWhatsappImageUrl = whatsappImageUrl;
      if (whatsappImageFile) {
        const storageRef = ref(
          storage,
          `businesses/${currentUser?.uid || 'anon'}/whatsapp-images/${Date.now()}_${whatsappImageFile.name}`
        );
        const snapshot = await uploadBytes(storageRef, whatsappImageFile);
        uploadedWhatsappImageUrl = await getDownloadURL(snapshot.ref);
      }

      // Combine date and time for deadline
      const combinedDeadline = new Date(`${thresholdDeadlineDate}T${thresholdDeadlineTime}`);

      const payload = {
        businessEmail: currentUser?.email || '',
        businessId: currentUser?.uid || '',
        businessName,
        communityName,
        businessKind,
        region,
        orderName,
        description,
        imageUrl: uploadedImageUrl,
        selectedProducts,
        shippingDateRange: { start: shippingDateStart, end: shippingDateEnd },
        pickupSpots: selectedPickupSpots,
        // Independent-specific
        mode: 'independent',
        paymentRoute: 'threshold',
        status: 'open',
        minCommunityTotal: Number(minCommunityTotal || 0),
        minAmount: Number(minCommunityTotal || 0),
        ...(merchantMinOrderTotal !== '' ? { merchantMinOrderTotal: Number(merchantMinOrderTotal) } : {}),
        endingTime: combinedDeadline,
        volunteerIncentive,
        volunteerWhatsappMessage, // Store user's custom text
        volunteerWhatsappMessageImage: uploadedWhatsappImageUrl,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'IndependentOrders'), payload);

      // Append this orderId to selected community docs in 'communities'
      try {
        if (Array.isArray(selectedPickupSpots) && selectedPickupSpots.length > 0) {
          await Promise.all(selectedPickupSpots.map(async (spotName) => {
            try {
              const q = query(collection(db, 'communities'), where('name', '==', spotName));
              const snap = await getDocs(q);
              if (!snap.empty) {
                await Promise.all(snap.docs.map((cDoc) => updateDoc(cDoc.ref, {
                  independentOrderIds: arrayUnion(docRef.id)
                })));
              }
            } catch (e) {
              console.error('Failed updating community with order id', spotName, e);
            }
          }));
        }
      } catch (e) {
        console.error('Batch update of communities failed', e);
      }

      // Create scheduled task for backend settlement processing
      try {
        const task = {
          taskType: 'settleIndependentOrder',
          orderId: docRef.id,
          scheduledFor: combinedDeadline,
          processed: false,
          createdAt: serverTimestamp(),
          ordername: orderName,
        };
        await addDoc(collection(db, 'independentScheduledTasks'), task);
      } catch (e) {
        console.error('Failed creating independent scheduled task', e);
        try {
          await updateDoc(doc(db, 'IndependentOrders', docRef.id), {
            status: 'canceled',
            updatedAt: serverTimestamp(),
            cancelReason: 'scheduled_task_creation_failed'
          });
        } catch (updateErr) {
          console.error('Failed to mark order as canceled after task failure', updateErr);
        }
        setSaving(false);
        Swal.fire({ icon: 'error', title: 'שגיאה', text: 'נכשלה יצירת משימה מתוזמנת למודעה. המודעה בוטלה.', confirmButtonText: 'הבנתי' });
        return;
      }

      Swal.fire({ icon: 'success', title: 'המודעה נוצרה בהצלחה!', showConfirmButton: false, timer: 1500 });

      navigate(`/independent/order/${docRef.id}`, { state: { order: { id: docRef.id, ...payload } } });
    } catch (err) {
      console.error('Error creating independent order:', err);
      setError(err.message || 'Failed to create order');
      Swal.fire({ icon: 'error', title: 'שגיאה', text: 'אירעה שגיאה בעת יצירת מודעה. נסו שוב מאוחר יותר.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6" dir="rtl">
      <h1 className="text-2xl font-bold text-center mb-6"> יצירת מודעת חקלאי עצמאי</h1>

      <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
        {/* Order Name */}
        <div className="space-y-2">
          <label htmlFor="orderName" className="block text-sm font-medium text-gray-700">
            שם המודעה <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="orderName"
            value={orderName}
            placeholder="ארגז ירקות מהחקלאי"
            onChange={(e) => setOrderName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Image Upload */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">העלו תמונה למודעה:</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0])}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">תיאור מודעה (אופציונלי)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="פרטי ההזמנה, פרטי איסוף, מידע ללקוחות"
            rows="4"
          />
        </div>

        {/* Shipping Date Range */}
        <div className="mb-2">
          <label className="block text-gray-700 mb-2">טווח תאריכים למשלוח <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1" htmlFor="shippingDateStart">מתאריך</label>
              <input
                id="shippingDateStart"
                type="date"
                value={shippingDateStart}
                onChange={(e) => { setShippingDateStart(e.target.value); if (shippingDateEnd) validateDates(); }}
                className={`shadow appearance-none border ${dateError ? 'border-red-500' : 'border-gray-300'} rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 ${dateError ? 'focus:ring-red-500' : 'focus:ring-blue-500'}`}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1" htmlFor="shippingDateEnd">עד תאריך</label>
              <input
                id="shippingDateEnd"
                type="date"
                value={shippingDateEnd}
                onChange={(e) => { setShippingDateEnd(e.target.value); if (shippingDateStart) validateDates(); }}
                className={`shadow appearance-none border ${dateError ? 'border-red-500' : 'border-gray-300'} rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 ${dateError ? 'focus:ring-red-500' : 'focus:ring-blue-500'}`}
                required
              />
            </div>
          </div>
          {dateError && <p className="text-red-500 text-sm mt-1">{dateError}</p>}
          <p className="text-xs text-gray-500 mt-1">טווח התאריכים בו המוצרים יסופקו ללקוחות</p>
        </div>

        {/* Pickup Spot Selection */}
        <div className="mb-2">
          <label className="block text-gray-700 font-medium mb-2">נקודות איסוף</label>
          <div className="bg.white border border-gray-300 rounded-lg shadow-sm p-4">
            <div className="flex justify-end gap-2 mb-3 pb-3 border-b border-gray-200">
              <button type="button" onClick={() => setSelectedPickupSpots(pickupSpots.slice())} className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700">בחר הכל</button>
              <button type="button" onClick={() => setSelectedPickupSpots([])} className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-200 rounded-md shadow-sm hover:bg-gray-300">נקה הכל</button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {pickupSpots.map((spot) => (
                <div key={spot} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`spot-${spot}`}
                    checked={selectedPickupSpots.includes(spot)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedPickupSpots([...selectedPickupSpots, spot]);
                      else setSelectedPickupSpots(selectedPickupSpots.filter((s) => s !== spot));
                    }}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ml-3"
                  />
                  <label htmlFor={`spot-${spot}`} className="text-sm text-gray-800 select-none">{spot}</label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Independent Threshold + Volunteer */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">סכום מינימום לקהילה (₪) <span className="text-red-500">*</span></label>
          <input type="number" min="0" value={minCommunityTotal} onChange={(e) => setMinCommunityTotal(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">דדליין לסף הקהילה <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">תאריך</label>
              <input 
                id="thresholdDeadlineDate"
                type="date" 
                value={thresholdDeadlineDate} 
                onChange={(e) => {
                  const newDate = e.target.value;
                  setThresholdDeadlineDate(newDate);
                  if (thresholdDeadlineTime && shippingDateStart) {
                    validateDeadline(newDate, thresholdDeadlineTime);
                  }
                }} 
                className={`w-full px-3 py-2 border ${deadlineError ? 'border-red-500' : 'border-gray-300'} rounded-md text-sm focus:outline-none focus:ring-2 ${deadlineError ? 'focus:ring-red-500' : 'focus:ring-blue-500'}`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">שעה</label>
              <select 
                value={thresholdDeadlineTime} 
                onChange={(e) => {
                  const newTime = e.target.value;
                  setThresholdDeadlineTime(newTime);
                  if (thresholdDeadlineDate && shippingDateStart) {
                    validateDeadline(thresholdDeadlineDate, newTime);
                  }
                }} 
                className={`w-full px-3 py-2 border ${deadlineError ? 'border-red-500' : 'border-gray-300'} rounded-md text-sm focus:outline-none focus:ring-2 ${deadlineError ? 'focus:ring-red-500' : 'focus:ring-blue-500'}`}
              >
                <option value="">בחר שעה</option>
                {Array.from({ length: 24 }, (_, i) => {
                  const hour = i.toString().padStart(2, '0');
                  return (
                    <React.Fragment key={i}>
                      <option value={`${hour}:00`}>{`${hour}:00`}</option>
                      <option value={`${hour}:30`}>{`${hour}:30`}</option>
                    </React.Fragment>
                  );
                })}
              </select>
            </div>
          </div>
          {deadlineError && <p className="text-red-500 text-sm mt-1">{deadlineError}</p>}
          <p className="text-xs text-gray-500 mt-1">
            ⚠️ הדדליין חייב להיות לפחות 10 שעות לפני תאריך המשלוח הראשון ולא יותר מ-7 ימים מהיום
          </p>
        </div>
        {/* <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">תמריץ למתנדבים (אופציונלי)</label>
          <input type="text" value={volunteerIncentive} onChange={(e) => setVolunteerIncentive(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline.none focus:ring-2 focus:ring-blue-500" />
        </div> */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">טקסט מותאם אישית להודעת וואטסאפ</label>
          <textarea 
            value={volunteerWhatsappMessage} 
            onChange={(e) => setVolunteerWhatsappMessage(e.target.value)} 
            rows={3} 
            placeholder="הוסף כאן טקסט מותאם אישית... המערכת תוסיף אוטומטית את פרטי ההזמנה, תאריכים וקישור לקבוצת הוואטסאפ"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
          />
          <p className="text-xs text-gray-500">המערכת תוסיף אוטומטית: תאריך סיום הזמנה, תאריכי משלוח, סכום מינימום וקישור לקבוצת וואטסאפ</p>
        </div>

        {/* WhatsApp Image Upload */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">תמונה להודעת וואטסאפ (אופציונלי)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setWhatsappImageFile(e.target.files[0])}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
          />
          {whatsappImageFile && (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              תמונה נבחרה: {whatsappImageFile.name}
            </div>
          )}
          <p className="text-xs text-gray-500">תמונה זו תצורף להודעת הוואטסאפ שתישלח למתנדבים</p>
        </div>

        {/* Preview Button */}
        <div>
          <button
            type="button"
            onClick={handlePreviewMessage}
            className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium py-2 px-4 rounded-lg border-2 border-blue-200 transition-colors flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            תצוגה מקדימה של הודעת וואטסאפ
          </button>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">סכום מינימום להזמנת סוחר (₪)</label>
          <input type="number" min="0" value={merchantMinOrderTotal} onChange={(e) => setMerchantMinOrderTotal(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-gray-500 mt-1">אם יוגדר, יחול רק על משתמשים עם סטטוס סוחר.</p>
        </div>

        {error && <div className="text-red-600">{error}</div>}

        <button onClick={handleCreate} disabled={saving} className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? 'יוצר מודעה…' : 'צור מודעה'}
        </button>
      </div>
    </div>
  );
};

export default CreateIndependentOrderForm; 