import React, { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import usePickupSpots from '../../hooks/usePickupSpots';
import LoadingSpinner from '../LoadingSpinner';
import { getEstimatedLineTotal } from '../../utils/pricing';
import {
  deleteIntroductionBasket,
  getIntroductionBasketComponentSubtotal,
  listIntroductionBasketProductCandidates,
  listIntroductionBaskets,
  saveIntroductionBasket,
} from '../../services/introductionBasketService';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2', 'Q0bohhVCdmeMhgBbDknvLxbEzW53'];

const emptyForm = {
  title: '',
  description: '',
  image: '',
  active: true,
  sortOrder: 0,
  communities: [],
  displayPrice: '',
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
  DISPLAY_PRICE_INVALID: 'מחיר הסל חייב להיות מספר חיובי או אפס',
  COMPONENTS_REQUIRED: 'בחרו לפחות מוצר אחד לסל',
  TOO_MANY_COMPONENTS: 'נבחרו יותר מדי פריטים לסל',
  COMPONENT_REFERENCE_INVALID: 'אחד הפריטים חסר שיוך למוצר, הזמנה או חקלאי',
  COMPONENT_QUANTITY_INVALID: 'כמות לא תקינה באחד הפריטים',
  COMPONENT_PRICE_INVALID: 'מחיר לא תקין באחד הפריטים',
  COMPONENT_MEASUREMENT_INVALID: 'סוג מדידה לא תקין באחד הפריטים',
};

const mapSaveError = (err) => {
  if (err?.code === 'permission-denied') {
    return 'אין הרשאה לשמור סל היכרות. בדקו את כללי Firestore.';
  }
  return SAVE_ERROR_MESSAGES[err?.message] || err?.message || 'שמירת סל ההיכרות נכשלה';
};

const IntroductionBasketAdmin = () => {
  const { currentUser, userRole } = useAuth();
  const { pickupSpots } = usePickupSpots();
  const [baskets, setBaskets] = useState([]);
  const [productCandidates, setProductCandidates] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [error, setError] = useState('');

  const isAdmin = Boolean(
    currentUser && (userRole === 'admin' || ADMIN_UIDS.includes(currentUser.uid))
  );

  const componentSubtotal = useMemo(
    () => getIntroductionBasketComponentSubtotal(form.componentLines),
    [form.componentLines]
  );
  const displayPrice = Number(form.displayPrice) || 0;
  const adjustment = Math.round((displayPrice - componentSubtotal) * 100) / 100;

  const filteredCandidates = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    const selectedKeys = new Set(form.componentLines.map(getLineKey));

    return productCandidates
      .filter((candidate) => !selectedKeys.has(getLineKey(candidate)))
      .filter((candidate) => {
        if (!query) return true;
        return [
          candidate.productName,
          candidate.businessName,
          candidate.selectedOption,
          candidate.orderId,
        ].some((value) => String(value || '').toLowerCase().includes(query));
      })
      .slice(0, 80);
  }, [form.componentLines, productCandidates, productQuery]);

  const loadBaskets = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await listIntroductionBaskets();
      setBaskets(next);
    } catch (err) {
      console.error('Failed to load introduction baskets:', err);
      setError(err?.code === 'permission-denied'
        ? 'אין הרשאה לטעון סלי היכרות. בדקו את כללי Firestore.'
        : 'טעינת סלי ההיכרות נכשלה.');
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    setProductsLoading(true);
    try {
      const next = await listIntroductionBasketProductCandidates();
      setProductCandidates(next);
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
      displayPrice: String(basket.displayPrice || ''),
      componentLines: basket.componentLines || [],
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
    setForm((prev) => ({
      ...prev,
      componentLines: [...prev.componentLines, candidate],
    }));
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
    const missing = form.communities.filter((community) => !lineSpots.includes(community));
    return missing.length > 0 ? `לא זמין ב: ${missing.join(', ')}` : '';
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      Swal.fire('שגיאה', 'שם סל חובה', 'error');
      return;
    }
    if (form.communities.length === 0) {
      Swal.fire('שגיאה', 'בחרו לפחות קהילה אחת', 'error');
      return;
    }
    if (form.componentLines.length === 0) {
      Swal.fire('שגיאה', 'בחרו לפחות מוצר אחד לסל', 'error');
      return;
    }
    if (!Number.isFinite(displayPrice) || displayPrice < 0) {
      Swal.fire('שגיאה', 'מחיר הסל חייב להיות מספר חיובי או אפס', 'error');
      return;
    }

    const unavailableLines = form.componentLines
      .map((line) => ({ line, warning: getLineCommunityWarning(line) }))
      .filter((entry) => entry.warning);
    if (unavailableLines.length > 0) {
      const details = unavailableLines
        .map(({ line, warning }) => `• ${line.productName} (${line.businessName}) — ${warning}`)
        .join('<br/>');
      const result = await Swal.fire({
        title: 'פריטים לא זמינים בחלק מהקהילות',
        html: `הפריטים הבאים אינם זמינים בכל הקהילות שנבחרו:<br/><br/>${details}<br/><br/>לא ניתן לשמור עד להסרתם או לשינוי הקהילות.`,
        icon: 'error',
        confirmButtonText: 'הבנתי',
      });
      void result;
      return;
    }

    const invalidQuantityLine = form.componentLines.find((line) => !(Number(line.quantity) > 0));
    if (invalidQuantityLine) {
      Swal.fire('שגיאה', `כמות לא תקינה עבור "${invalidQuantityLine.productName}". כל פריט חייב כמות גדולה מאפס.`, 'error');
      return;
    }

    setSaving(true);
    try {
      const basketId = await saveIntroductionBasket(editingId, {
        ...form,
        displayPrice,
        componentLines: form.componentLines.map((line) => ({
          ...line,
          quantity: Number(line.quantity) || 0,
          price: Number(line.price ?? line.priceSnapshot) || 0,
        })),
      }, currentUser?.uid || '');
      await loadBaskets();
      setEditingId(basketId);
      Swal.fire('נשמר', 'סל ההיכרות נשמר בהצלחה', 'success');
    } catch (err) {
      console.error('Failed to save introduction basket:', err);
      Swal.fire('שגיאה', mapSaveError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (basket) => {
    const result = await Swal.fire({
      title: `למחוק את "${basket.title}"?`,
      text: 'הסל יוסר מהחנות לקהילות שבחרת.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'מחק',
      cancelButtonText: 'ביטול',
    });
    if (!result.isConfirmed) return;

    setSaving(true);
    try {
      await deleteIntroductionBasket(basket.id);
      if (editingId === basket.id) resetForm();
      await loadBaskets();
      Swal.fire('נמחק', 'סל ההיכרות נמחק', 'success');
    } catch (err) {
      console.error('Failed to delete introduction basket:', err);
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
          <h1 className="text-2xl font-bold text-gray-900">ניהול סלי היכרות</h1>
          <p className="text-sm text-gray-600 mt-1">
            בנו סל קבוע מקומפוננטות של כמה חקלאים, קבעו מחיר אחד, והציגו אותו בקהילות שבחרתם.
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
            <p className="text-sm text-gray-500">עדיין לא נוצרו סלי היכרות.</p>
          ) : (
            <div className="space-y-2">
              {baskets.map((basket) => (
                <div
                  key={basket.id}
                  className={`border rounded-lg p-3 ${editingId === basket.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{basket.title}</p>
                      <p className="text-xs text-gray-500">
                        {formatMoney(basket.displayPrice)} · {basket.communities.length} קהילות · {basket.componentLines.length} פריטים
                      </p>
                      <p className={`text-xs mt-1 ${basket.active ? 'text-green-700' : 'text-gray-500'}`}>
                        {basket.active ? 'פעיל בחנות' : 'כבוי'}
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
              ))}
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
                  placeholder="סל היכרות לקהילה"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">מחיר ללקוח</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.displayPrice}
                  onChange={(event) => setForm((prev) => ({ ...prev, displayPrice: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-gray-700">תיאור קצר</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="מה הלקוח מקבל בסל?"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">כתובת תמונה</span>
                <input
                  value={form.image}
                  onChange={(event) => setForm((prev) => ({ ...prev, image: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://..."
                />
              </label>
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
          </section>

          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-lg font-bold">קהילות</h2>
              <span className="text-xs text-gray-500">{form.communities.length} נבחרו</span>
            </div>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-auto">
              {pickupSpots.map((spot) => {
                const selected = form.communities.includes(spot);
                return (
                  <button
                    key={spot}
                    type="button"
                    onClick={() => toggleCommunity(spot)}
                    className={`px-3 py-1.5 rounded-full border text-sm ${
                      selected
                        ? 'bg-green-600 border-green-700 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-green-400'
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
                <p className="text-xs text-gray-500">כל פריט ייכנס להזמנות החקלאים ולמסך השקילה כפריט רגיל.</p>
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-gray-500">עלות רכיבים</p>
                <p className="font-bold text-gray-900">{formatMoney(componentSubtotal)}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-blue-700">מחיר סל</p>
                <p className="font-bold text-blue-900">{formatMoney(displayPrice)}</p>
              </div>
              <div className={`rounded-lg p-3 ${adjustment < 0 ? 'bg-green-50' : 'bg-amber-50'}`}>
                <p className={adjustment < 0 ? 'text-green-700' : 'text-amber-700'}>
                  {adjustment < 0 ? 'הנחה' : 'תוספת/התאמה'}
                </p>
                <p className="font-bold">{formatMoney(Math.abs(adjustment))}</p>
              </div>
            </div>

            {form.componentLines.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 p-5 text-center text-gray-500">
                בחרו מוצרים מהרשימה למטה כדי לבנות את הסל.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-right">מוצר</th>
                      <th className="px-3 py-2 text-right">חקלאי</th>
                      <th className="px-3 py-2 text-right">כמות</th>
                      <th className="px-3 py-2 text-right">מחיר</th>
                      <th className="px-3 py-2 text-right">סה״כ</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {form.componentLines.map((line, index) => {
                      const warning = getLineCommunityWarning(line);
                      const lineTotal = getEstimatedLineTotal(line);
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
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.price}
                              onChange={(event) => updateComponentLine(index, 'price', event.target.value)}
                              className="w-24 rounded border border-gray-300 px-2 py-1 text-right"
                            />
                          </td>
                          <td className="px-3 py-2 font-semibold">{formatMoney(lineTotal)}</td>
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
                          {candidate.measurementType === 'kg' ? '/ק״ג' : candidate.measurementType === 'package' ? '/מארז' : '/ק״ג'}
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
              disabled={saving}
              className="px-6 py-2.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold"
            >
              {saving ? 'שומר...' : 'שמור סל היכרות'}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default IntroductionBasketAdmin;
