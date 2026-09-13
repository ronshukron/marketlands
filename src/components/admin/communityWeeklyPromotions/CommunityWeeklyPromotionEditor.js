import React, { useEffect, useMemo, useState } from 'react';
import usePickupSpots from '../../../hooks/usePickupSpots';
import { getCommunityCode } from '../../../services/pickupSpotsService';
import { loadEligibleWeeklyProducts } from '../../../services/communityWeeklyPromotionService';
import { getWeekKey, toLocalDateKey } from '../../../utils/deliveryScheduleUtils';

const inputClass =
  'mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100';

const asDateInput = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const date = value?.toDate?.() || new Date(value);
  return Number.isNaN(date.getTime()) ? '' : toLocalDateKey(date);
};

const asTimeInput = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && value.includes('T')) return value.slice(11, 16);
  if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = value?.toDate?.() || new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const productIdOf = (product) => String(product?.productId || product?.id || product?.key || '');
const productNameOf = (product) => product?.productName || product?.name || product?.title || 'מוצר ללא שם';
const businessNameOf = (product) =>
  product?.businessName || product?.ownerName || product?.supplierName || 'עסק לא משויך';
const basePriceOf = (product) => Number(
  product?.regularPrice ?? product?.basePrice ?? product?.price ?? product?.unitPrice ?? 0
);

const normalizeProduct = (product, businessById = {}) => {
  const businessId = product?.businessId || product?.Owner_ID || product?.ownerId || '';
  const business = businessById[businessId] || {};
  return {
    ...product,
    productId: productIdOf(product),
    productName: productNameOf(product),
    businessId,
    businessName:
      product?.businessName ||
      business?.businessName ||
      business?.name ||
      business?.email ||
      businessId ||
      'עסק לא משויך',
    basePrice: basePriceOf(product),
    promotionalPrice: product?.promotionPrice ?? product?.promotionalPrice ?? '',
  };
};

const initialForm = (promotion) => {
  const now = new Date();
  const sunday = getWeekKey(now);
  const saturday = new Date(`${sunday}T12:00:00`);
  saturday.setDate(saturday.getDate() + 6);
  const selectedCommunities = (
    promotion?.targetCommunities ||
    promotion?.communities ||
    promotion?.communityNames ||
    promotion?.pickupSpots ||
    []
  ).map((community) => (typeof community === 'string' ? community : community?.name)).filter(Boolean);

  return {
    title: promotion?.title || '',
    message: promotion?.shareConfig?.message || promotion?.message || promotion?.description || '',
    weekKey: promotion?.weekKey || promotion?.deliveryWeekKey || sunday,
    communities: Array.isArray(selectedCommunities) ? selectedCommunities : [],
    startsAtDate: asDateInput(promotion?.startsAt) || sunday,
    startsAtTime: asTimeInput(promotion?.startsAt) || '08:00',
    endsAtDate: asDateInput(promotion?.endsAt) || toLocalDateKey(saturday),
    endsAtTime: asTimeInput(promotion?.endsAt) || '22:00',
    products: (promotion?.productSnapshots || promotion?.products || promotion?.items || []).map(normalizeProduct),
  };
};

const combineLocalDateTime = (date, time) => (date && time ? `${date}T${time}:00` : '');

