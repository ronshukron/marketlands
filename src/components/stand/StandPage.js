import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { FiCheckCircle, FiSearch, FiX } from 'react-icons/fi';
import LoadingSpinner from '../LoadingSpinner';
import useBottomBarSpace from '../../hooks/useBottomBarSpace';
import {
  createStandCheckout,
  describeStandError,
  getStandOrderStatus,
  listStandProducts,
} from '../../services/standService';

// /stand/{standId}: the leftovers stand outside the owner's home. People scan
// the QR code, find what they took (the community's store products at the
// stand discount), enter the weight they measured (or the count), and pay
// with a card hold that the owner confirms and charges.

const money = (value) => `₪${(Number(value) || 0).toFixed(2)}`;
const isCounted = (product) => product.measurementType === 'package';
const unitText = (product) => (isCounted(product) ? "יח'" : 'ק"ג');
const storageKey = (standId) => `bastaStandCart:${standId}`;

const readSaved = (standId) => {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(standId)) || '{}') || {};
  } catch (error) {
    return {};
  }
};

const ThankYou = ({ orderId }) => {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    let active = true;
    let tries = 0;
    const check = async () => {
      tries += 1;
      try {
        const result = await getStandOrderStatus(orderId);
        if (!active) return;
        if (['held', 'settling', 'completed'].includes(result.paymentStatus)) {
          setStatus('done');
          return;
        }
      } catch (error) {
        // keep trying for a little while
      }
      if (!active) return;
      if (tries >= 10) setStatus('pending');
      else setTimeout(check, 3000);
    };
    check();
    return () => { active = false; };
  }, [orderId]);
  return (
    <div className="mx-auto max-w-md p-6 text-center [&_p]:mb-0" dir="rtl">
      {status === 'checking' && <LoadingSpinner />}
      {status === 'done' && (
        <>
          <FiCheckCircle className="mx-auto h-14 w-14 text-green-600" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-black text-gray-900">תודה!</h1>
          <p className="mt-2 text-gray-700">הכרטיס אושר. נעבור על מה שלקחתם ונחייב לפי מה שהזנתם.</p>
          <p className="mt-1 text-sm text-gray-500">בתיאבון 🌱</p>
        </>
      )}
      {status === 'pending' && (
        <>
          <h1 className="text-xl font-bold text-gray-900">מאשרים את התשלום</h1>
          <p className="mt-2 text-gray-700">זה יכול לקחת כמה דקות. אין צורך לשלם שוב.</p>
        </>
      )}
    </div>
  );
};

