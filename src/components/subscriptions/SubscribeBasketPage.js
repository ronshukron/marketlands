import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import usePickupSpots from '../../hooks/usePickupSpots';
import LoadingSpinner from '../LoadingSpinner';
import SecureCardProgress, { useResetOnPageRestore } from './SecureCardProgress';
import RecurringLinesEditor from './RecurringLinesEditor';
import { getSubscriptionBasket } from '../../services/subscriptionBasketService';
import {
  CARD_CONSENT_TEXT,
  FREQUENCY_LABELS,
  cardConsentPayload,
  createBasketSubscription,
  describeSubscriptionError,
  listMySubscriptions,
  listSignupBasketProducts,
  loadProductsInfo,
} from '../../services/basketSubscriptionService';
import {
  generateAvailableDeliveryDates,
  getDeliveryScheduleDocumentKeys,
  parseDateSafe,
} from '../../utils/deliveryScheduleUtils';
import {
  estimateRecurringLines,
  initialRecurringLines,
  isRecurringBasketChanged,
  toProductInfo,
  toRecurringPayload,
} from '../../utils/recurringBasket';
import { computeCityDeliveryFee, formatShekels, isCityPlace } from '../../utils/cityDeliveryFee';
import { validateCustomerEmail, validateCustomerName, validateCustomerPhone } from '../../utils/marketplaceCustomerValidation';

const DELIVERY_OPTION_LABELS = {
  pickup: 'איסוף מנקודת החלוקה',
  homeDelivery: 'משלוח עד הבית',
  boxCollection: 'איסוף מארגז',
};

const MAX_FIRST_DATE_OPTIONS = 8;
const DETAIL_FIELDS = ['name', 'phone', 'email', 'address'];

// Grow's card page needs a full name and a valid mobile number, so they are
// checked here, with the reason shown under the field.
const detailErrors = (details, addressRequired) => ({
  name: validateCustomerName(details.name).message,
  phone: validateCustomerPhone(details.phone).message,
  email: details.email.trim() ? validateCustomerEmail(details.email).message : '',
  address: addressRequired && !details.address.trim() ? 'יש למלא כתובת למשלוח עד הבית' : '',
});

const formatDateLabel = (dateKey) => {
  const date = parseDateSafe(dateKey);
  if (!date) return dateKey;
  return date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
};

