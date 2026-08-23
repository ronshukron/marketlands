import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import {
  getBusinessProductPromotions,
  saveBusinessProductPromotions,
  serializeGroupPromotion,
} from '../../services/productPromotionService';
import {
  buildDefaultGroupPromotionLabel,
  createGroupPromotionId,
  getGroupPromotionLabel,
  MAX_GROUP_PROMOTIONS,
  validateGroupPromotion,
} from '../../utils/pricing';

const emptyForm = () => ({
  id: '',
  active: true,
  label: '',
  pricingBasis: 'package',
  productIds: [],
  threshold: '3',
  bundleTotalPrice: '10',
  discountedPrice: '',
});

const getProductStatus = (product) => {
  if (product?.rejected === true) return 'rejected';
  if (product?.verified === true || !Object.prototype.hasOwnProperty.call(product || {}, 'verified')) {
    return 'verified';
  }
  return 'pending';
};

const BusinessPromotions = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!currentUser) return;
      setLoading(true);
      try {
        const [promos, productsSnap] = await Promise.all([
          getBusinessProductPromotions(currentUser.uid),
          getDocs(query(collection(db, 'Products'), where('Owner_Email', '==', currentUser.email))),
        ]);
        setPromotions(promos);
        setProducts(productsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      } catch (error) {
        console.error('Error loading promotions:', error);
        Swal.fire('שגיאה', 'לא הצלחנו לטעון את המבצעים.', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser]);

  const selectableProducts = useMemo(() => (
    products.filter((product) => (
      getProductStatus(product) === 'verified'
      && (product.measurementType === 'unit' || product.measurementType === 'package')
    ))
  ), [products]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return selectableProducts.filter((product) => (
      product.measurementType === form.pricingBasis
      && (!term || String(product.name || '').toLowerCase().includes(term))
    ));
  }, [selectableProducts, form.pricingBasis, searchTerm]);

  const startNew = () => {
    setForm(emptyForm());
    setSearchTerm('');
  };

  const editPromotion = (promo) => {
    setForm({
      id: promo.id,
      active: promo.active !== false,
      label: promo.label || '',
      pricingBasis: promo.pricingBasis,
      productIds: [...promo.productIds],
      threshold: String(promo.threshold),
      bundleTotalPrice: promo.pricingBasis === 'package'
        ? String(promo.bundleTotalPrice || (promo.discountedPrice * promo.threshold))
        : '',
      discountedPrice: promo.pricingBasis === 'unit' ? String(promo.discountedPrice) : '',
    });
  };

  const toggleProduct = (productId) => {
    setForm((prev) => ({
      ...prev,
      productIds: prev.productIds.includes(productId)
        ? prev.productIds.filter((id) => id !== productId)
        : [...prev.productIds, productId],
    }));
  };

  const persist = async (nextPromotions) => {
    if (!currentUser) return;
    setSaving(true);
    try {
      const saved = await saveBusinessProductPromotions(currentUser.uid, nextPromotions);
      setPromotions(saved);
      return saved;
    } catch (error) {
      console.error('Error saving promotions:', error);
      Swal.fire('שגיאה', 'שמירת המבצע נכשלה.', 'error');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const payload = {
      id: form.id || createGroupPromotionId(),
      active: form.active,
      label: form.label,
      pricingBasis: form.pricingBasis,
      productIds: form.productIds,
      threshold: form.threshold,
      bundleTotalPrice: form.pricingBasis === 'package' ? form.bundleTotalPrice : '',
      discountedPrice: form.pricingBasis === 'unit' ? form.discountedPrice : '',
    };
    const error = validateGroupPromotion({
      ...payload,
      products: selectableProducts,
      existingPromotions: promotions,
      currentId: payload.id,
    });
    if (error) {
      Swal.fire({ icon: 'error', title: 'מבצע לא תקין', text: error });
      return;
    }
    if (!form.id && promotions.length >= MAX_GROUP_PROMOTIONS) {
      Swal.fire('מגבלה', `ניתן להגדיר עד ${MAX_GROUP_PROMOTIONS} מבצעים.`, 'warning');
      return;
    }

    const serialized = serializeGroupPromotion(payload);
    const next = form.id
      ? promotions.map((promo) => (promo.id === form.id ? serialized : promo))
      : [...promotions, serialized];
    await persist(next);
    startNew();
    Swal.fire({ icon: 'success', title: 'המבצע נשמר', timer: 1500, showConfirmButton: false });
  };

  const handleToggleActive = async (promo) => {
    const next = promotions.map((entry) => (
      entry.id === promo.id ? { ...entry, active: !entry.active } : entry
    ));
    const conflictError = !promo.active
      ? validateGroupPromotion({
        ...promo,
        active: true,
        products: selectableProducts,
        existingPromotions: next,
        currentId: promo.id,
      })
      : '';
    if (conflictError) {
      Swal.fire({ icon: 'error', title: 'לא ניתן להפעיל', text: conflictError });
      return;
    }
    await persist(next);
  };

  const handleDelete = async (promo) => {
    const result = await Swal.fire({
      title: 'למחוק את המבצע?',
      text: getGroupPromotionLabel(promo),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'מחק',
      cancelButtonText: 'ביטול',
    });
    if (!result.isConfirmed) return;
    await persist(promotions.filter((entry) => entry.id !== promo.id));
    if (form.id === promo.id) startNew();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div dir="rtl" className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">מבצעי כמות משותפים</h1>
          <p className="text-sm text-gray-600 mt-1">
            בחרו מוצרים מקטלוג העסק. הלקוח יכול לערבב ביניהם, למשל כוסברה, פטרוזיליה ושמיר ב־3 ב־10 ₪.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/Business-Products')}
          className="px-4 py-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          חזרה למוצרים
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <h2 className="text-lg font-semibold">{form.id ? 'עריכת מבצע' : 'מבצע חדש'}</h2>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">שם המבצע</span>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder={buildDefaultGroupPromotionLabel({
                id: 'preview',
                pricingBasis: form.pricingBasis,
                productIds: form.productIds.length ? form.productIds : ['x'],
                threshold: form.threshold,
                discountedPrice: form.pricingBasis === 'unit' ? form.discountedPrice : undefined,
                bundleTotalPrice: form.pricingBasis === 'package' ? form.bundleTotalPrice : undefined,
              }) || 'הנחה על ירק 3 ב-10'}
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">סוג המבצע</span>
            <select
              value={form.pricingBasis}
              onChange={(e) => setForm((prev) => ({
                ...prev,
                pricingBasis: e.target.value,
                productIds: [],
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="package">מארז — מחיר קבוע לקבוצה</option>
              <option value="unit">יחידה — מחיר מוזל לק״ג לפי מספר יחידות</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">כמות למבצע</span>
              <input
                type="number"
                min="1"
                step="1"
                value={form.threshold}
                onChange={(e) => setForm((prev) => ({ ...prev, threshold: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </label>
            {form.pricingBasis === 'package' ? (
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">מחיר לקבוצה (₪)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.bundleTotalPrice}
                  onChange={(e) => setForm((prev) => ({ ...prev, bundleTotalPrice: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </label>
            ) : (
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">מחיר מוזל לק״ג (₪)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discountedPrice}
                  onChange={(e) => setForm((prev) => ({ ...prev, discountedPrice: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </label>
            )}
          </div>

          <p className="text-xs text-emerald-800 bg-emerald-50 rounded-md p-2">
            {form.pricingBasis === 'package'
              ? 'כשהלקוח מגיע לסף, כל המארזים שנבחרו מקבלים את מחיר המבצע ליחידה.'
              : 'הסף נספר לפי מספר יחידות. החיוב נשאר לפי משקל, במחיר המוזל לק״ג.'}
          </p>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
              className="h-5 w-5"
            />
            <span className="text-sm text-gray-700">מבצע פעיל</span>
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">בחירת מוצרים</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חיפוש מוצר"
              className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
            />
            <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-md divide-y">
              {filteredProducts.length === 0 ? (
                <p className="p-3 text-sm text-gray-500">אין מוצרים מתאימים מסוג זה.</p>
              ) : filteredProducts.map((product) => {
                const selected = form.productIds.includes(product.id);
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => toggleProduct(product.id)}
                    className={`w-full text-right px-3 py-2 text-sm ${selected ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'}`}
                  >
                    <span className="font-medium">{product.name}</span>
                    <span className="text-gray-500 mr-2">₪{Number(product.price || 0).toFixed(2)}</span>
                    {selected ? <span className="text-blue-600 mr-2">נבחר</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[44px] bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'שומר...' : 'שמור מבצע'}
            </button>
            {form.id ? (
              <button
                type="button"
                onClick={startNew}
                className="px-4 min-h-[44px] bg-gray-100 rounded-md"
              >
                מבצע חדש
              </button>
            ) : null}
          </div>
        </form>

        <div className="space-y-3">
          {promotions.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-500">
              עדיין אין מבצעים. צרו מבצע ראשון מצד שמאל.
            </div>
          ) : promotions.map((promo) => (
            <div key={promo.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="flex justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{getGroupPromotionLabel(promo)}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {promo.pricingBasis === 'package' ? 'מארזים' : 'יחידות נשקלות'} · {promo.productIds.length} מוצרים
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full h-fit ${promo.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                  {promo.active ? 'פעיל' : 'כבוי'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {promo.productIds.map((productId) => {
                  const product = products.find((entry) => entry.id === productId);
                  return (
                    <span key={productId} className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                      {product?.name || productId}
                    </span>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => editPromotion(promo)} className="flex-1 min-h-[44px] bg-gray-100 rounded-md text-sm">
                  ערוך
                </button>
                <button type="button" onClick={() => handleToggleActive(promo)} className="flex-1 min-h-[44px] bg-emerald-50 text-emerald-800 rounded-md text-sm">
                  {promo.active ? 'כבה' : 'הפעל'}
                </button>
                <button type="button" onClick={() => handleDelete(promo)} className="flex-1 min-h-[44px] bg-red-50 text-red-700 rounded-md text-sm">
                  מחק
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BusinessPromotions;
