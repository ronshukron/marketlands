import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { DEFAULT_MARKETPLACE_GLOBAL_SETTINGS } from '../../constants/marketplacePaymentLinks';
import { getMarketplaceSettings, saveMarketplaceSettings } from '../../services/marketplaceService';

const MarketplaceSettingsAdmin = () => {
  const [form, setForm] = useState(DEFAULT_MARKETPLACE_GLOBAL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const settings = await getMarketplaceSettings();
        setForm({
          ...DEFAULT_MARKETPLACE_GLOBAL_SETTINGS,
          paymentLinksOnConfirmationEnabled: settings.paymentLinksOnConfirmationEnabled !== false,
          confirmationIntroText: settings.confirmationIntroText || '',
          confirmationNextStepsText: settings.confirmationNextStepsText || '',
          highlightLimit: settings.highlightLimit ?? 8,
          enabled: settings.enabled !== false,
          waitlistEnabled: settings.waitlistEnabled !== false,
        });
      } catch (error) {
        console.error('Failed to load marketplace settings', error);
        Swal.fire({ icon: 'error', title: 'שגיאה בטעינת הגדרות שוק הבסטות' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await saveMarketplaceSettings(form);
      Swal.fire({
        icon: 'success',
        title: 'נשמר',
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to save marketplace settings', error);
      Swal.fire({ icon: 'error', title: 'שגיאה בשמירה' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div dir="rtl" className="max-w-2xl mx-auto p-8 text-center text-gray-600">
        טוען...
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-2xl mx-auto p-6">
      <Link to="/admin" className="text-blue-600 hover:underline text-sm">
        ← חזרה ללוח מנהל
      </Link>
      <h1 className="text-2xl font-bold mt-4 mb-2">הגדרות שוק הבסטות</h1>
      <p className="text-gray-600 mb-6 text-sm">
        שליטה בהצגת פרטי התשלום שכל בסטה פרסמה בעמוד אישור ההזמנה (לא גבייה באתר).
      </p>

      <form onSubmit={handleSave} className="bg-white border rounded-xl p-6 space-y-5 shadow-sm">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.paymentLinksOnConfirmationEnabled}
            onChange={(e) =>
              setForm((c) => ({ ...c, paymentLinksOnConfirmationEnabled: e.target.checked }))
            }
          />
          <span>
            <strong>הצגת קישורי תשלום בעמוד אישור הזמנה</strong>
            <span className="block text-sm text-gray-600 mt-1">
              כשמכובה — הלקוח רואה הסבר לתשלום ותיאום ישירות מול הבסטה, בלי כפתורי/פרטי
              תשלום שהבסטה הגדירה.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.waitlistEnabled}
            onChange={(e) => setForm((c) => ({ ...c, waitlistEnabled: e.target.checked }))}
          />
          <span>
            <strong>הצגת רשימת המתנה לפיילוט בעמוד השוק</strong>
            <span className="block text-sm text-gray-600 mt-1">
              כשמופעל — מוצג טופס הרשמה לפיילוט (3-5 עסקים) במקום הכפתור "פתחו בסטה בשוק".
            </span>
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">טקסט פתיחה בעמוד אישור (אופציונלי)</span>
          <textarea
            className="mt-1 w-full border rounded-lg p-3 text-sm"
            rows={3}
            value={form.confirmationIntroText}
            onChange={(e) => setForm((c) => ({ ...c, confirmationIntroText: e.target.value }))}
            placeholder="ברירת מחדל: ההזמנה הועברה לבסטה. מכאן הכל ביניכם..."
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">הערות נוספות ללקוח (אופציונלי)</span>
          <textarea
            className="mt-1 w-full border rounded-lg p-3 text-sm"
            rows={3}
            value={form.confirmationNextStepsText}
            onChange={(e) => setForm((c) => ({ ...c, confirmationNextStepsText: e.target.value }))}
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-6 rounded-lg disabled:opacity-60"
        >
          {saving ? 'שומר...' : 'שמירה'}
        </button>
      </form>
    </div>
  );
};

export default MarketplaceSettingsAdmin;
