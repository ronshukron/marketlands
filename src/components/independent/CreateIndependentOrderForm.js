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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

    if (!thresholdDeadlineDate || !thresholdDeadlineTime) {
      Swal.fire({ icon: 'error', title: 'שגיאה', text: 'אנא הזינו תאריך ושעה לדדליין הסף הקהילתי.' });
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

      // Upload image if provided (path aligned with Storage rules)
      let uploadedImageUrl = imageUrl;
      if (imageFile) {
        const storageRef = ref(
          storage,
          `businesses/${currentUser?.uid || 'anon'}/independent-orders/${Date.now()}_${imageFile.name}`
        );
        const snapshot = await uploadBytes(storageRef, imageFile);
        uploadedImageUrl = await getDownloadURL(snapshot.ref);
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
        endingTime: combinedDeadline,
        volunteerIncentive,
        volunteerWhatsappMessage,
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">סכום מינימום לקהילה (₪) <span className="text-red-500">*</span></label>
            <input type="number" min="0" value={minCommunityTotal} onChange={(e) => setMinCommunityTotal(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">דדליין לסף הקהילה <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-600 mb-1">תאריך</label>
                <input type="date" value={thresholdDeadlineDate} onChange={(e) => setThresholdDeadlineDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">שעה</label>
                <input type="time" value={thresholdDeadlineTime} onChange={(e) => setThresholdDeadlineTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline.none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">תמריץ למתנדבים (אופציונלי)</label>
          <input type="text" value={volunteerIncentive} onChange={(e) => setVolunteerIncentive(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline.none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">טקסט וואטסאפ לשיתוף (אופציונלי)</label>
          <textarea value={volunteerWhatsappMessage} onChange={(e) => setVolunteerWhatsappMessage(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline.none focus:ring-2 focus:ring-blue-500" />
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