export default function StandPage() {
  const { standId } = useParams();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const paidOrderId = params.get('order');
  const [state, setState] = useState({ loading: true, error: '', stand: null, products: [] });
  const [quantities, setQuantities] = useState(() => readSaved(standId));
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const searchRef = useRef(null);
  // The pay bar is pinned to the bottom: keep the accessibility button above it.
  useBottomBarSpace(!paidOrderId);

  useEffect(() => {
    if (paidOrderId) return undefined;
    let active = true;
    listStandProducts(standId)
      .then((result) => { if (active) setState({ loading: false, error: '', stand: result.stand, products: result.products || [] }); })
      .catch((error) => { if (active) setState({ loading: false, error: describeStandError(error), stand: null, products: [] }); });
    return () => { active = false; };
  }, [standId, paidOrderId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(standId), JSON.stringify(quantities));
    } catch (error) {
      // private mode: the choice just is not kept
    }
  }, [standId, quantities]);

  const productsById = useMemo(() => new Map(state.products.map((product) => [product.productId, product])), [state.products]);
  const categories = useMemo(() => [...new Set(state.products.map((product) => product.category).filter(Boolean))], [state.products]);
  const query = search.trim();
  const visible = useMemo(() => state.products.filter((product) => (
    (!category || product.category === category)
    && (!query || product.productName.includes(query) || (product.businessName || '').includes(query))
  )), [state.products, category, query]);
  const chosen = useMemo(() => Object.entries(quantities)
    .map(([productId, quantity]) => ({ product: productsById.get(productId), quantity: Number(quantity) }))
    .filter(({ product, quantity }) => product && quantity > 0)
    .map(({ product, quantity }) => ({ product, quantity, lineTotal: Math.round(quantity * product.standPrice * 100) / 100 })),
  [quantities, productsById]);
  const total = Math.round(chosen.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;

  if (paidOrderId) return <ThankYou orderId={paidOrderId} />;
  if (state.loading) return <div className="py-12"><LoadingSpinner /></div>;
  if (state.error) {
    return <div className="mx-auto max-w-md p-6 text-center text-gray-700" dir="rtl">{state.error}</div>;
  }

  const setQuantity = (productId, value) => setQuantities((prev) => {
    const next = { ...prev };
    if (value === '' || value === null || Number(value) <= 0) delete next[productId];
    else next[productId] = value;
    return next;
  });

  const pay = async () => {
    setFormError('');
    setSubmitting(true);
    try {
      const result = await createStandCheckout({
        standId,
        items: chosen.map(({ product, quantity }) => ({ productId: product.productId, quantity })),
        customer,
      });
      if (!result?.url) throw new Error('PAYMENT_PAGE_FAILED');
      window.location.assign(result.url);
    } catch (error) {
      setFormError(describeStandError(error));
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl pb-28 text-right [&_p]:mb-0" dir="rtl">
      <header className="bg-gradient-to-b from-emerald-700 to-emerald-600 px-4 pb-5 pt-6 text-white">
        <h1 className="text-2xl font-black">{state.stand?.name || 'בסטה ליד הבית'}</h1>
        <p className="mt-1 text-lg font-bold">{state.stand?.discountPercent || 0}% הנחה על הכל</p>
        <p className="mt-1 text-sm text-emerald-50">
          מצאו מה לקחתם, שקלו מה שצריך שקילה והזינו את הכמות. התשלום בכרטיס, ונחייב אחרי שנעבור על ההזמנה.
        </p>
        {state.stand?.note && <p className="mt-2 rounded-lg bg-white/15 px-3 py-2 text-sm">{state.stand.note}</p>}
      </header>
      {params.get('canceled') === '1' && (
        <p className="mx-4 mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">התשלום בוטל. אפשר לנסות שוב.</p>
      )}

      <div className="sticky top-0 z-10 space-y-2 bg-white/95 px-4 pb-2 pt-3 backdrop-blur">
        <div className="relative">
          <FiSearch className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="חיפוש: עגבנייה, מלפפון…" aria-label="חיפוש מוצר"
            className="w-full rounded-xl border border-gray-300 py-2.5 pl-3 pr-9 text-base" />
        </div>
        {categories.length > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {['', ...categories].map((name) => (
              <button key={name || 'all'} type="button" onClick={() => setCategory(name)} aria-pressed={category === name}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-semibold ${
                  category === name ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-gray-300 bg-white text-gray-700'
                }`}>
                {name || 'הכל'}
              </button>
            ))}
          </div>
        )}
      </div>

      <ul className="divide-y divide-gray-100 px-4">
        {visible.map((product) => {
          const value = quantities[product.productId] ?? '';
          const counted = isCounted(product);
          return (
            <li key={product.productId} className="flex items-center gap-3 py-3">
              {product.image ? (
                <img src={product.image} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="h-14 w-14 shrink-0 rounded-lg bg-gray-100" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900">{product.productName}</p>
                <p className="text-sm">
                  <span className="font-bold text-emerald-700">{money(product.standPrice)}</span>
                  <span className="text-xs text-gray-500">/{unitText(product)} </span>
                  <span className="text-xs text-gray-400 line-through">{money(product.price)}</span>
                </p>
              </div>
              <label className="flex shrink-0 flex-col items-center text-[11px] text-gray-500">
                <input
                  type="number"
                  inputMode={counted ? 'numeric' : 'decimal'}
                  min="0"
                  step={counted ? 1 : 0.05}
                  value={value}
                  onChange={(event) => setQuantity(product.productId, event.target.value)}
                  placeholder="0"
                  aria-label={`כמה ${unitText(product)} ${product.productName}`}
                  className={`h-11 w-20 rounded-lg border px-2 text-center text-base font-semibold ${Number(value) > 0 ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300'}`}
                />
                {counted ? 'יחידות' : 'ק"ג (שקלתי)'}
              </label>
            </li>
          );
        })}
        {visible.length === 0 && <li className="py-10 text-center text-sm text-gray-500">לא נמצאו מוצרים</li>}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="shrink-0 leading-tight">
            <p className="text-[11px] text-gray-500">{chosen.length} מוצרים</p>
            <p className="text-lg font-black text-gray-900">{money(total)}</p>
          </div>
          <button type="button" disabled={chosen.length === 0} onClick={() => setCheckoutOpen(true)}
            className="h-12 flex-1 rounded-xl bg-emerald-700 text-base font-bold text-white disabled:bg-gray-300">
            לתשלום
          </button>
        </div>
      </div>

      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="תשלום">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl" style={{ maxHeight: '92dvh' }}>
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-lg font-bold">מה לקחתם</h2>
              <button type="button" onClick={() => setCheckoutOpen(false)} aria-label="סגירה"
                className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
                <FiX className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              <ul className="space-y-1 text-sm">
                {chosen.map(({ product, quantity, lineTotal }) => (
                  <li key={product.productId} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{product.productName} · {quantity} {unitText(product)}</span>
                    <span className="shrink-0 font-semibold">{money(lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <p className="flex justify-between border-t pt-2 text-base font-black"><span>סה"כ</span><span>{money(total)}</span></p>
              {[
                ['name', 'שם מלא', 'text', 'name'],
                ['phone', 'טלפון נייד', 'tel', 'tel'],
                ['email', 'אימייל (לא חובה, לקבלה)', 'email', 'email'],
              ].map(([field, label, type, autoComplete]) => (
                <label key={field} className="block text-sm font-medium text-gray-700">
                  {label}
                  <input type={type} autoComplete={autoComplete} value={customer[field]}
                    onChange={(event) => setCustomer((prev) => ({ ...prev, [field]: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base" />
                </label>
              ))}
              <p className="text-xs text-gray-500">
                בדף התשלום יתבקש אישור בכרטיס על {money(total)}. החיוב עצמו יתבצע אחרי שנעבור על ההזמנה, ולא יותר מהסכום הזה.
              </p>
              {formError && <p role="alert" className="text-sm font-semibold text-red-600">{formError}</p>}
            </div>
            <div className="shrink-0 border-t border-gray-100 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              <button type="button" onClick={pay} disabled={submitting}
                className="h-12 w-full rounded-xl bg-emerald-700 text-base font-bold text-white disabled:opacity-60">
                {submitting ? 'פותחים את דף התשלום…' : `לתשלום מאובטח · ${money(total)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