const SubscribeBasketPage = () => {
  const { basketId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const { pickupSpotsData = {} } = usePickupSpots();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const [basket, setBasket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [community, setCommunity] = useState(searchParams.get('community') || '');
  const [schedule, setSchedule] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [deliveryOption, setDeliveryOption] = useState('');
  const [firstDeliveryDate, setFirstDeliveryDate] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [details, setDetails] = useState({ name: '', phone: '', email: '', address: '', directions: '' });
  const [touched, setTouched] = useState({});
  const [detailsAttempted, setDetailsAttempted] = useState(false);
  // '' | 'preparing' (creating the subscription) | 'redirecting' (leaving for Grow)
  const [cardStep, setCardStep] = useState('');
  const [growUrl, setGrowUrl] = useState('');
  const submitting = cardStep !== '';
  const [cardConsent, setCardConsent] = useState(false);
  // The basket as the customer changes it here; sent only when it differs from the admin basket.
  const [basketStart, setBasketStart] = useState([]);
  const [lines, setLines] = useState([]);
  const [productInfo, setProductInfo] = useState({});
  const [restored, setRestored] = useState(false);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  useResetOnPageRestore(() => setCardStep(''));

  useEffect(() => {
    let active = true;
    setLoading(true);
    getSubscriptionBasket(basketId)
      .then((result) => {
        if (active) setBasket(result && result.active ? result : null);
      })
      .catch((error) => {
        console.error('Failed to load subscription basket:', error);
        if (active) setBasket(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [basketId]);

  useEffect(() => {
    if (!basket) return undefined;
    const { lines: start } = initialRecurringLines(null, basket);
    setBasketStart(start);
    setLines(start);
    setRestored(false);
    setProductInfo(Object.fromEntries(basket.componentLines.map((line) => [line.productId, toProductInfo(line)])));
    // The basket keeps the price from when the admin saved it; deliveries are
    // priced from the product (with its quantity discount), so show that.
    let active = true;
    loadProductsInfo(start.map((line) => line.productId))
      .then((products) => {
        if (!active) return;
        setProductInfo((prev) => {
          const next = { ...prev };
          Object.entries(products).forEach(([productId, data]) => {
            next[productId] = { ...toProductInfo(data), businessName: prev[productId]?.businessName || '' };
          });
          return next;
        });
      })
      .catch((error) => console.error('Failed to load current product prices:', error));
    return () => { active = false; };
  }, [basket]);

  // Back from Grow without finishing: bring back the basket chosen last time.
  useEffect(() => {
    if (!basket || !currentUser) return undefined;
    let active = true;
    (async () => {
      try {
        const pending = (await listMySubscriptions(currentUser.uid)).find((sub) => (
          sub.basketId === basket.id && sub.status === 'pending_card' && sub.recurringLines?.length > 0
        ));
        if (!pending || !active) return;
        const { lines: previous } = initialRecurringLines(pending, null);
        const products = await loadProductsInfo(previous.map((line) => line.productId));
        if (!active) return;
        const start = initialRecurringLines(null, basket).lines;
        setProductInfo((prev) => ({
          ...Object.fromEntries(Object.entries(products).map(([id, data]) => [id, toProductInfo(data)])),
          ...prev,
        }));
        // Only when the customer has not started changing the basket on this visit.
        if (isRecurringBasketChanged(start, linesRef.current)) return;
        setLines(previous);
        setRestored(true);
      } catch (error) {
        console.error('Failed to load the earlier basket choice:', error);
      }
    })();
    return () => { active = false; };
  }, [basket, currentUser]);

  useEffect(() => {
    if (!basket) return;
    if (!community || !basket.communities.includes(community)) {
      setCommunity(basket.communities.length === 1 ? basket.communities[0] : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basket]);

  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    getDoc(doc(db, 'users', currentUser.uid))
      .then((snap) => {
        if (!active) return;
        const data = snap.exists() ? (snap.data() || {}) : {};
        setDetails((prev) => ({
          ...prev,
          name: prev.name || data.name || data.fullName || currentUser.displayName || '',
          phone: prev.phone || data.phone || data.phoneNumber || '',
          email: prev.email || data.email || currentUser.email || '',
          address: prev.address || data.address || '',
        }));
      })
      .catch(() => {
        if (active) {
          setDetails((prev) => ({
            ...prev,
            name: prev.name || currentUser.displayName || '',
            email: prev.email || currentUser.email || '',
          }));
        }
      });
    return () => {
      active = false;
    };
  }, [currentUser]);

  useEffect(() => {
    let active = true;
    setSchedule(null);
    setFirstDeliveryDate('');
    if (!community) return undefined;
    setScheduleLoading(true);
    (async () => {
      try {
        let scheduleData = null;
        for (const key of getDeliveryScheduleDocumentKeys(community)) {
          const snap = await getDoc(doc(db, 'deliverySchedules', key));
          if (snap.exists()) {
            scheduleData = snap.data();
            break;
          }
        }
        if (active) setSchedule(scheduleData);
      } catch (error) {
        console.error('Failed to load delivery schedule:', error);
        if (active) setSchedule(null);
      } finally {
        if (active) setScheduleLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [community]);

  const spotData = community ? pickupSpotsData[community] : null;
  const deliveryOptions = useMemo(() => {
    if (!spotData) return ['pickup'];
    if (isCityPlace(spotData)) return ['homeDelivery'];
    const options = Array.isArray(spotData.options) && spotData.options.length > 0 ? spotData.options : ['pickup'];
    return options.filter((option) => DELIVERY_OPTION_LABELS[option]);
  }, [spotData]);

  useEffect(() => {
    if (!deliveryOptions.includes(deliveryOption)) setDeliveryOption(deliveryOptions[0] || 'pickup');
  }, [deliveryOptions, deliveryOption]);

  const deliveryDates = useMemo(
    () => (schedule ? generateAvailableDeliveryDates(schedule).slice(0, MAX_FIRST_DATE_OPTIONS) : []),
    [schedule]
  );

  useEffect(() => {
    if (!deliveryDates.includes(firstDeliveryDate)) setFirstDeliveryDate(deliveryDates[0] || '');
  }, [deliveryDates, firstDeliveryDate]);

  const estimate = useMemo(() => estimateRecurringLines(lines, productInfo), [lines, productInfo]);
  const basketEdited = useMemo(() => isRecurringBasketChanged(basketStart, lines), [basketStart, lines]);
  const emptyBasket = Boolean(basket) && basket.componentLines.length === 0;
  const deliveryFee = useMemo(() => {
    if (deliveryOption !== 'homeDelivery' || !spotData) return 0;
    const cityFee = computeCityDeliveryFee(spotData, estimate);
    return cityFee ?? (Number(spotData.deliveryFee) || 0);
  }, [deliveryOption, spotData, estimate]);

  const updateDetail = (field) => (event) => setDetails((prev) => ({ ...prev, [field]: event.target.value }));
  const errors = detailErrors(details, deliveryOption === 'homeDelivery');
  const shownError = (field) => ((detailsAttempted || touched[field]) ? errors[field] : '');
  const detailProps = (field) => ({
    id: `sub-detail-${field}`,
    value: details[field],
    onChange: updateDetail(field),
    onBlur: () => setTouched((prev) => ({ ...prev, [field]: true })),
    'aria-invalid': Boolean(shownError(field)),
    'aria-describedby': shownError(field) ? `sub-detail-${field}-error` : undefined,
    className: `mt-1 w-full rounded-lg border px-3 py-2 ${shownError(field) ? 'border-red-500 bg-red-50' : 'border-gray-300'}`,
  });
  const fieldError = (field) => (shownError(field) ? (
    <span id={`sub-detail-${field}-error`} className="mt-1 block text-sm font-medium text-red-700" role="alert">{shownError(field)}</span>
  ) : null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const firstInvalid = DETAIL_FIELDS.find((field) => errors[field]);
    if (firstInvalid) {
      setDetailsAttempted(true);
      await Swal.fire({ icon: 'warning', title: 'צריך לתקן פרט אחד', text: errors[firstInvalid], confirmButtonText: 'לתיקון' });
      const input = document.getElementById(`sub-detail-${firstInvalid}`);
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus({ preventScroll: true });
      return;
    }
    if (!firstDeliveryDate) {
      Swal.fire('אין תאריך', 'בחרו תאריך למשלוח הראשון', 'warning');
      return;
    }
    if (lines.length === 0) {
      Swal.fire('הסל ריק', 'הוסיפו לפחות מוצר אחד לסל', 'warning');
      return;
    }
    if (!cardConsent) {
      Swal.fire('חסר אישור', 'יש לסמן את האישור לשמירת פרטי הכרטיס לחיובים עתידיים', 'warning');
      return;
    }
    setCardStep('preparing');
    try {
      const result = await createBasketSubscription({
        basketId,
        community,
        deliveryOption,
        firstDeliveryDate,
        frequency,
        customerDetails: details,
        ...(basketEdited ? { recurringLines: toRecurringPayload(lines) } : {}),
        ...cardConsentPayload(),
      });
      if (!result?.url) throw new Error('PAYMENT_PAGE_FAILED');
      // The overlay stays up while the browser leaves for Grow.
      setGrowUrl(result.url);
      setCardStep('redirecting');
      window.location.assign(result.url);
    } catch (error) {
      setCardStep('');
      const code = error?.response?.data?.error;
      if (code === 'ALREADY_SUBSCRIBED') {
        await Swal.fire('כבר רשומים', 'כבר יש לך מנוי לסל הזה. אפשר לנהל אותו בעמוד המנויים.', 'info');
        navigate('/my-subscriptions');
        return;
      }
      const productId = error?.response?.data?.productId;
      const productName = productId ? (productInfo[productId]?.productName || '') : '';
      const message = describeSubscriptionError(error);
      Swal.fire('ההרשמה נכשלה', productName ? `${message}: ${productName}` : message, 'error');
    }
  };

  if (loading || authLoading) {
    return <div className="py-12"><LoadingSpinner /></div>;
  }

  if (!basket) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center" dir="rtl">
        <h1 className="text-xl font-bold mb-2">הסל אינו זמין</h1>
        <Link to="/" className="text-emerald-700 underline">חזרה לחנות</Link>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center" dir="rtl">
        <h1 className="text-xl font-bold mb-2">{basket.title}</h1>
        <p className="text-gray-600 mb-4">כדי להירשם למנוי ולנהל אותו צריך להתחבר לחשבון.</p>
        <button
          type="button"
          onClick={() => navigate('/login', { state: { from: `${location.pathname}${location.search}` } })}
          className="px-5 py-2.5 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700"
        >
          התחברות
        </button>
      </div>
    );
  }

  const canceled = searchParams.get('canceled') === '1';

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6" dir="rtl">
      {canceled && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          שמירת הכרטיס בוטלה. אפשר לנסות שוב.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-5">
        {basket.image && <img src={basket.image} alt={basket.title} className="w-full h-48 object-cover" />}
        <div className="p-4 sm:p-5">
          <h1 className="text-2xl font-black text-gray-900">{basket.title}</h1>
          {basket.description && <p className="text-gray-600 mt-1">{basket.description}</p>}
          <div className="mt-4 max-w-sm">
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="sub-community">יישוב</label>
            <select
              id="sub-community"
              value={community}
              onChange={(event) => setCommunity(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">בחרו יישוב</option>
              {basket.communities.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <section className="mb-5 space-y-3" aria-labelledby="sub-basket-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="sub-basket-heading" className="text-lg font-bold text-gray-900">
              {emptyBasket ? 'בונים את הסל' : 'הסל שלכם'}
            </h2>
            <p className="text-sm text-gray-600">
              {emptyBasket
                ? 'בחרו את המוצרים שיגיעו אליכם בכל משלוח.'
                : 'אפשר להוסיף ולהסיר מוצרים ולשנות כמויות.'}
              {' '}כל משלוח יתחיל מהסל הזה, ואפשר לשנות אותו גם אחרי ההרשמה.
            </p>
          </div>
          {basketEdited && !emptyBasket && (
            <button
              type="button"
              onClick={() => {
                setLines(basketStart);
                setRestored(false);
              }}
              className="text-sm font-semibold text-emerald-700 underline hover:text-emerald-800"
            >
              חזרה לסל המקורי
            </button>
          )}
        </div>
        {restored && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            החזרנו את הסל שבחרתם בפעם הקודמת.
          </p>
        )}
        <RecurringLinesEditor
          lines={lines}
          setLines={setLines}
          productInfo={productInfo}
          setProductInfo={setProductInfo}
          loadCatalog={() => listSignupBasketProducts({ basketId, community, firstDeliveryDate })
            .then((result) => result.products)}
          catalogKey={`signup|${community}|${firstDeliveryDate}`}
          addDisabledText={!community ? 'בחרו יישוב כדי להוסיף מוצרים' : scheduleLoading ? 'טוענים את המוצרים ליישוב...' : ''}
          emptyText={emptyBasket ? 'עוד לא בחרתם מוצרים.' : 'הסל ריק. הוסיפו לפחות מוצר אחד.'}
          emphasizeAdd={emptyBasket}
        />
        {lines.length > 0 && (
          <p className="text-sm text-gray-700">
            הערכה לכל משלוח: <strong>{formatShekels(estimate)}</strong>
            {deliveryFee > 0 ? ` + משלוח ${formatShekels(deliveryFee)}` : ''}.
            המחיר הסופי לפי המחירים של אותו שבוע ולפי שקילה.
          </p>
        )}
      </section>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 space-y-5">
        {!community && (
          <p className="text-sm text-gray-600">בחרו יישוב למעלה כדי לראות את אפשרויות המשלוח.</p>
        )}

        {community && (
          <>
            <fieldset>
              <legend className="text-sm font-medium text-gray-700 mb-2">איך מקבלים את הסל</legend>
              <div className="flex flex-wrap gap-2">
                {deliveryOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDeliveryOption(option)}
                    aria-pressed={deliveryOption === option}
                    className={`px-4 py-2 rounded-lg border text-sm font-semibold ${
                      deliveryOption === option
                        ? 'bg-emerald-600 border-emerald-700 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-emerald-400'
                    }`}
                  >
                    {DELIVERY_OPTION_LABELS[option]}
                    {option === 'homeDelivery' ? ` (${deliveryFee > 0 ? formatShekels(deliveryFee) : 'חינם'})` : ' (חינם)'}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="sub-first-date">משלוח ראשון</label>
                {scheduleLoading ? (
                  <p className="text-sm text-gray-500">טוען תאריכים...</p>
                ) : deliveryDates.length === 0 ? (
                  <p className="text-sm text-red-600">אין כרגע תאריכי משלוח פתוחים ליישוב הזה.</p>
                ) : (
                  <select
                    id="sub-first-date"
                    value={firstDeliveryDate}
                    onChange={(event) => setFirstDeliveryDate(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    {deliveryDates.map((dateKey) => (
                      <option key={dateKey} value={dateKey}>{formatDateLabel(dateKey)}</option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-gray-500 mt-1">המשלוחים הבאים יגיעו באותו יום בשבוע.</p>
              </div>
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-1">תדירות</span>
                <div className="flex gap-2">
                  {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFrequency(value)}
                      aria-pressed={frequency === value}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold ${
                        frequency === value
                          ? 'bg-emerald-600 border-emerald-700 text-white'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-emerald-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">שם מלא</span>
            <input {...detailProps('name')} placeholder="שם פרטי ושם משפחה" autoComplete="name" />
            {fieldError('name')}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">טלפון נייד</span>
            <input {...detailProps('phone')} type="tel" inputMode="tel" placeholder="0501234567" autoComplete="tel" dir="ltr" />
            {fieldError('phone')}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">אימייל</span>
            <input {...detailProps('email')} type="email" autoComplete="email" dir="ltr" />
            {fieldError('email')}
          </label>
          {deliveryOption === 'homeDelivery' && (
            <label className="block">
              <span className="text-sm font-medium text-gray-700">כתובת</span>
              <input {...detailProps('address')} autoComplete="street-address" />
              {fieldError('address')}
            </label>
          )}
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-gray-700">הערות למשלוח (לא חובה)</span>
            <input value={details.directions} onChange={updateDetail('directions')}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
        </div>

        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-sm text-gray-700 space-y-1">
          <p>בשלב הבא תעברו לעמוד המאובטח של חברת הסליקה Grow. התשלום בכרטיס אשראי בלבד.</p>
          <p>
            פרטי הכרטיס נשמרים אצל Grow ולא אצלנו. לא מחייבים עכשיו; ייתכן שתופיע בכרטיס בדיקת אימות של ₪1
            שאינה נגבית.
          </p>
          <p>כמה ימים לפני כל משלוח נשלח לכם את הסל לעריכה. אחרי השקילה מחייבים רק על מה שנשאר בסל.</p>
          <p>אפשר לדלג על משלוח, להשהות או לבטל בכל זמן מעמוד המנויים.</p>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-gray-800 cursor-pointer">
          <input
            type="checkbox"
            checked={cardConsent}
            onChange={(event) => setCardConsent(event.target.checked)}
            required
            className="mt-1 h-5 w-5 shrink-0 accent-amber-600"
          />
          <span>{CARD_CONSENT_TEXT}</span>
        </label>

        <button
          type="submit"
          disabled={submitting || !community || !firstDeliveryDate || !cardConsent || lines.length === 0}
          className="w-full py-3 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-bold"
        >
          {submitting ? 'מעבירים לשמירת כרטיס...' : 'המשך לשמירת כרטיס'}
        </button>
      </form>
      <SecureCardProgress step={cardStep} purpose="signup" fallbackUrl={growUrl} />
    </div>
  );
};

export default SubscribeBasketPage;
