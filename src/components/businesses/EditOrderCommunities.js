import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import usePickupSpots from '../../hooks/usePickupSpots';
import { getDeterministicCommunityColor } from '../../services/pickupSpotsService';
import LoadingSpinner from '../LoadingSpinner';

const EditOrderCommunities = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { pickupSpots, pickupSpotsData } = usePickupSpots();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [order, setOrder] = useState(null);
  const [selectedPickupSpots, setSelectedPickupSpots] = useState([]);

  useEffect(() => {
    const load = async () => {
      if (!currentUser || !orderId) return;
      setLoading(true);
      try {
        const orderSnap = await getDoc(doc(db, 'Orders', orderId));
        if (!orderSnap.exists()) throw new Error('הזמנה לא נמצאה');
        const orderData = { id: orderSnap.id, ...orderSnap.data() };
        const ownsOrder =
          orderData.businessId === currentUser.uid
          || orderData.businessEmail === currentUser.email;
        if (!ownsOrder) throw new Error('אין הרשאה לערוך הזמנה זו');
        setOrder(orderData);
        setSelectedPickupSpots(
          Array.isArray(orderData.pickupSpots) ? [...new Set(orderData.pickupSpots)] : []
        );
      } catch (error) {
        Swal.fire('שגיאה', error.message || 'טעינה נכשלה', 'error').then(() => navigate('/Business-DashBoard'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser, orderId, navigate]);

  const toggleSpot = (spot) => {
    setSelectedPickupSpots((prev) => (
      prev.includes(spot) ? prev.filter((name) => name !== spot) : [...prev, spot]
    ));
  };

  const handleSave = async () => {
    if (!order) return;
    if (selectedPickupSpots.length === 0) {
      Swal.fire('שגיאה', 'יש לבחור לפחות יישוב אחד', 'warning');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'Orders', order.id), {
        pickupSpots: [...new Set(selectedPickupSpots)],
        updatedAt: new Date(),
      });
      Swal.fire('נשמר', 'יישובי טופס ההזמנה עודכנו', 'success');
      navigate('/dashboard');
    } catch (error) {
      Swal.fire('שגיאה', error.message || 'שמירה נכשלה', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-5xl mx-auto p-6" dir="rtl">
      <div className="flex flex-wrap gap-3 mb-4 text-sm">
        <Link to={`/edit-order/${orderId}`} className="text-blue-600 hover:text-blue-800">
          עריכת מוצרים
        </Link>
        <span className="text-gray-300">|</span>
        <span className="text-gray-900 font-medium">עריכת יישובים</span>
      </div>

      <h1 className="text-2xl font-bold mb-2">עריכת יישובים בטופס הזמנה</h1>
      <p className="text-gray-600 mb-6">{order?.orderName || order?.name || order.id}</p>

      <div className="mb-4 bg-green-50 border border-green-200 rounded p-4">
        <p className="font-medium">נבחרו {selectedPickupSpots.length} יישובים</p>
        {selectedPickupSpots.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedPickupSpots.map((spot) => (
              <span
                key={spot}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm bg-white border border-green-300"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: pickupSpotsData[spot]?.color || getDeterministicCommunityColor(spot) }}
                />
                {spot}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-300 rounded-lg shadow-sm p-4 mb-6">
        <div className="flex justify-end gap-2 mb-3 pb-3 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setSelectedPickupSpots(pickupSpots.slice())}
            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            בחר הכל
          </button>
          <button
            type="button"
            onClick={() => setSelectedPickupSpots([])}
            className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            נקה הכל
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {pickupSpots.map((spot) => {
            const isSelected = selectedPickupSpots.includes(spot);
            return (
              <button
                key={spot}
                type="button"
                onClick={() => toggleSpot(spot)}
                className={`flex items-center gap-2 text-right p-3 rounded-lg border-2 transition ${
                  isSelected ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: pickupSpotsData[spot]?.color || getDeterministicCommunityColor(spot) }}
                />
                <span className="font-medium text-sm">{spot}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-green-600 text-white font-bold rounded hover:bg-green-700 disabled:opacity-50"
        >
          שמור שינויים
        </button>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="px-6 py-3 bg-gray-200 rounded hover:bg-gray-300"
        >
          ביטול
        </button>
      </div>
    </div>
  );
};

export default EditOrderCommunities;
