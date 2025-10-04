import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where, doc, getDoc, orderBy, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import Swal from 'sweetalert2';
import { cancelVolunteer } from '../../services/independentAdminService';

const MyVolunteerSpots = () => {
  const { currentUser, userLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [volunteers, setVolunteers] = useState([]);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  useEffect(() => {
    if (!userLoggedIn) {
      navigate('/login', { state: { redirectTo: '/my-volunteer-spots' } });
      return;
    }
  }, [userLoggedIn, navigate]);

  useEffect(() => {
    const load = async () => {
      if (!currentUser?.uid) return;
      setLoading(true);
      try {
        const q = query(
          collection(db, 'volunteers'),
          where('userId', '==', currentUser.uid),
          orderBy('volunteeredAt', 'desc')
        );
        const snap = await getDocs(q);
        const items = [];
        for (const d of snap.docs) {
          const v = { id: d.id, ...d.data() };
          let order = null;
          try {
            if (v.orderId) {
              const oref = doc(db, 'IndependentOrders', v.orderId);
              const osnap = await getDoc(oref);
              if (osnap.exists()) {
                order = { id: osnap.id, ...osnap.data() };
              }
            }
          } catch (e) {}
          items.push({ volunteer: v, order });
        }
        setVolunteers(items);
      } catch (e) {
        console.error('Error loading volunteer spots', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser]);

  const handleCancel = async (vol) => {
    try {
      const res = await Swal.fire({
        icon: 'warning',
        title: 'בטל התנדבות?',
        text: 'ניתן להתנדב מחדש בכל עת. האם לבטל את ההתנדבות עבור מודעה זו? ',
        showCancelButton: true,
        confirmButtonText: 'בטל',
        cancelButtonText: 'חזור'
      });
      if (!res.isConfirmed) return;
      setActionLoadingId(vol.id);
      
      // Call backend to cancel volunteer
      await cancelVolunteer({
        volunteerId: vol.id,
        orderId: vol.orderId,
        businessId: vol.businessId
      });
      
      // Update local state
      await updateDoc(doc(db, 'volunteers', vol.id), {
        cancelled: true,
        cancelledAt: new Date().toISOString()
      });
      setVolunteers((prev) => prev.map((entry) => entry.volunteer.id === vol.id
        ? { ...entry, volunteer: { ...entry.volunteer, cancelled: true, cancelledAt: new Date().toISOString() } }
        : entry
      ));
      Swal.fire({ icon: 'success', title: 'ההתנדבות בוטלה', timer: 1500, showConfirmButton: false });
    } catch (e) {
      console.error('Failed to cancel volunteer', e);
      Swal.fire({ icon: 'error', title: 'שגיאה בביטול ההתנדבות' });
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!userLoggedIn) return null;
  if (loading) return <LoadingSpinner />;

  return (
    <div className="bg-gray-50 min-h-screen py-8 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        <div className="bg-blue-600 text-white px-6 py-4">
          <h1 className="text-2xl font-bold">נקודות האיסוף שלי</h1>
        </div>
        <div className="p-6 space-y-4">
          {volunteers.length === 0 ? (
            <div className="text-center text-gray-600">אין לך נקודות איסוף שיצרת</div>
          ) : (
            volunteers.map(({ volunteer, order }) => (
              <div key={volunteer.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-gray-900">{order?.orderName || `הזמנה ${volunteer.orderId}`}</div>
                    <div className="text-sm text-gray-700 mt-1">קהילה: {volunteer.community}</div>
                    <div className="text-sm text-gray-700">כתובת: {volunteer.address}</div>
                    {volunteer.locationInstructions && (
                      <div className="text-xs text-gray-500 mt-1">הנחיות: {volunteer.locationInstructions}</div>
                    )}
                    {volunteer.cancelled && (
                      <div className="text-xs text-red-600 mt-1">בוטל בתאריך {volunteer.cancelledAt ? new Date(volunteer.cancelledAt).toLocaleString('he-IL') : ''}</div>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(volunteer.volunteeredAt).toLocaleString('he-IL')}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {order && (
                    <button onClick={() => navigate(`/independent/order/${order.id}`, { state: { order } })} className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
                      לצפייה במודעה
                    </button>
                  )}
                  <button onClick={() => navigate('/volunteer-share-success', { state: { orderId: order?.id || volunteer.orderId, orderName: order?.orderName, volunteerInfo: volunteer } })} className="px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700">
                    שיתוף וואטסאפ
                  </button>
                  <button
                    onClick={() => handleCancel(volunteer)}
                    disabled={!!volunteer.cancelled || actionLoadingId === volunteer.id}
                    className={`px-3 py-2 rounded-md text-sm ${volunteer.cancelled ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-red-50 text-red-700 hover:bg-red-100'} ${actionLoadingId === volunteer.id ? 'opacity-60 cursor-wait' : ''}`}
                  >
                    בטל התנדבות
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default MyVolunteerSpots; 