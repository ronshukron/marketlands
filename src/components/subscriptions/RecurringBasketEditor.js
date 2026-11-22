import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { FiArrowRight, FiMinus, FiPlus, FiSearch, FiTrash2, FiX } from 'react-icons/fi';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import { useSubscriber } from '../../contexts/SubscriberContext';
import LoadingSpinner from '../LoadingSpinner';
import SubscriptionBusyOverlay from './SubscriptionBusyOverlay';
import {
  describeSubscriptionError,
  getMySubscription,
  listRecurringBasketProducts,
  updateRecurringBasket,
} from '../../services/basketSubscriptionService';
import {
  addRecurringLine,
  initialRecurringLines,
  isRecurringBasketChanged,
  quantityStep,
  recurringLineKey,
  setRecurringLineQuantity,
  toRecurringPayload,
} from '../../utils/recurringBasket';
import { SUBSCRIBER_STATES } from '../../utils/subscriberStorefront';

// "עריכת הסל הקבוע": the customer's own recurring basket. Saved on their
// subscription only; deliveries created after saving start from it.

const formatQuantity = (quantity, measurementType) => {
  const value = Number(quantity) || 0;
  if ((measurementType || 'kg') === 'kg') return `${value % 1 === 0 ? value : Math.round(value * 100) / 100} ק"ג`;
  if (measurementType === 'unit') return `${value} יח'`;
  return `${value} מארז`;
};

const unitLabel = (measurementType) => (measurementType === 'package' ? 'למארז' : 'לק"ג');

