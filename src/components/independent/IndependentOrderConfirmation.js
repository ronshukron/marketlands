import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import LoadingSpinner from '../LoadingSpinner';
import Swal from 'sweetalert2';

const IndependentOrderConfirmation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId, orderName, items = [], total = 0 } = location.state || {};
  const [loading, setLoading] = useState(false);

  const isEmpty = !items || items.length === 0;

  const handleSubmit = async () => {
    if (isEmpty) {
      Swal.fire('אין פריטים', 'אין פריטים לביצוע תשלום.', 'warning');
      return;
    }

    setLoading(true);
    try {
      // TODO: replace with createCommunityThresholdPayment call
      console.log('Submitting independent payment', { orderId, items, total });
      Swal.fire('בקרוב', 'תשלום לקהילה יתבצע דרך שער עצמאי.', 'info');
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
    <div className="max-w-3xl mx-auto p-4" dir="rtl">
      <h1 className="text-xl font-bold mb-4">אישור הזמנה - {orderName || orderId}</h1>
      {isEmpty ? (
        <p className="text-gray-600">אין פריטים.</p>
      ) : (
        <div className="bg-white shadow rounded-md p-4">
          <div className="space-y-3">
            <div className="border rounded p-3">
              <div className="flex justify-between mb-2">
                <span className="font-medium">הזמנה: {orderId}</span>
                <span className="text-blue-600">₪{Number(total).toFixed(2)}</span>
              </div>
              <ul className="text-sm text-gray-700 list-disc pr-5">
                {items.map((item, idx) => (
                  <li key={`${item.id}_${idx}`}>
                    {item.name} × {item.quantity} — ₪{(item.price * item.quantity).toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex justify-between items-center mt-4">
            <span className="font-semibold">סה"כ:</span>
            <span className="font-bold text-blue-600">₪{Number(total).toFixed(2)}</span>
          </div>
          <div className="mt-4">
            <button onClick={handleSubmit} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded">
              לתשלום קהילתי (סף מינימום)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IndependentOrderConfirmation; 