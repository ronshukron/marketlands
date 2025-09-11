import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { useSaleMode } from '../../contexts/SaleModeContext';
import LoadingSpinner from '../LoadingSpinner';
import Swal from 'sweetalert2';

const IndependentOrderConfirmation = () => {
  const navigate = useNavigate();
  const { itemsByOrder, cartTotal, cartItems } = useCart();
  const { saleMode } = useSaleMode();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (saleMode !== 'independent') {
      navigate('/order-confirmation');
    }
  }, [saleMode, navigate]);

  const isEmpty = cartItems.length === 0;

  const handleSubmit = async () => {
    if (isEmpty) {
      Swal.fire('הסל ריק', 'אין פריטים בעגלה לביצוע תשלום.', 'warning');
      return;
    }

    // Placeholder for threshold payment flow
    setLoading(true);
    try {
      // Here we will call createCommunityThresholdPayment with aggregated items and selectedPickupSpot
      Swal.fire('בקרוב', 'תשלום לקהילה יתבצע דרך שער עצמאי.', 'info');
    } catch (e) {
      console.error(e);
      Swal.fire('שגיאה', 'אירעה שגיאה בעת יצירת התשלום. נסו שוב מאוחר יותר.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-3xl mx-auto p-4" dir="rtl">
      <h1 className="text-xl font-bold mb-4">אישור הזמנה - חקלאים עצמאיים</h1>
      {isEmpty ? (
        <p className="text-gray-600">העגלה ריקה.</p>
      ) : (
        <div className="bg-white shadow rounded-md p-4">
          <div className="space-y-3">
            {Object.entries(itemsByOrder).map(([orderId, data]) => (
              <div key={orderId} className="border rounded p-3">
                <div className="flex justify-between mb-2">
                  <span className="font-medium">הזמנה: {orderId}</span>
                  <span className="text-blue-600">₪{data.total.toFixed(2)}</span>
                </div>
                <ul className="text-sm text-gray-700 list-disc pr-5">
                  {data.items.map(item => (
                    <li key={item.uid}>
                      {item.name} × {item.quantity} — ₪{(item.price * item.quantity).toFixed(2)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center mt-4">
            <span className="font-semibold">סה"כ:</span>
            <span className="font-bold text-blue-600">₪{cartTotal.toFixed(2)}</span>
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