import React, { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import usePickupSpots from '../../hooks/usePickupSpots';
import LoadingSpinner from '../LoadingSpinner';
import { estimateRecurringLine, getRecurringUnitPricing } from '../../utils/recurringBasket';
import {
  DEFAULT_OPEN_LEAD_HOURS,
  MAX_OPEN_LEAD_HOURS,
  deleteSubscriptionBasket,
  getSubscriptionBasketSubtotal,
  listCommunitiesWithDeliverySchedule,
  listSubscriptionBasketProductCandidates,
  listSubscriptionBaskets,
  refreshBasketLinePrice,
  saveSubscriptionBasket,
} from '../../services/subscriptionBasketService';
import { BASKET_SUBSCRIPTIONS_COLLECTION } from '../../services/basketSubscriptionService';
import { uploadBasketImage } from '../../utils/basketImageUpload';

const IMAGE_UPLOAD_ERRORS = {
  NOT_AN_IMAGE: 'הקובץ שנבחר אינו תמונה',
  IMAGE_FILE_TOO_LARGE: 'התמונה גדולה מדי (עד 15MB)',
  UNAUTHENTICATED: 'יש להתחבר מחדש',
};

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2', 'Q0bohhVCdmeMhgBbDknvLxbEzW53'];

const emptyForm = {
  title: '',
  description: '',
  image: '',
  active: true,
  sortOrder: 0,
  communities: [],
  openLeadHours: String(DEFAULT_OPEN_LEAD_HOURS),
  componentLines: [],
};

const formatMoney = (value) => `₪${Number(value || 0).toFixed(2)}`;

const getLineKey = (line) => `${line.orderId}:${line.productId}:${line.selectedOption || ''}`;

const SAVE_ERROR_MESSAGES = {
  TITLE_REQUIRED: 'שם סל חובה',
  TITLE_TOO_LONG: 'שם הסל ארוך מדי',
  DESCRIPTION_TOO_LONG: 'התיאור ארוך מדי',
  IMAGE_TOO_LONG: 'כתובת התמונה ארוכה מדי',
  COMMUNITIES_REQUIRED: 'בחרו לפחות קהילה אחת',
  TOO_MANY_COMMUNITIES: 'נבחרו יותר מדי קהילות',
  COMPONENTS_REQUIRED: 'בחרו לפחות מוצר אחד לסל',
  TOO_MANY_COMPONENTS: 'נבחרו יותר מדי פריטים לסל',
  COMPONENT_REFERENCE_INVALID: 'אחד הפריטים חסר שיוך למוצר, הזמנה או חקלאי',
  COMPONENT_QUANTITY_INVALID: 'כמות לא תקינה באחד הפריטים',
  COMPONENT_MEASUREMENT_INVALID: 'סוג מדידה לא תקין באחד הפריטים',
};

const mapSaveError = (err) => {
  if (err?.code === 'permission-denied') {
    return 'אין הרשאה לשמור סל מנוי. בדקו את כללי Firestore.';
  }
  return SAVE_ERROR_MESSAGES[err?.message] || err?.message || 'שמירת סל המנוי נכשלה';
};

const SubscriptionBasketAdmin = () => {
  const { currentUser, userRole } = useAuth();
  const { pickupSpots } = usePickupSpots();
  const [baskets, setBaskets] = useState([]);
  const [subscriberCounts, setSubscriberCounts] = useState({});
  const [scheduledCommunities, setScheduledCommunities] = useState(new Set());
  const [productCandidates, setProductCandidates] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [error, setError] = useState('');

  const isAdmin = Boolean(
    currentUser && (userRole === 'admin' || ADMIN_UIDS.includes(currentUser.uid))
  );

  const componentSubtotal = useMemo(
    () => getSubscriptionBasketSubtotal(form.componentLines),
    [form.componentLines]
  );

  const filteredCandidates = useMemo(() => {
    const queryText = productQuery.trim().toLowerCase();
    const selectedKeys = new Set(form.componentLines.map(getLineKey));
    return productCandidates
      .filter((candidate) => !selectedKeys.has(getLineKey(candidate)))
      .filter((candidate) => {
        if (!queryText) return true;
        return [
          candidate.productName,
          candidate.businessName,
          candidate.selectedOption,
          candidate.orderId,
        ].some((value) => String(value || '').toLowerCase().includes(queryText));
      })
      .slice(0, 80);
  }, [form.componentLines, productCandidates, productQuery]);

  const loadBaskets = async () => {
    setLoading(true);
    setError('');
    try {
      const [next, schedules, subsSnap] = await Promise.all([
        listSubscriptionBaskets(),
        listCommunitiesWithDeliverySchedule(),
        getDocs(collection(db, BASKET_SUBSCRIPTIONS_COLLECTION)).catch(() => null),
      ]);
      setBaskets(next);
      setScheduledCommunities(schedules);
      const counts = {};
      (subsSnap?.docs || []).forEach((subDoc) => {
        const data = subDoc.data() || {};
        if (!data.basketId) return;
        if (!counts[data.basketId]) counts[data.basketId] = { active: 0, paused: 0, failed: 0 };
        if (data.status === 'active') counts[data.basketId].active += 1;
        if (data.status === 'paused') counts[data.basketId].paused += 1;
        if (data.status === 'payment_failed') counts[data.basketId].failed += 1;
      });
      setSubscriberCounts(counts);
    } catch (err) {
      console.error('Failed to load subscription baskets:', err);
      setError(err?.code === 'permission-denied'
        ? 'אין הרשאה לטעון סלי מנוי. בדקו את כללי Firestore.'
        : 'טעינת סלי המנוי נכשלה.');
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    setProductsLoading(true);
    try {
      setProductCandidates(await listSubscriptionBasketProductCandidates());
    } catch (err) {
      console.error('Failed to load basket product candidates:', err);
      Swal.fire('שגיאה', 'טעינת מוצרי החקלאים נכשלה. נסו לרענן את הדף.', 'error');
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    if (!isAdmin) {
      setError('You are not authorized to view this page');
      setLoading(false);
      setProductsLoading(false);
      return;
    }
    loadBaskets();
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, isAdmin]);

  const resetForm = () => {
    setEditingId('');
    setForm(emptyForm);
    setProductQuery('');
  };

  const startEdit = (basket) => {
    setEditingId(basket.id);
    setForm({
      title: basket.title || '',
      description: basket.description || '',
      image: basket.image || '',
      active: basket.active !== false,
      sortOrder: basket.sortOrder || 0,
      communities: basket.communities || [],
      openLeadHours: String(basket.openLeadHours || DEFAULT_OPEN_LEAD_HOURS),
      // Today's price and quantity discount, as the deliveries will be priced.
      componentLines: (basket.componentLines || []).map((line) => refreshBasketLinePrice(line, productCandidates)),
    });
    setProductQuery('');
  };

  const toggleCommunity = (communityName) => {
    setForm((prev) => ({
      ...prev,
      communities: prev.communities.includes(communityName)
        ? prev.communities.filter((name) => name !== communityName)
        : [...prev.communities, communityName],
    }));
  };

  const addComponentLine = (candidate) => {
    setForm((prev) => ({ ...prev, componentLines: [...prev.componentLines, candidate] }));
  };

  const updateComponentLine = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      componentLines: prev.componentLines.map((line, currentIndex) => (
        currentIndex === index ? { ...line, [field]: value } : line
      )),
    }));
  };

  const removeComponentLine = (index) => {
    setForm((prev) => ({
      ...prev,
      componentLines: prev.componentLines.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const getLineCommunityWarning = (line) => {
    if (!form.communities.length) return '';
    const lineSpots = Array.isArray(line.pickupSpots) ? line.pickupSpots : [];
    if (lineSpots.length === 0) return '';
    const missing = form.communities.filter((community) => !lineSpots.includes(community));
    return missing.length > 0 ? `לא זמין ב: ${missing.join(', ')}` : '';
  };

  const handleImageFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadingImage(true);
    try {
      const url = await uploadBasketImage(file, currentUser?.uid);
      setForm((prev) => ({ ...prev, image: url }));
    } catch (error) {
      console.error('Basket image upload failed:', error);
      const message = IMAGE_UPLOAD_ERRORS[error?.message]
        || (error?.code === 'storage/unauthorized' ? 'אין הרשאה להעלות תמונה' : 'העלאת התמונה נכשלה');
      Swal.fire('שגיאה', message, 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (uploadingImage) {
      Swal.fire('רגע', 'התמונה עדיין עולה', 'info');
      return;
    }
    if (!form.title.trim()) {
      Swal.fire('שגיאה', 'שם סל חובה', 'error');
      return;
    }
    if (form.communities.length === 0) {
      Swal.fire('שגיאה', 'בחרו לפחות קהילה אחת', 'error');
      return;
    }
    const unscheduled = form.communities.filter((name) => !scheduledCommunities.has(name));
    if (unscheduled.length > 0) {
      Swal.fire('שגיאה', `לקהילות הבאות אין לוח משלוחים קבוע, ולכן אי אפשר להציע בהן מנוי: ${unscheduled.join(', ')}`, 'error');
      return;
    }
    if (form.componentLines.length === 0) {
      const following = editingId && (subscriberCounts[editingId]?.active || 0) > 0
        && (baskets.find((basket) => basket.id === editingId)?.componentLines.length || 0) > 0;
      const confirmEmpty = await Swal.fire({
        title: 'לשמור סל ריק?',
        html: 'הלקוחות יבנו את הסל בעצמם בעמוד ההרשמה, מהמוצרים שזמינים ביישוב שלהם.'
          + (following
            ? '<br/><br/>שימו לב: מנויים קיימים שלא בחרו סל משלהם ידלגו על משלוחים עד שיוסיפו מוצרים בעמוד "הסל הקבוע".'
            : ''),
        icon: following ? 'warning' : 'question',
        showCancelButton: true,
        confirmButtonText: 'שמירת סל ריק',
        cancelButtonText: 'ביטול',
      });
      if (!confirmEmpty.isConfirmed) return;
    }
    const openLeadHours = Number(form.openLeadHours);
    if (!Number.isFinite(openLeadHours) || openLeadHours < 1 || openLeadHours > MAX_OPEN_LEAD_HOURS) {
      Swal.fire('שגיאה', `שעות פתיחה לפני הסגירה חייבות להיות בין 1 ל-${MAX_OPEN_LEAD_HOURS}`, 'error');
      return;
    }
    const invalidQuantityLine = form.componentLines.find((line) => !(Number(line.quantity) > 0));
    if (invalidQuantityLine) {
      Swal.fire('שגיאה', `כמות לא תקינה עבור "${invalidQuantityLine.productName}". כל פריט חייב כמות גדולה מאפס.`, 'error');
      return;
    }

    const warnings = form.componentLines
      .map((line) => ({ line, warning: getLineCommunityWarning(line) }))
      .filter((entry) => entry.warning);
    if (warnings.length > 0) {
      const details = warnings
        .map(({ line, warning }) => `• ${line.productName} (${line.businessName}) — ${warning}`)
        .join('<br/>');
      const result = await Swal.fire({
        title: 'פריטים שלא זמינים בכל הקהילות',
        html: `בקהילות האלה הפריטים פשוט לא ייכנסו לסל בכל משלוח:<br/><br/>${details}<br/><br/>לשמור בכל זאת?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'שמור',
        cancelButtonText: 'ביטול',
      });
      if (!result.isConfirmed) return;
    }

    setSaving(true);
    try {
      const basketId = await saveSubscriptionBasket(editingId, {
        ...form,
        openLeadHours,
        componentLines: form.componentLines.map((line) => refreshBasketLinePrice(line, productCandidates)).map((line) => ({
          ...line,
          quantity: Number(line.quantity) || 0,
          price: Number(line.price ?? line.priceSnapshot) || 0,
        })),
      }, currentUser?.uid || '');
      await loadBaskets();
      setEditingId(basketId);
      Swal.fire('נשמר', 'סל המנוי נשמר בהצלחה', 'success');
    } catch (err) {
      console.error('Failed to save subscription basket:', err);
      Swal.fire('שגיאה', mapSaveError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (basket) => {
    const counts = subscriberCounts[basket.id] || {};
    const result = await Swal.fire({
      title: `למחוק את "${basket.title}"?`,
      text: counts.active > 0
        ? `ל-${counts.active} מנויים פעילים הסל יושהה במשלוח הבא. עדיף לכבות את הסל במקום למחוק.`
        : 'הסל יוסר מהחנות.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'מחק',
      cancelButtonText: 'ביטול',
    });
    if (!result.isConfirmed) return;

    setSaving(true);
    try {
      await deleteSubscriptionBasket(basket.id);
      if (editingId === basket.id) resetForm();
      await loadBaskets();
      Swal.fire('נמחק', 'סל המנוי נמחק', 'success');
    } catch (err) {
      console.error('Failed to delete subscription basket:', err);
      Swal.fire('שגיאה', err?.message || 'מחיקת הסל נכשלה', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div className="max-w-3xl mx-auto p-6 text-red-600">{error}</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6" dir="rtl">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ניהול סלי מנוי</h1>
          <p className="text-sm text-gray-600 mt-1">
            סל קבוע שנשלח כל שבוע או שבועיים. הלקוח משלם לפי מה שנשאר בסל ונשקל, בכרטיס השמור.
          </p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-semibold"
        >
          סל חדש
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 h-fit">
          <h2 className="text-lg font-bold mb-3">סלים קיימים</h2>
          {baskets.length === 0 ? (
            <p className="text-sm text-gray-500">עדיין לא נוצרו סלי מנוי.</p>
          ) : (
            <div className="space-y-2">
              {baskets.map((basket) => {
                const counts = subscriberCounts[basket.id] || { active: 0, paused: 0, failed: 0 };
                return (
                  <div
                    key={basket.id}
                    className={`border rounded-lg p-3 ${editingId === basket.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">{basket.title}</p>
                        <p className="text-xs text-gray-500">
                          {basket.componentLines.length > 0
                            ? `כ-${formatMoney(basket.componentSubtotal)} · ${basket.communities.length} קהילות · ${basket.componentLines.length} פריטים`
                            : `סל ריק, הלקוח בונה · ${basket.communities.length} קהילות`}
                        </p>
                        <p className={`text-xs mt-1 ${basket.active ? 'text-green-700' : 'text-gray-500'}`}>
                          {basket.active ? 'פעיל בחנות' : 'כבוי'}
                          {` · ${counts.active} מנויים פעילים`}
                          {counts.paused > 0 ? ` · ${counts.paused} מושהים` : ''}
                          {counts.failed > 0 ? ` · ${counts.failed} חיוב נכשל` : ''}
                        </p>
                      </div>
                      {basket.image && (
                        <img src={basket.image} alt={basket.title} className="w-12 h-12 rounded object-cover" />
                      )}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => startEdit(basket)}
                        className="px-3 py-1.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold"
                      >
                        עריכה
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(basket)}
                        disabled={saving}
                        className="px-3 py-1.5 rounded bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold disabled:opacity-50"
                      >
                        מחיקה
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        <main className="lg:col-span-2 space-y-5">
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">שם הסל</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="סל ירקות שבועי"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">פתיחת ההזמנה (שעות לפני סגירת ההזמנות)</span>
                <input
                  type="number"
                  min="1"
                  max={MAX_OPEN_LEAD_HOURS}
                  step="1"
                  value={form.openLeadHours}
                  onChange={(event) => setForm((prev) => ({ ...prev, openLeadHours: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="mt-1 block text-xs text-gray-500">
                  כמה זמן לפני סגירת ההזמנות של הקהילה הסל נוצר ונשלח ללקוח לעריכה. ברירת מחדל {DEFAULT_OPEN_LEAD_HOURS}.
                </span>
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-gray-700">תיאור קצר</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="מה הלקוח מקבל בכל משלוח?"
                />
              </label>
              <div className="block">
                <span className="text-sm font-medium text-gray-700">תמונת הסל</span>
                <div className="mt-1 flex items-start gap-3">
                  {form.image ? (
                    <img src={form.image} alt="" className="h-20 w-20 shrink-0 rounded-lg border border-gray-200 object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-400">
                      אין תמונה
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white ${uploadingImage ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
                        {uploadingImage && (
                          <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin" aria-hidden="true" />
                        )}
                        {uploadingImage ? 'מעלה…' : (form.image ? 'החלפת תמונה' : 'העלאת תמונה')}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFile}
                          disabled={uploadingImage}
                          className="sr-only"
                        />
                      </label>
                      {form.image && !uploadingImage && (
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, image: '' }))}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          הסרה
                        </button>
                      )}
                    </div>
                    <input
                      value={form.image}
                      onChange={(event) => setForm((prev) => ({ ...prev, image: event.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-left text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="או הדביקו כתובת תמונה https://..."
                      dir="ltr"
                      aria-label="כתובת תמונה"
                    />
                  </div>
                </div>
              </div>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">סדר תצוגה</span>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: Number(event.target.value) || 0 }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>

            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-gray-700">פעיל בחנות</span>
            </label>
            {!form.active && editingId && (subscriberCounts[editingId]?.active || 0) > 0 && (
              <p className="text-xs text-amber-700">
                כיבוי הסל משהה את המנויים הפעילים לפני המשלוח הבא שלהם.
              </p>
            )}
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-lg font-bold">קהילות</h2>
              <span className="text-xs text-gray-500">{form.communities.length} נבחרו</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              מנוי אפשרי רק בקהילות עם לוח משלוחים קבוע. קהילות בלי לוח מופיעות באפור.
            </p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-auto">
              {pickupSpots.map((spot) => {
                const selected = form.communities.includes(spot);
                const hasSchedule = scheduledCommunities.has(spot);
                return (
                  <button
                    key={spot}
                    type="button"
                    onClick={() => toggleCommunity(spot)}
                    disabled={!hasSchedule && !selected}
                    title={hasSchedule ? '' : 'אין לוח משלוחים לקהילה'}
                    className={`px-3 py-1.5 rounded-full border text-sm ${
                      selected
                        ? 'bg-green-600 border-green-700 text-white'
                        : hasSchedule
                          ? 'bg-white border-gray-300 text-gray-700 hover:border-green-400'
                          : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {spot}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">פריטי הסל</h2>
                <p className="text-xs text-gray-500">
                  המחיר נקבע בכל משלוח לפי מחיר המוצר באותו שבוע. פריט שהטופס שלו סגור או שאין לו מלאי לא ייכנס לסל.
                </p>
              </div>
              <button
                type="button"
                onClick={loadProducts}
                disabled={productsLoading}
                className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm disabled:opacity-50"
              >
                {productsLoading ? 'טוען...' : 'רענון מוצרים'}
              </button>
            </div>

            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <p className="text-gray-500">הערכה לפי המחירים היום</p>
              <p className="font-bold text-gray-900">{formatMoney(componentSubtotal)}</p>
            </div>

            {form.componentLines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 p-5 text-center text-gray-500">
                בחרו מוצרים מהרשימה למטה כדי לבנות את הסל, או השאירו אותו ריק כדי שכל לקוח יבנה סל משלו בהרשמה.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-right">מוצר</th>
                      <th className="px-3 py-2 text-right">חקלאי</th>
                      <th className="px-3 py-2 text-right">כמות</th>
                      <th className="px-3 py-2 text-right">מחיר היום</th>
                      <th className="px-3 py-2 text-right">הערכה</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {form.componentLines.map((line, index) => {
                      const warning = getLineCommunityWarning(line);
                      return (
                        <tr key={`${getLineKey(line)}:${index}`}>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-gray-900">{line.productName}</div>
                            {line.selectedOption && <div className="text-xs text-gray-500">{line.selectedOption}</div>}
                            {warning && <div className="text-xs text-amber-700 mt-1">{warning}</div>}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{line.businessName}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step={line.measurementType === 'kg' ? '0.1' : '1'}
                              value={line.quantity}
                              onChange={(event) => updateComponentLine(index, 'quantity', event.target.value)}
                              className="w-24 rounded border border-gray-300 px-2 py-1 text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {(() => {
                              const pricing = getRecurringUnitPricing(line, line.quantity);
                              return (
                                <>
                                  {pricing.applied ? (
                                    <>
                                      <span className="line-through text-gray-400">{formatMoney(pricing.basePrice)}</span>
                                      {' '}
                                      <span className="font-semibold text-emerald-700">{formatMoney(pricing.unitPrice)}</span>
                                    </>
                                  ) : formatMoney(pricing.basePrice)}
                                  {pricing.discount && (
                                    <div className={`text-xs mt-0.5 ${pricing.applied ? 'text-emerald-700' : 'text-amber-700'}`}>
                                      מבצע: {pricing.discount.label}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2 font-semibold">{formatMoney(estimateRecurringLine(line, line.quantity, line.measurementType))}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => removeComponentLine(index)}
                              className="px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 text-xs"
                            >
                              הסרה
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">חיפוש מוצר להוספה</span>
                <input
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="שם מוצר, חקלאי או מספר הזמנה"
                />
              </label>
              <div className="mt-3 max-h-80 overflow-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                {productsLoading ? (
                  <div className="p-4 text-center text-gray-500">טוען מוצרים...</div>
                ) : filteredCandidates.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">לא נמצאו מוצרים זמינים להוספה</div>
                ) : (
                  filteredCandidates.map((candidate) => (
                    <button
                      key={getLineKey(candidate)}
                      type="button"
                      onClick={() => addComponentLine(candidate)}
                      className="w-full text-right p-3 hover:bg-gray-50 flex items-center gap-3"
                    >
                      {candidate.images?.[0] ? (
                        <img src={candidate.images[0]} alt={candidate.productName} className="w-12 h-12 rounded object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                          אין תמונה
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{candidate.productName}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {candidate.businessName} · {formatMoney(candidate.price)}
                          {candidate.measurementType === 'package' ? '/מארז' : '/ק״ג'}
                        </div>
                        <div className="text-xs text-gray-400 truncate">קהילות: {candidate.pickupSpots.join(', ')}</div>
                      </div>
                      <span className="px-3 py-1.5 rounded bg-blue-50 text-blue-700 text-xs font-semibold">הוסף</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          <div className="sticky bottom-0 bg-white/95 backdrop-blur border border-gray-100 rounded-xl shadow-lg p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="text-sm text-gray-600">
              {editingId ? 'עורך סל קיים' : 'יוצר סל חדש'} · {form.componentLines.length} פריטים · {form.communities.length} קהילות
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || uploadingImage}
              className="px-6 py-2.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold"
            >
              {saving ? 'שומר...' : 'שמור סל מנוי'}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default SubscriptionBasketAdmin;
