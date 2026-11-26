import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiCheck, FiMinus, FiPlus, FiSearch, FiTrash2, FiX } from 'react-icons/fi';
import LoadingSpinner from '../LoadingSpinner';
import { describeSubscriptionError } from '../../services/basketSubscriptionService';
import {
  addRecurringLine,
  getQuantityDiscount,
  getRecurringUnitPricing,
  hasRealOptions,
  normalizeOptionKey,
  quantityStep,
  recurringLineKey,
  setRecurringLineQuantity,
  toProductInfo,
} from '../../utils/recurringBasket';

// The basket lines with +/- and remove, and a full-screen list of products to
// add. Used on the signup page and on "עריכת הסל הקבוע". The parent keeps the
// lines. Built for phones first: names and prices are never cut off.

const CATALOG_TTL_MS = 3 * 60 * 1000;
const PAGE_SIZE = 60;
const ALL_CATEGORIES = '';

// Product lists by key, shared by every editor on the page and reused for a
// few minutes, so opening the list again (or coming back) is instant.
const catalogCache = new Map();

export const resetRecurringCatalogCache = () => catalogCache.clear();

const loadCatalogCached = (key, load) => {
  const hit = catalogCache.get(key);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.promise;
  const promise = Promise.resolve()
    .then(load)
    .then((products) => (Array.isArray(products) ? products : []));
  catalogCache.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    if (catalogCache.get(key)?.promise === promise) catalogCache.delete(key);
  });
  return promise;
};

const formatQuantity = (quantity, measurementType) => {
  const value = Number(quantity) || 0;
  if ((measurementType || 'kg') === 'kg') return `${value % 1 === 0 ? value : Math.round(value * 100) / 100} ק"ג`;
  if (measurementType === 'unit') return `${value} יח'`;
  return `${value} מארז`;
};

const unitLabel = (measurementType) => (measurementType === 'package' ? 'למארז' : 'לק"ג');

const DiscountBadge = ({ label }) => (
  <span className="inline-block rounded-full bg-[#fef9c3] px-2 py-0.5 text-[11px] font-bold leading-tight text-green-900">
    {label}
  </span>
);

const OrganicBadge = () => (
  <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold leading-tight text-green-800">
    אורגני
  </span>
);

/**
 * The line's price, with the product's quantity discount: struck-through
 * regular price once the quantity reaches it, otherwise how much more is needed.
 */
const LinePrice = ({ info, quantity, measurementType, businessName }) => {
  const pricing = getRecurringUnitPricing(info, quantity);
  if (!(pricing.basePrice > 0)) {
    return businessName ? <p className="text-xs text-gray-500">{businessName}</p> : null;
  }
  const { discount, applied } = pricing;
  const missing = discount && !applied ? Math.round((discount.threshold - (Number(quantity) || 0)) * 1000) / 1000 : 0;
  return (
    <>
      <p className="text-xs text-gray-600">
        {applied ? (
          <>
            <span className="line-through">₪{pricing.basePrice.toFixed(2)}</span>
            {' '}
            <span className="font-semibold text-emerald-700">₪{pricing.unitPrice.toFixed(2)}</span>
          </>
        ) : <span className="font-semibold text-gray-800">₪{pricing.basePrice.toFixed(2)}</span>}
        {' '}{unitLabel(measurementType)}
        {businessName ? ` · ${businessName}` : ''}
      </p>
      {discount && (
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
          <DiscountBadge label={discount.label} />
          <span className={applied ? 'font-semibold text-emerald-700' : 'text-gray-600'}>
            {applied ? 'מחיר המבצע חל' : `עוד ${formatQuantity(missing, measurementType)} למחיר המבצע`}
          </span>
        </p>
      )}
    </>
  );
};

/**
 * @param {Object} props
 * @param {Array<Object>} props.lines
 * @param {Function} props.setLines React state setter for lines
 * @param {Object} props.productInfo productId -> toProductInfo()
 * @param {Function} props.setProductInfo React state setter for productInfo
 * @param {Function} props.loadCatalog () => Promise<Array<Object>> products that can be added
 * @param {string} [props.catalogKey] identifies the product list; it is loaded
 *   in the background and reused for a few minutes. Empty: no reuse.
 * @param {boolean} [props.readOnly]
 * @param {string} [props.emptyText]
 * @param {string} [props.addDisabledText] when set, adding is off and this says why
 * @param {boolean} [props.emphasizeAdd] a big "choose products" button for an empty basket
 */