const RecurringBasketEditor = () => {
  const { subscriptionId } = useParams();
  const { currentUser, loading: authLoading } = useAuth();
  const subscriber = useSubscriber();
  const [subscription, setSubscription] = useState(null);
  const [initial, setInitial] = useState([]);
  const [lines, setLines] = useState([]);
  const [productInfo, setProductInfo] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [search, setSearch] = useState('');
  const [optionChoice, setOptionChoice] = useState({});

  useEffect(() => {
    if (authLoading) return undefined;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const sub = currentUser ? await getMySubscription(subscriptionId) : null;
        if (!sub || sub.userId !== currentUser?.uid) {
          if (active) setLoadError('המנוי לא נמצא');
          return;
        }
        let basket = null;
        if (!(Array.isArray(sub.recurringLines) && sub.recurringLines.length > 0) && sub.basketId) {
          try {
            const basketSnap = await getDoc(doc(db, 'subscriptionBaskets', sub.basketId));
            basket = basketSnap.exists() ? basketSnap.data() : null;
          } catch {
            basket = null;
          }
        }
        const { lines: startLines } = initialRecurringLines(sub, basket);
        const infoEntries = await Promise.all(startLines.map(async (line) => {
          try {
            const snap = await getDoc(doc(db, 'Products', line.productId));
            return [line.productId, snap.exists() ? snap.data() : null];
          } catch {
            return [line.productId, null];
          }
        }));
        if (!active) return;
        setSubscription(sub);
        setInitial(startLines);
        setLines(startLines);
        setProductInfo(Object.fromEntries(infoEntries.map(([id, data]) => [id, data && {
          productName: data.name || '',
          image: Array.isArray(data.images) ? data.images[0] || '' : '',
          price: Number(data.price) || 0,
          measurementType: data.measurementType || 'kg',
          unitSize: Number(data.unitSize) || 0,
        }])));
      } catch (error) {
        if (active) setLoadError('טעינת הסל נכשלה');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authLoading, currentUser, subscriptionId]);

  const changed = useMemo(() => isRecurringBasketChanged(initial, lines), [initial, lines]);

  useEffect(() => {
    if (!changed) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changed]);

  const describe = (line) => {
    const info = productInfo[line.productId] || {};
    return {
      name: info.productName || line.productName || 'מוצר',
      image: info.image || '',
      price: info.price,
      measurementType: line.measurementType || info.measurementType || 'kg',
      unitSize: line.unitSize || info.unitSize || 0,
      businessName: info.businessName || '',
    };
  };

  const openPicker = async () => {
    setPickerOpen(true);
    if (catalog !== null) return;
    try {
      const { products } = await listRecurringBasketProducts(subscriptionId);
      setCatalog(Array.isArray(products) ? products : []);
    } catch (error) {
      setCatalog([]);
      setCatalogError(describeSubscriptionError(error));
    }
  };

  const addProduct = (product) => {
    const option = optionChoice[product.productId] ?? (product.options?.[0] || '');
    setLines((prev) => addRecurringLine(prev, product, option));
    setProductInfo((prev) => ({
      ...prev,
      [product.productId]: {
        productName: product.productName,
        image: product.image,
        price: product.price,
        measurementType: product.measurementType,
        unitSize: product.unitSize,
        businessName: product.businessName,
      },
    }));
  };

  const save = async () => {
    if (lines.length === 0) return;
    setSaving(true);
    try {
      await updateRecurringBasket(subscriptionId, toRecurringPayload(lines));
      setInitial(lines);
      Swal.fire({
        title: 'הסל הקבוע נשמר',
        text: 'משלוחים שייווצרו מעכשיו יתחילו מהסל הזה. משלוח שכבר נפתח לא משתנה.',
        icon: 'success',
        confirmButtonText: 'הבנתי',
      });
    } catch (error) {
      const productId = error?.response?.data?.productId;
      const name = productId ? describe({ productId }).name : '';
      const message = describeSubscriptionError(error);
      Swal.fire('הסל לא נשמר', name ? `${message}: ${name}` : message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) return <div className="py-12"><LoadingSpinner /></div>;
  if (!currentUser) {
    return (
      <div className="mx-auto max-w-xl p-6 text-center" dir="rtl">
        <p className="mb-3">כדי לערוך את הסל הקבוע צריך להתחבר.</p>
        <Link to="/login" className="text-emerald-700 underline">התחברות</Link>
      </div>
    );
  }
  if (loadError || !subscription) {
    return (
      <div className="mx-auto max-w-xl p-6 text-center" dir="rtl">
        <p className="mb-3 text-red-700">{loadError || 'המנוי לא נמצא'}</p>
        <Link to="/my-subscriptions" className="text-emerald-700 underline">לניהול המנויים</Link>
      </div>
    );
  }

  const readOnly = subscription.status === 'canceled';
  const showWeeklyLink = subscriber?.active
    && subscriber.delivery?.subscription?.id === subscriptionId
    && subscriber.delivery?.state === SUBSCRIBER_STATES.OPEN;
  const query = search.trim();
  const inBasket = new Set(lines.map(recurringLineKey));
  const visibleCatalog = (catalog || []).filter((product) => !query || product.productName.includes(query)
    || (product.businessName || '').includes(query));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6" dir="rtl">
      <Link to="/my-subscriptions" className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline">
        <FiArrowRight className="h-4 w-4" aria-hidden="true" />
        ניהול מנויים
      </Link>

      <header>
        <h1 className="text-2xl font-black text-gray-900">עריכת הסל הקבוע</h1>
        <p className="mt-1 text-sm text-gray-600">
          {subscription.basketTitle || 'סל קבוע'} · {subscription.community}
        </p>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          זה הסל שממנו מתחיל כל משלוח חדש. כדי לשנות רק את המשלוח הקרוב, ערכו אותו בחנות.
        </p>
      </header>

      {readOnly && (
        <p className="rounded-lg bg-gray-100 p-3 text-sm text-gray-700">המנוי בוטל, ולכן אי אפשר לערוך את הסל.</p>
      )}

      <section className="rounded-xl border border-gray-200 bg-white">
        {lines.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">הסל ריק. הוסיפו לפחות מוצר אחד.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {lines.map((line) => {
              const key = recurringLineKey(line);
              const info = describe(line);
              const step = quantityStep(info.measurementType, info.unitSize);
              return (
                <li key={key} className="flex items-center gap-3 p-3">
                  {info.image ? (
                    <img src={info.image} alt="" className="h-12 w-12 shrink-0 rounded-md border border-gray-100 object-cover" />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-md bg-gray-100" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{info.name}</p>
                    {line.selectedOption && <p className="text-xs text-gray-500">{line.selectedOption}</p>}
                    {Number.isFinite(info.price) && info.price > 0 && (
                      <p className="text-xs text-gray-500">₪{info.price.toFixed(2)} {unitLabel(info.measurementType)}</p>
                    )}
                  </div>
                  {!readOnly ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-lg border border-gray-200">
                        <button
                          type="button"
                          onClick={() => setLines((prev) => setRecurringLineQuantity(prev, key, line.quantity - step))}
                          className="flex h-9 w-9 items-center justify-center text-gray-700 hover:bg-gray-50"
                          aria-label={`הפחתת ${info.name}`}
                        >
                          <FiMinus className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <span className="min-w-[4.5rem] text-center text-sm font-semibold">{formatQuantity(line.quantity, info.measurementType)}</span>
                        <button
                          type="button"
                          onClick={() => setLines((prev) => setRecurringLineQuantity(prev, key, line.quantity + step))}
                          className="flex h-9 w-9 items-center justify-center text-gray-700 hover:bg-gray-50"
                          aria-label={`הוספת ${info.name}`}
                        >
                          <FiPlus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLines((prev) => setRecurringLineQuantity(prev, key, 0))}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`הסרת ${info.name}`}
                      >
                        <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm font-semibold">{formatQuantity(line.quantity, info.measurementType)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!readOnly && (
          <div className="border-t border-gray-100 p-3">
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              <FiPlus className="h-4 w-4" aria-hidden="true" />
              הוספת מוצרים
            </button>
          </div>
        )}
      </section>

      {pickerOpen && (
        <section className="rounded-xl border border-gray-200 bg-white p-3" aria-label="הוספת מוצרים לסל הקבוע">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <FiSearch className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="חיפוש מוצר או חקלאי"
                className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-9 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label="סגירת רשימת המוצרים"
            >
              <FiX className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {catalog === null ? (
            <div className="py-6"><LoadingSpinner /></div>
          ) : catalogError ? (
            <p className="py-6 text-center text-sm text-red-700">{catalogError}</p>
          ) : visibleCatalog.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">לא נמצאו מוצרים</p>
          ) : (
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
              {visibleCatalog.map((product) => {
                const options = product.options || [];
                const chosen = optionChoice[product.productId] ?? (options[0] || '');
                const already = inBasket.has(recurringLineKey({ productId: product.productId, selectedOption: chosen }));
                return (
                  <li key={product.productId} className="flex items-center gap-3 py-2">
                    {product.image ? (
                      <img src={product.image} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded-md bg-gray-100" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{product.productName}</p>
                      <p className="truncate text-xs text-gray-500">
                        {product.businessName} · ₪{Number(product.price || 0).toFixed(2)} {unitLabel(product.measurementType)}
                      </p>
                    </div>
                    {options.length > 0 && (
                      <select
                        value={chosen}
                        onChange={(event) => setOptionChoice((prev) => ({ ...prev, [product.productId]: event.target.value }))}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                        aria-label={`אפשרות עבור ${product.productName}`}
                      >
                        {options.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => addProduct(product)}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      {already ? 'עוד' : 'הוספה'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {!readOnly && (
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-xl sm:border">
          <div className="text-xs text-gray-600">
            <p>השינוי יחול על משלוחים שעדיין לא נוצרו</p>
            {showWeeklyLink && (
              <Link to="/" className="font-semibold text-emerald-700 underline">לעריכת המשלוח הקרוב</Link>
            )}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={!changed || lines.length === 0 || saving}
            className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            שמירת הסל הקבוע
          </button>
        </div>
      )}

      <SubscriptionBusyOverlay action={saving ? 'recurring_basket' : ''} />
    </div>
  );
};

export default RecurringBasketEditor;