const CommunityWeeklyPromotionEditor = ({
  promotion = null,
  saving = false,
  onSave,
  onCancel,
}) => {
  const { pickupSpots = [], loaded: communitiesLoaded } = usePickupSpots();
  const [form, setForm] = useState(() => initialForm(promotion));
  const [communitySearch, setCommunitySearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [eligibleProducts, setEligibleProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [errors, setErrors] = useState({});
  const readOnly = Boolean(promotion?.id && promotion?.status !== 'draft');

  useEffect(() => {
    setForm(initialForm(promotion));
    setErrors({});
  }, [promotion]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setProductsLoading(true);
      setProductsError('');
      try {
        const result = await loadEligibleWeeklyProducts();
        if (!active) return;
        const businesses = Array.isArray(result?.businesses) ? result.businesses : [];
        const businessById = Object.fromEntries(businesses.map((business) => [business.id, business]));
        const products = Array.isArray(result?.products)
          ? result.products
          : Object.values(result?.productsByBusiness || {}).flat();
        setEligibleProducts(products.map((product) => normalizeProduct(product, businessById)).filter((item) => item.productId));
        setForm((current) => ({
          ...current,
          products: current.products.map((product) => normalizeProduct(product, businessById)),
        }));
      } catch (error) {
        console.error('Failed to load eligible weekly products', error);
        if (active) setProductsError('לא ניתן לטעון כרגע את המוצרים הזמינים.');
      } finally {
        if (active) setProductsLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const selectedById = useMemo(
    () => new Map(form.products.map((product) => [productIdOf(product), product])),
    [form.products]
  );

  const visibleProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase('he');
    if (!query) return eligibleProducts;
    return eligibleProducts.filter((product) =>
      `${productNameOf(product)} ${businessNameOf(product)}`.toLocaleLowerCase('he').includes(query)
    );
  }, [eligibleProducts, productSearch]);

  const groupedProducts = useMemo(() => {
    const groups = new Map();
    visibleProducts.forEach((product) => {
      const business = businessNameOf(product);
      if (!groups.has(business)) groups.set(business, []);
      groups.get(business).push(product);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'he'));
  }, [visibleProducts]);

  const filteredCommunities = pickupSpots.filter((name) =>
    name.toLocaleLowerCase('he').includes(communitySearch.trim().toLocaleLowerCase('he'))
  );

  const patch = (updates) => {
    setForm((current) => ({ ...current, ...updates }));
    setErrors({});
  };

  const toggleCommunity = (name) => {
    patch({
      communities: form.communities.includes(name)
        ? form.communities.filter((community) => community !== name)
        : [...form.communities, name],
    });
  };

  const toggleProduct = (product) => {
    const id = productIdOf(product);
    patch({
      products: selectedById.has(id)
        ? form.products.filter((item) => productIdOf(item) !== id)
        : [...form.products, { ...normalizeProduct(product), promotionalPrice: '' }],
    });
  };

  const setPromotionalPrice = (id, value) => {
    patch({
      products: form.products.map((product) =>
        productIdOf(product) === id ? { ...product, promotionalPrice: value } : product
      ),
    });
  };

  const validate = () => {
    const next = {};
    if (!form.title.trim()) next.title = 'יש להזין כותרת למבצע.';
    if (!form.weekKey) next.weekKey = 'יש לבחור שבוע.';
    if (form.communities.length === 0) next.communities = 'יש לבחור לפחות קהילה אחת.';
    if (!form.startsAtDate || !form.startsAtTime || !form.endsAtDate || !form.endsAtTime) {
      next.dates = 'יש להגדיר תאריך ושעה לפתיחה ולסגירה.';
    } else if (
      new Date(combineLocalDateTime(form.endsAtDate, form.endsAtTime)) <=
      new Date(combineLocalDateTime(form.startsAtDate, form.startsAtTime))
    ) {
      next.dates = 'מועד הסגירה חייב להיות מאוחר ממועד הפתיחה.';
    }
    if (form.products.length === 0) next.products = 'יש לבחור לפחות מוצר אחד.';
    form.products.forEach((product) => {
      const price = Number(product.promotionalPrice);
      const basePrice = basePriceOf(product);
      if (!Number.isFinite(price) || price <= 0) {
        next[`product-${productIdOf(product)}`] = 'מחיר המבצע חייב להיות חיובי.';
      } else if (basePrice > 0 && price >= basePrice) {
        next[`product-${productIdOf(product)}`] = 'מחיר המבצע חייב להיות נמוך ממחיר הבסיס.';
      }
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (event) => {
    event.preventDefault();
    if (readOnly || !validate()) return;
    const targetCommunities = form.communities.map((name) => ({
      code: getCommunityCode(name),
      name,
    }));
    onSave({
      title: form.title.trim(),
      weekKey: form.weekKey,
      status: 'draft',
      startsAt: combineLocalDateTime(form.startsAtDate, form.startsAtTime),
      endsAt: combineLocalDateTime(form.endsAtDate, form.endsAtTime),
      targetCommunities,
      targetCommunityCodes: targetCommunities.map(({ code }) => code).filter(Boolean),
      productSnapshots: form.products.map((product) => ({
        productId: productIdOf(product),
        ...(product.orderId ? { orderId: product.orderId } : {}),
        businessId: product.businessId || product.Owner_ID || '',
        name: productNameOf(product),
        measurementType: product.measurementType || '',
        regularPrice: basePriceOf(product),
        promotionPrice: Number(product.promotionalPrice),
        imageUrl: product.imageUrl || product.image || product.images?.[0] || '',
      })),
      shareConfig: {
        enabled: promotion?.shareConfig?.enabled !== false,
        headline: form.title.trim(),
        message: form.message.trim(),
      },
      schemaVersion: 1,
      pricingVersion: 'community-weekly-v1',
    });
  };

  return (
    <form onSubmit={submit} dir="rtl" className="space-y-5" noValidate>
      {readOnly && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status">
          מבצע שתוזמן או הופעל נעול לעריכה. ניתן לשכפל אותו כדי ליצור טיוטה חדשה.
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-gray-900">פרטי המבצע</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            כותרת
            <input
              value={form.title}
              onChange={(event) => patch({ title: event.target.value })}
              className={inputClass}
              disabled={readOnly}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'promotion-title-error' : undefined}
            />
            {errors.title && <span id="promotion-title-error" className="mt-1 block text-xs text-red-600">{errors.title}</span>}
          </label>
          <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
            הודעה לקהילה
            <textarea
              value={form.message}
              onChange={(event) => patch({ message: event.target.value })}
              className={inputClass}
              rows={3}
              disabled={readOnly}
              placeholder="מה מיוחד במבצע השבוע?"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            שבוע המבצע
            <input
              type="date"
              value={form.weekKey}
              onChange={(event) => patch({ weekKey: getWeekKey(event.target.value) })}
              className={inputClass}
              disabled={readOnly}
              aria-invalid={Boolean(errors.weekKey)}
            />
            <span className="mt-1 block text-xs text-gray-500">השבוע נשמר לפי יום ראשון.</span>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">קהילות</h2>
            <p className="mt-1 text-sm text-gray-500">נבחרו {form.communities.length} קהילות.</p>
          </div>
          <label className="block text-sm font-medium text-gray-700 sm:w-72">
            <span className="sr-only">חיפוש קהילה</span>
            <input
              type="search"
              value={communitySearch}
              onChange={(event) => setCommunitySearch(event.target.value)}
              className={inputClass}
              placeholder="חיפוש קהילה..."
              disabled={readOnly}
            />
          </label>
        </div>
        {errors.communities && <p className="mt-3 text-sm text-red-600" role="alert">{errors.communities}</p>}
        <div className="mt-4 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {filteredCommunities.map((name) => {
            const selected = form.communities.includes(name);
            return (
              <label
                key={name}
                className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                  selected ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-gray-200 text-gray-700'
                } ${readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-blue-300'}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleCommunity(name)}
                  disabled={readOnly}
                  className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{name}</span>
              </label>
            );
          })}
          {!communitiesLoaded && <p className="text-sm text-gray-500" role="status">טוען קהילות...</p>}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-gray-900">מוצרים ומחירי מבצע</h2>
        <p className="mt-1 text-sm text-gray-500">
          בחרו מוצרים מהעסקים המשתתפים. כל מחיר מבצע חייב להיות חיובי ונמוך ממחיר הבסיס.
        </p>
        {errors.products && <p className="mt-3 text-sm text-red-600" role="alert">{errors.products}</p>}

        {!readOnly && (
          <label className="mt-4 block text-sm font-medium text-gray-700">
            <span className="sr-only">חיפוש מוצר או עסק</span>
            <input
              type="search"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              className={inputClass}
              placeholder="חיפוש לפי מוצר או עסק..."
            />
          </label>
        )}

        {productsLoading && <p className="mt-4 text-sm text-gray-500" role="status">טוען מוצרים מתאימים...</p>}
        {productsError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{productsError}</p>}

        {!readOnly && !productsLoading && groupedProducts.length > 0 && (
          <div className="mt-4 max-h-96 space-y-4 overflow-y-auto rounded-lg border border-gray-200 p-3">
            {groupedProducts.map(([businessName, products]) => (
              <div key={businessName}>
                <h3 className="sticky top-0 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800">{businessName}</h3>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {products.map((product) => {
                    const id = productIdOf(product);
                    const selected = selectedById.has(id);
                    return (
                      <label
                        key={id}
                        className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                          selected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProduct(product)}
                          className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-gray-900">{productNameOf(product)}</span>
                          <span className="block text-xs text-gray-500">מחיר בסיס: ₪{basePriceOf(product).toFixed(2)}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {!readOnly && !productsLoading && groupedProducts.length === 0 && !productsError && (
          <p className="mt-4 rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">לא נמצאו מוצרים מתאימים.</p>
        )}

        <div className="mt-5 space-y-3">
          {form.products.map((product) => {
            const id = productIdOf(product);
            const productError = errors[`product-${id}`];
            return (
              <div key={id} className="grid gap-3 rounded-xl border border-gray-200 p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{productNameOf(product)}</p>
                  <p className="text-sm text-gray-500">{businessNameOf(product)} · בסיס ₪{basePriceOf(product).toFixed(2)}</p>
                </div>
                <label className="block text-sm font-medium text-gray-700">
                  מחיר מבצע (₪)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={basePriceOf(product) || undefined}
                    value={product.promotionalPrice}
                    onChange={(event) => setPromotionalPrice(id, event.target.value)}
                    className={inputClass}
                    disabled={readOnly}
                    aria-invalid={Boolean(productError)}
                  />
                  {productError && <span className="mt-1 block text-xs text-red-600">{productError}</span>}
                </label>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => toggleProduct(product)}
                    className="min-h-11 rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300"
                  >
                    הסרה
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-gray-900">חלון המבצע</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['startsAtDate', 'תאריך פתיחה', 'date'],
            ['startsAtTime', 'שעת פתיחה', 'time'],
            ['endsAtDate', 'תאריך סגירה', 'date'],
            ['endsAtTime', 'שעת סגירה', 'time'],
          ].map(([field, label, type]) => (
            <label key={field} className="block text-sm font-medium text-gray-700">
              {label}
              <input
                type={type}
                value={form[field]}
                onChange={(event) => patch({ [field]: event.target.value })}
                className={inputClass}
                disabled={readOnly}
              />
            </label>
          ))}
        </div>
        {errors.dates && <p className="mt-3 text-sm text-red-600" role="alert">{errors.dates}</p>}
      </section>

      <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-gray-200 bg-gray-50/95 p-3 backdrop-blur sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
        >
          {readOnly ? 'חזרה לרשימה' : 'ביטול'}
        </button>
        {!readOnly && (
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? 'שומר טיוטה...' : promotion?.id ? 'שמירת שינויים' : 'יצירת טיוטה'}
          </button>
        )}
      </div>
    </form>
  );
};

export default CommunityWeeklyPromotionEditor;
