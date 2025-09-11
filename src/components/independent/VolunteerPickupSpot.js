import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

const VolunteerPickupSpot = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const order = useMemo(() => location.state?.order || null, [location.state]);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    community: '',
    address: ''
  });
  const [saving, setSaving] = useState(false);

  function onChange(e) {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      // TODO: Persist volunteer spot for orderId+community in DB.
      navigate(`/independent/order/${orderId}`, { replace: true });
    } finally {
      setSaving(false);
    }
  }

  const shareMessage = encodeURIComponent(
    order?.volunteerWhatsappMessage ||
      `אני מתנדב\ת לארח נקודת איסוף עבור הזמנה ${orderId}. הצטרפו כדי שנגיע לסף המינימום!`
  );
  const whatsappLink = `https://wa.me/?text=${shareMessage}`;

  return (
    <div className="max-w-3xl mx-auto p-4" dir="rtl">
      <h2 className="text-xl font-bold mb-4">התנדבות לנקודת איסוף</h2>
      <form onSubmit={onSubmit} className="grid gap-3">
        <input name="fullName" placeholder="שם מלא" value={form.fullName} onChange={onChange} required className="border p-2 rounded" />
        <input name="phone" placeholder="טלפון" value={form.phone} onChange={onChange} required className="border p-2 rounded" />
        <input name="community" placeholder="קהילה" value={form.community} onChange={onChange} required className="border p-2 rounded" />
        <input name="address" placeholder="כתובת האיסוף" value={form.address} onChange={onChange} required className="border p-2 rounded" />
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded">{saving ? 'שומר…' : 'שמירה'}</button>
          <a href={whatsappLink} target="_blank" rel="noreferrer" className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded">שתפו בוואטסאפ</a>
        </div>
      </form>
      {order?.volunteerIncentive && (
        <p className="mt-3"><strong>תמריץ למתנדבים:</strong> {order.volunteerIncentive}</p>
      )}
    </div>
  );
};

export default VolunteerPickupSpot; 