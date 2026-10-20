import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/authContext';
import RefundRequestForm from './RefundRequestForm';
import { functionsEndpoint } from '../utils/functionsClient';
import { validateCustomerPhone } from '../utils/marketplaceCustomerValidation';
import { getRefundableLinesFromOrder } from '../utils/refundUtils';

const postGuestRefund = async (name, body) => {
  const response = await fetch(functionsEndpoint(name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'אירעה שגיאה. נסו שוב.');
  }
  return payload;
};

const RefundRequestPage = () => {
  const { currentUser } = useAuth();
  const [phone, setPhone] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState(null);
  const [step, setStep] = useState('lookup');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleLookup = async (event) => {
    event.preventDefault();
    const phoneResult = validateCustomerPhone(phone);
    if (!phoneResult.valid) {
      setError(phoneResult.message);
      return;
    }
    const trimmedOrderNumber = orderNumber.trim();
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(trimmedOrderNumber)) {
      setError('הזינו את מספר ההזמנה המלא, או לפחות 8 תווים ממנו.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = await postGuestRefund('lookupGuestRefundOrder', {
        phone,
        orderNumber: trimmedOrderNumber,
      });
      const found = payload.order;
      if (!found?.id || getRefundableLinesFromOrder(found).length === 0) {
        setError('לא נמצאו פריטים שאפשר לבקש עליהם זיכוי בהזמנה הזו.');
        return;
      }
      setOrder(found);
      setOrderNumber(trimmedOrderNumber);
      setStep('items');
    } catch (lookupError) {
      setError(lookupError.message || 'לא הצלחנו לאתר את ההזמנה.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData) => {
    setSubmitting(true);
    setError('');
    try {
      await postGuestRefund('submitGuestRefundRequest', {
        phone,
        orderNumber,
        reason: formData.reason,
        refundItems: (formData.refundItems || []).map((item) => ({
          lineId: item.lineId,
          refundPercent: item.refundPercent,
        })),
      });
      setStep('done');
    } catch (submitError) {
      setError(submitError.message || 'לא הצלחנו לשלוח את הבקשה.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main dir="rtl" className="mx-auto min-h-screen max-w-xl px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900">בקשת זיכוי</h1>
      <p className="mt-2 text-sm text-gray-600">
        אתרו את ההזמנה עם מספר הטלפון ומספר ההזמנה, בחרו פריטים, והזיכוי יאושר אוטומטית.
      </p>

      {currentUser && (
        <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
          מחוברים לחשבון? אפשר גם לבקש זיכוי מתוך{' '}
          <Link to="/my-orders" className="font-semibold underline">ההזמנות שלי</Link>
          . אם ההזמנה בוצעה בלי התחברות, המשיכו כאן.
        </p>
      )}

      {step === 'lookup' && (
        <form onSubmit={handleLookup} className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <label htmlFor="refund-phone" className="mb-1 block text-sm font-medium text-gray-700">טלפון</label>
            <input
              id="refund-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="05XXXXXXXX"
              className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label htmlFor="refund-order-number" className="mb-1 block text-sm font-medium text-gray-700">מספר הזמנה</label>
            <input
              id="refund-order-number"
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
              className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2"
              required
            />
            <p className="mt-1 text-xs text-gray-500">המספר המלא מאישור ההזמנה, או 8 התווים הראשונים שמופיעים בהזמנות שלי.</p>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center rounded-md bg-blue-600 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'מחפש הזמנה...' : 'המשך'}
          </button>
        </form>
      )}

      {step === 'items' && order && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="mb-4 text-sm text-gray-600">
            הזמנה #{order.id.slice(0, 8)} · ₪{Number(order.grandTotal || 0).toFixed(2)}
          </p>
          {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
          <RefundRequestForm
            orders={[order]}
            selectedOrderId={order.id}
            isSubmitting={submitting}
            onSubmit={handleSubmit}
            onCancel={() => {
              setStep('lookup');
              setOrder(null);
              setError('');
            }}
          />
        </div>
      )}

      {step === 'done' && (
        <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-6 text-center">
          <p className="text-lg font-bold text-green-900">הזיכוי אושר אוטומטית</p>
          <p className="mt-2 text-sm text-green-800">הסכום יופחת מהחיוב.</p>
          <Link to="/" className="mt-4 inline-flex h-11 items-center font-medium text-blue-700 underline">
            חזרה לחנות
          </Link>
        </div>
      )}
    </main>
  );
};

export default RefundRequestPage;
