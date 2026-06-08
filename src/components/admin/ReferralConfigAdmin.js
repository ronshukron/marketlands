import React, { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { getReferralConfig, saveReferralConfig } from '../../services/referralService';

const ReferralConfigAdmin = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    mode: 'community',
    personalRewardPercent: 5,
    personalRewardFixed: 0,
  });

  useEffect(() => {
    getReferralConfig()
      .then(setConfig)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveReferralConfig(config);
      Swal.fire('נשמר', 'הגדרות השיתוף עודכנו', 'success');
    } catch (error) {
      Swal.fire('שגיאה', error.message || 'שמירה נכשלה', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6">טוען...</div>;

  return (
    <div className="max-w-3xl mx-auto p-6" dir="rtl">
      <h1 className="text-3xl font-bold mb-2">הגדרות שיתוף ותגמול</h1>
      <p className="text-gray-600 mb-6">בחרו האם לקוחות יקבלו תגמול קהילתי או אישי על שיתוף האתר.</p>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <label className="flex items-start gap-3 p-3 border rounded cursor-pointer">
          <input
            type="radio"
            name="referralMode"
            checked={config.mode === 'community'}
            onChange={() => setConfig((p) => ({ ...p, mode: 'community' }))}
          />
          <div>
            <div className="font-semibold">הנחה קהילתית (ברירת מחדל)</div>
            <div className="text-sm text-gray-600">שיתוף קישור עם pickupSpot — הנחה לפי נפח הזמנות שבועי בקהילה (ShareWidget)</div>
          </div>
        </label>

        <label className="flex items-start gap-3 p-3 border rounded cursor-pointer">
          <input
            type="radio"
            name="referralMode"
            checked={config.mode === 'personal'}
            onChange={() => setConfig((p) => ({ ...p, mode: 'personal' }))}
          />
          <div>
            <div className="font-semibold">הנחה אישית (הפניה)</div>
            <div className="text-sm text-gray-600">כל לקוח מקבל קוד ref — מזמין חדש דרך הקישור מזכה את המפנה בקרדיט</div>
          </div>
        </label>

        {config.mode === 'personal' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <label className="block">
              <span className="text-sm text-gray-600">אחוז תגמול מהזמנה (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                value={config.personalRewardPercent}
                onChange={(e) => setConfig((p) => ({ ...p, personalRewardPercent: Number(e.target.value) }))}
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">תגמול קבוע (₪)</span>
              <input
                type="number"
                min="0"
                value={config.personalRewardFixed}
                onChange={(e) => setConfig((p) => ({ ...p, personalRewardFixed: Number(e.target.value) }))}
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </label>
          </div>
        )}

        <button type="button" onClick={handleSave} disabled={saving} className="w-full py-3 bg-green-600 text-white font-bold rounded hover:bg-green-700 disabled:opacity-50">
          שמור הגדרות
        </button>
      </div>
    </div>
  );
};

export default ReferralConfigAdmin;