const RecurringLinesEditor = ({
  lines,
  setLines,
  productInfo,
  setProductInfo,
  loadCatalog,
  catalogKey = '',
  readOnly = false,
  emptyText = 'הסל ריק. הוסיפו לפחות מוצר אחד.',
  addDisabledText = '',
  emphasizeAdd = false,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [optionChoice, setOptionChoice] = useState({});
  const loadCatalogRef = useRef(loadCatalog);
  loadCatalogRef.current = loadCatalog;

  // Load the product list right away (not when the list is opened), so it is
  // usually ready by the time the customer taps "הוספת מוצרים".
  useEffect(() => {
    setCatalog(null);
    setCatalogError('');
    if (addDisabledText || readOnly) return undefined;
    let active = true;
    const load = () => loadCatalogRef.current();
    (catalogKey ? loadCatalogCached(catalogKey, load) : Promise.resolve().then(load))
      .then((products) => {
        if (active) setCatalog(Array.isArray(products) ? products : []);
      })
      .catch((error) => {
        if (!active) return;
        setCatalog([]);
        setCatalogError(describeSubscriptionError(error));
      });
    return () => { active = false; };
  }, [catalogKey, addDisabledText, readOnly, reloadToken]);

  const showPicker = pickerOpen && !readOnly && !addDisabledText;

  useEffect(() => {
    if (!showPicker) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [showPicker]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, category]);

  const describe = (line) => {
    const info = productInfo[line.productId] || {};
    return {
      name: info.productName || line.productName || 'מוצר',
      image: info.image || '',
      measurementType: line.measurementType || info.measurementType || 'kg',
      unitSize: line.unitSize || info.unitSize || 0,
      businessName: info.businessName || '',
    };
  };

  const chosenOption = (product) => {
    const options = product.options || [];
    return optionChoice[product.productId] ?? (hasRealOptions(options) ? options[0] : '');
  };

  const addProduct = (product) => {
    setLines((prev) => addRecurringLine(prev, product, chosenOption(product)));
    setProductInfo((prev) => ({ ...prev, [product.productId]: toProductInfo(product) }));
  };

  const retry = () => {
    if (catalogKey) catalogCache.delete(catalogKey);
    setReloadToken((value) => value + 1);
  };

  const quantityInBasket = useMemo(() => new Map(lines.map((line) => [recurringLineKey(line), line.quantity])), [lines]);

  const categories = useMemo(() => {
    const counts = new Map();
    (catalog || []).forEach((product) => {
      const name = String(product.category || '').trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [catalog]);

  const query = search.trim();
  const filteredCatalog = useMemo(() => (catalog || []).filter((product) => (
    (!category || String(product.category || '').trim() === category)
    && (!query || product.productName.includes(query) || (product.businessName || '').includes(query))
  )), [catalog, category, query]);

  return (
    <>
      <section className="rounded-xl border border-gray-200 bg-white text-right">
        {lines.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-gray-500">{emptyText}</p>
            {emphasizeAdd && !readOnly && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={Boolean(addDisabledText)}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-base font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                <FiPlus className="h-5 w-5" aria-hidden="true" />
                בחירת מוצרים לסל
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {lines.map((line) => {
              const key = recurringLineKey(line);
              const info = describe(line);
              const step = quantityStep(info.measurementType, info.unitSize);
              const option = normalizeOptionKey(line.selectedOption);
              return (
                <li key={key} className="flex gap-3 p-3">
                  {info.image ? (
                    <img src={info.image} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg border border-gray-100 object-cover" />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-lg bg-gray-100" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-sm font-semibold leading-snug text-gray-900">{info.name}</p>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => setLines((prev) => setRecurringLineQuantity(prev, key, 0))}
                          className="-mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`הסרת ${info.name}`}
                        >
                          <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {option && <p className="text-xs text-gray-500">{option}</p>}
                    <LinePrice
                      info={productInfo[line.productId] || {}}
                      quantity={line.quantity}
                      measurementType={info.measurementType}
                      businessName={info.businessName}
                    />
                    {!readOnly ? (
                      <div className="mt-2 inline-flex items-center rounded-lg border border-gray-200">
                        <button
                          type="button"
                          onClick={() => setLines((prev) => setRecurringLineQuantity(prev, key, line.quantity - step))}
                          className="flex h-9 w-10 items-center justify-center text-gray-700 hover:bg-gray-50"
                          aria-label={`הפחתת ${info.name}`}
                        >
                          <FiMinus className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <span className="min-w-[4.5rem] text-center text-sm font-semibold">{formatQuantity(line.quantity, info.measurementType)}</span>
                        <button
                          type="button"
                          onClick={() => setLines((prev) => setRecurringLineQuantity(prev, key, line.quantity + step))}
                          className="flex h-9 w-10 items-center justify-center text-gray-700 hover:bg-gray-50"
                          aria-label={`הוספת ${info.name}`}
                        >
                          <FiPlus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm font-semibold">{formatQuantity(line.quantity, info.measurementType)}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!readOnly && !(emphasizeAdd && lines.length === 0) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 p-3">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={Boolean(addDisabledText)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent"
            >
              <FiPlus className="h-4 w-4" aria-hidden="true" />
              הוספת מוצרים
            </button>
            {addDisabledText && <span className="text-xs text-gray-500">{addDisabledText}</span>}
          </div>
        )}
        {!readOnly && emphasizeAdd && lines.length === 0 && addDisabledText && (
          <p className="border-t border-gray-100 p-3 text-center text-xs text-gray-500">{addDisabledText}</p>
        )}
      </section>

      {showPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="הוספת מוצרים לסל"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPickerOpen(false);
          }}
        >
          <div className="flex h-[92vh] w-full flex-col rounded-t-2xl bg-white text-right shadow-xl sm:h-[85vh] sm:max-w-2xl sm:rounded-2xl">
            <div className="space-y-2 border-b border-gray-100 p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900">הוספת מוצרים</h2>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                  aria-label="סגירת רשימת המוצרים"
                >
                  <FiX className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="relative">
                <FiSearch className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="חיפוש מוצר או חקלאי"
                  className="w-full rounded-lg border border-gray-300 py-2.5 pl-3 pr-9 text-base focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm"
                />
              </div>
              {categories.length > 1 && (
                <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1" role="group" aria-label="קטגוריות">
                  {[ALL_CATEGORIES, ...categories].map((name) => (
                    <button
                      key={name || 'all'}
                      type="button"
                      onClick={() => setCategory(name)}
                      aria-pressed={category === name}
                      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-semibold ${
                        category === name ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-gray-300 bg-white text-gray-700'
                      }`}
                    >
                      {name || 'הכל'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-3">
              {catalog === null ? (
                <div className="py-10"><LoadingSpinner /></div>
              ) : catalogError ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-red-700">{catalogError}</p>
                  <button type="button" onClick={retry} className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">
                    נסו שוב
                  </button>
                </div>
              ) : filteredCatalog.length === 0 ? (
                <p className="py-10 text-center text-sm text-gray-500">
                  {query || category ? 'לא נמצאו מוצרים' : 'אין כרגע מוצרים זמינים ליישוב הזה'}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filteredCatalog.slice(0, visibleCount).map((product) => {
                    const options = product.options || [];
                    const showOptions = hasRealOptions(options);
                    const chosen = chosenOption(product);
                    const inBasket = quantityInBasket.get(recurringLineKey({ productId: product.productId, selectedOption: chosen }));
                    const discount = getQuantityDiscount(product);
                    return (
                      <li key={product.productId} className="flex gap-3 py-3">
                        {product.image ? (
                          <img src={product.image} alt="" loading="lazy" decoding="async" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <div className="h-16 w-16 shrink-0 rounded-lg bg-gray-100" aria-hidden="true" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug text-gray-900">{product.productName}</p>
                          <p className="mt-0.5 text-sm">
                            <span className="font-semibold text-gray-900">₪{Number(product.price || 0).toFixed(2)}</span>
                            <span className="text-xs text-gray-500"> {unitLabel(product.measurementType)}</span>
                          </p>
                          {product.businessName && <p className="text-xs text-gray-500">{product.businessName}</p>}
                          {(product.isOrganic || discount) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {product.isOrganic && <OrganicBadge />}
                              {discount && <DiscountBadge label={discount.label} />}
                            </div>
                          )}
                          {product.description && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{product.description}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {showOptions && (
                              <select
                                value={chosen}
                                onChange={(event) => setOptionChoice((prev) => ({ ...prev, [product.productId]: event.target.value }))}
                                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                                aria-label={`אפשרות עבור ${product.productName}`}
                              >
                                {options.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            )}
                            <button
                              type="button"
                              onClick={() => addProduct(product)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800"
                            >
                              <FiPlus className="h-4 w-4" aria-hidden="true" />
                              {inBasket ? 'עוד' : 'הוספה'}
                            </button>
                            {inBasket > 0 && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                <FiCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                בסל: {formatQuantity(inBasket, product.measurementType)}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {filteredCatalog.length > visibleCount && (
                <div className="py-4 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    הצגת עוד מוצרים ({filteredCatalog.length - visibleCount})
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 p-3">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="w-full rounded-xl bg-emerald-700 py-3 text-base font-bold text-white hover:bg-emerald-800"
              >
                סיום · {lines.length} מוצרים בסל
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RecurringLinesEditor;
