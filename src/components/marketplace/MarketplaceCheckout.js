import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import { usePickupSpot } from '../../contexts/PickupSpotContext';
import { useMarketplaceCart } from '../../contexts/MarketplaceCartContext';
import {
  getDeliveryFeeForMethod,
  normalizeStoreFulfillment,
  validateFulfillmentChoice,
} from '../../constants/marketplaceFulfillment';
import {
  DEFAULT_MANUAL_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  getMarketplaceStore,
} from '../../services/marketplaceService';
import { createMarketplaceOrderForBusiness } from './MarketplaceCreateOrder';
import { notifyMarketplaceCustomerCombinedCheckout } from '../../services/marketplaceOrderNotifications';
import { summarizeEmailNotifications } from '../../utils/marketplaceEmailSummary';
import { saveOrderConfirmationSession } from '../../utils/marketplaceOrderConfirmation';
import {
  normalizeCustomerPhone,
  validateCheckoutCustomer,
  validateCustomerEmail,
  validateCustomerName,
  validateCustomerPhone,
} from '../../utils/marketplaceCustomerValidation';
import {
  loadCheckoutCustomerProfile,
  resolveMarketplaceOrderAccount,
} from '../../services/marketplaceUserService';
import MarketplaceCheckoutAccount from './MarketplaceCheckoutAccount';
import MarketplaceFulfillmentPicker from './MarketplaceFulfillmentPicker';
import { pickupSpots } from '../../data/pickupSpots';
import LoadingSpinner from '../LoadingSpinner';
import MarketplaceSubmittingOverlay from './MarketplaceSubmittingOverlay';
import { PAYMENT_CHIP_ICONS } from '../../utils/marketplacePaymentChips';
import './marketplace.css';

const formatCurrency = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Number(value || 0));

const MarketplaceCheckout = () => {
  const navigate = useNavigate();
  const { currentUser, userLoggedIn } = useAuth();
  const { selectedPickupSpot } = usePickupSpot();
  const { cartItems, itemsByStore, cartTotal, clearStoreItems } = useMarketplaceCart();
  const storeGroups = useMemo(() => Object.values(itemsByStore), [itemsByStore]);

  const [storeMap, setStoreMap] = useState({});
  const [confirmedStores, setConfirmedStores] = useState({});
  const [fulfillmentByStore, setFulfillmentByStore] = useState({});
  const [paymentMethod, setPaymentMethod] = useState(DEFAULT_MANUAL_PAYMENT_METHODS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [wantsCreateAccount, setWantsCreateAccount] = useState(false);
  const [signupPassword, setSignupPassword] = useState('');
  const [notesByStore, setNotesByStore] = useState({});
  const [customer, setCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    community: selectedPickupSpot || '',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ name: '', phone: '', email: '' });
  const [touchedFields, setTouchedFields] = useState({ name: false, phone: false, email: false });
  const profilePrefilledRef = useRef(false);

  const validateField = (field, value) => {
    let result = { valid: true, message: '' };
    if (field === 'name') result = validateCustomerName(value);
    if (field === 'phone') result = validateCustomerPhone(value);
    if (field === 'email') result = validateCustomerEmail(value);
    setFieldErrors((current) => ({ ...current, [field]: result.message }));
    return result.valid;
  };

  const handleCustomerFieldChange = (field, value) => {
    setCustomer((current) => ({ ...current, [field]: value }));
    if (touchedFields[field]) {
      validateField(field, value);
    } else if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: '' }));
    }
  };

  const handleCustomerFieldBlur = (field, value) => {
    setTouchedFields((current) => ({ ...current, [field]: true }));
    validateField(field, value);
  };

  useEffect(() => {
    const loadStores = async () => {
      const ids = [...new Set(storeGroups.map((g) => g.businessId))];
      if (ids.length === 0) return;
      const entries = await Promise.all(
        ids.map(async (id) => {
          const store = await getMarketplaceStore(id);
          return [id, store];
        })
      );
      setStoreMap(Object.fromEntries(entries));
    };
    loadStores();
  }, [storeGroups]);

  useEffect(() => {
    if (cartItems.length === 0 && !submitting) {
      navigate('/community-marketplace', { replace: true });
    }
  }, [cartItems.length, navigate, submitting]);

  useEffect(() => {
    if (!userLoggedIn || !currentUser?.uid) {
      profilePrefilledRef.current = false;
      setWantsCreateAccount(true);
      return;
    }

    if (profilePrefilledRef.current) return;

    let cancelled = false;
    const prefill = async () => {
      setProfileLoading(true);
      try {
        const profile = await loadCheckoutCustomerProfile(currentUser);
        if (cancelled || !profile) return;

        profilePrefilledRef.current = true;
        setWantsCreateAccount(false);
        setCustomer((current) => ({
          ...current,
          name: current.name || profile.name || '',
          phone: current.phone || profile.phone || '',
          email: current.email || profile.email || currentUser.email || '',
          community: current.community || profile.community || selectedPickupSpot || '',
          userId: profile.userId || currentUser.uid,
        }));
      } catch (error) {
        console.warn('Failed to prefill checkout profile', error);
        if (!cancelled) {
          setCustomer((current) => ({
            ...current,
            email: current.email || currentUser.email || '',
            userId: current.userId || currentUser.uid || '',
          }));
          setWantsCreateAccount(false);
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };

    prefill();
    return () => {
      cancelled = true;
    };
  }, [userLoggedIn, currentUser, selectedPickupSpot]);

  useEffect(() => {
    if (selectedPickupSpot && !customer.community) {
      setCustomer((current) => ({ ...current, community: selectedPickupSpot }));
    }
  }, [customer.community, selectedPickupSpot]);

  useEffect(() => {
    setFulfillmentByStore({});
  }, [customer.community]);

  const allConfirmed =
    storeGroups.length > 0 && storeGroups.every((group) => confirmedStores[group.businessId]);

  const allFulfillmentValid = storeGroups.every((group) => {
    const store = storeMap[group.businessId];
    const fulfillment = normalizeStoreFulfillment(store);
    const choice = fulfillmentByStore[group.businessId];
    return !validateFulfillmentChoice(fulfillment, customer.community, choice?.method);
  });

  const checkoutTotals = useMemo(() => {
    let deliveryFeesTotal = 0;
    storeGroups.forEach((group) => {
      const store = storeMap[group.businessId];
      const fulfillment = normalizeStoreFulfillment(store);
      const choice = fulfillmentByStore[group.businessId];
      deliveryFeesTotal += getDeliveryFeeForMethod(fulfillment, choice?.method);
    });
    return {
      productsTotal: cartTotal,
      deliveryFeesTotal,
      grandTotal: cartTotal + deliveryFeesTotal,
    };
  }, [storeGroups, storeMap, fulfillmentByStore, cartTotal]);

  const getGroupDeliveryFee = (group) => {
    const fulfillment = normalizeStoreFulfillment(storeMap[group.businessId]);
    const choice = fulfillmentByStore[group.businessId];
    return getDeliveryFeeForMethod(fulfillment, choice?.method);
  };

  const toggleConfirmStore = (businessId) => {
    setConfirmedStores((current) => ({
      ...current,
      [businessId]: !current[businessId],
    }));
  };

  const setStoreFulfillment = (businessId, method, label) => {
    setFulfillmentByStore((current) => ({
      ...current,
      [businessId]: { method, label },
    }));
  };

  const setStoreNotes = (businessId, notes) => {
    setNotesByStore((current) => ({
      ...current,
      [businessId]: notes,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const emailForOrder = (customer.email || currentUser?.email || '').trim();
    const customerValidation = validateCheckoutCustomer({
      name: customer.name,
      phone: customer.phone,
      email: emailForOrder,
    });

    if (!customerValidation.valid) {
      setFieldErrors(customerValidation.errors);
      setTouchedFields({ name: true, phone: true, email: true });
      const firstError =
        customerValidation.errors.name ||
        customerValidation.errors.phone ||
        customerValidation.errors.email;
      Swal.fire({
        icon: 'warning',
        title: 'פרטי קשר לא תקינים',
        text: firstError,
      });
      return;
    }

    if (!customer.community) {
      Swal.fire({ icon: 'warning', title: 'בחרו קהילה' });
      return;
    }

    const normalizedPhone = normalizeCustomerPhone(customer.phone);
    const customerForOrder = {
      ...customer,
      phone: normalizedPhone,
      email: emailForOrder,
    };

    if (!userLoggedIn && !wantsCreateAccount) {
      Swal.fire({
        icon: 'warning',
        title: 'נדרש חשבון בשוק',
        text: 'סמנו את האפשרות ליצירת חשבון בשוק הבסטות, או התחברו לחשבון קיים.',
      });
      return;
    }

    if (!userLoggedIn && wantsCreateAccount && signupPassword.length < 6) {
      Swal.fire({
        icon: 'warning',
        title: 'סיסמה קצרה מדי',
        text: 'בחרו סיסמה של לפחות 6 תווים ליצירת החשבון.',
      });
      return;
    }

    if (!allConfirmed) {
      Swal.fire({
        icon: 'warning',
        title: 'אשרו את כל הבסטות',
        text: 'סמנו שאישרתם כל מקטע הזמנה לפני השליחה.',
      });
      return;
    }

    if (!allFulfillmentValid) {
      Swal.fire({
        icon: 'warning',
        title: 'אופן אספקה',
        text: 'בחרו איסוף או משלוח לכל בסטה בהתאם לקהילה שלכם.',
      });
      return;
    }

    setSubmitting(true);
    const createdOrders = [];
    const failedStores = [];
    let orderAccount = { userId: '', email: emailForOrder };

    try {
      try {
        orderAccount = await resolveMarketplaceOrderAccount({
          currentUser: userLoggedIn ? currentUser : null,
          customer: customerForOrder,
          createAccount: wantsCreateAccount,
          password: signupPassword,
          source: 'marketplace_cart_checkout',
        });
      } catch (accountError) {
        const message =
          accountError?.code === 'auth/wrong-password'
            ? 'סיסמה שגויה לחשבון הקיים. התחברו או בחרו סיסמה נכונה.'
            : accountError?.message || 'לא ניתן ליצור או להתחבר לחשבון.';
        Swal.fire({ icon: 'error', title: 'חשבון בשוק הבסטות', text: message });
        setSubmitting(false);
        return;
      }

      const sendCombinedCustomerEmail = storeGroups.length > 1;

      for (const group of storeGroups) {
        const fulfillmentChoice = fulfillmentByStore[group.businessId];
        try {
          const storeFulfillment = normalizeStoreFulfillment(storeMap[group.businessId]);
          const deliveryFee = getDeliveryFeeForMethod(storeFulfillment, fulfillmentChoice.method);

          const order = await createMarketplaceOrderForBusiness({
            businessId: group.businessId,
            storeTitle: group.storeTitle,
            lines: group.items,
            customer: {
              ...customerForOrder,
              email: orderAccount.email,
              userId: orderAccount.userId,
              fulfillmentMethod: fulfillmentChoice.method,
              fulfillmentLabel: fulfillmentChoice.label,
              deliveryFee,
              notes: notesByStore[group.businessId] || '',
            },
            paymentMethod,
            skipCustomerEmail: sendCombinedCustomerEmail,
          });
          createdOrders.push(order);
          clearStoreItems(group.businessId);
        } catch (error) {
          console.error('Failed to create marketplace order for store', group.businessId, error);
          failedStores.push(group.storeTitle || group.businessId);
        }
      }

      let combinedCustomerNotification = null;
      if (sendCombinedCustomerEmail && createdOrders.length > 0) {
        combinedCustomerNotification = await notifyMarketplaceCustomerCombinedCheckout({
          orders: createdOrders,
          customer: { ...customerForOrder, email: orderAccount.email },
          paymentMethod,
        });
      }

      if (createdOrders.length === 0) {
        Swal.fire({
          icon: 'error',
          title: 'לא נשלחה אף הזמנה',
          text: 'נסו שוב בעוד רגע.',
        });
        return;
      }

      if (failedStores.length > 0) {
        await Swal.fire({
          icon: 'warning',
          title: 'חלק מההזמנות נשלחו',
          html: `נשלחו ${createdOrders.length} הזמנות.<br/>נכשלו: ${failedStores.join(', ')}`,
        });
      }

      const emailSummary = summarizeEmailNotifications(createdOrders, {
        combinedCustomer: combinedCustomerNotification,
      });

      const confirmationPayload = {
        orders: createdOrders.map((order) => ({
          id: order.id,
          businessId: order.businessId,
          businessName: order.businessName,
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          total: order.total,
          fulfillmentLabel: order.fulfillmentLabel || order.selectedDeliveryOption,
          notifications: order.notifications,
        })),
        paymentMethod,
        customer: customerForOrder,
        emailSummary,
      };
      saveOrderConfirmationSession(confirmationPayload);
      navigate('/community-marketplace/order-confirmation', {
        replace: true,
        state: confirmationPayload,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (cartItems.length === 0) {
    return (
      <div className="mp-page flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const submitDisabled =
    submitting ||
    !allConfirmed ||
    !allFulfillmentValid ||
    (!userLoggedIn && !wantsCreateAccount);

  return (
    <div className="mp-page mp-checkout-page" dir="rtl">
      {submitting && (
        <MarketplaceSubmittingOverlay
          message={
            storeGroups.length > 1
              ? `שולח ${storeGroups.length} הזמנות לדוכנים...`
              : 'שולח את ההזמנה לשוק...'
          }
        />
      )}
      <form onSubmit={handleSubmit} className="mp-main mp-checkout-layout">
        <div className="mp-stack">
          <header className="mp-panel mp-checkout-ticket-header">
            <Link to="/community-marketplace" className="mp-link">
              ← חזרה לשוק הבסטות
            </Link>
            <p className="mp-checkout-ticket-kicker mt-3">קופת השוק</p>
            <h1 className="mp-section-title mp-section-title-chalk mt-1">קבלת הזמנה</h1>
            <p className="mp-section-note mt-2">
              הסל מחולק לפי דוכן. לכל דוכן — איסוף או משלוח, אישור, ואז שליחה.
            </p>
          </header>

          {storeGroups.map((group) => {
            const store = storeMap[group.businessId];
            const fulfillment = normalizeStoreFulfillment(store);
            const choice = fulfillmentByStore[group.businessId];
            const groupDeliveryFee = getGroupDeliveryFee(group);
            const groupTotal = group.total + groupDeliveryFee;

            return (
              <section
                key={group.businessId}
                className="mp-panel mp-checkout-ticket-stub mp-checkout-store-section"
              >
                <div className="mp-checkout-store-head">
                  <div>
                    <h2 className="mp-section-title">{group.storeTitle || 'דוכן'}</h2>
                    <p className="mp-checkout-store-meta">
                      {group.items.length} פריטים · מוצרים {formatCurrency(group.total)}
                      {groupDeliveryFee > 0 && (
                        <> · משלוח {formatCurrency(groupDeliveryFee)}</>
                      )}
                      {' · '}סה״כ {formatCurrency(groupTotal)}
                    </p>
                  </div>
                  <Link
                    to={`/community-marketplace/store/${group.businessId}/shop`}
                    className="mp-link text-sm"
                  >
                    לדוכן
                  </Link>
                </div>

                <ul className="mp-checkout-lines">
                  {group.items.map((item) => (
                    <li key={item.uid} className="mp-checkout-line">
                      {item.images?.[0] ? (
                        <img src={item.images[0]} alt="" className="mp-checkout-line-img" />
                      ) : (
                        <div className="mp-checkout-line-img mp-checkout-line-img-placeholder">
                          —
                        </div>
                      )}
                      <div className="mp-checkout-line-body">
                        <span className="mp-checkout-line-name">{item.name}</span>
                        <span className="mp-checkout-line-qty">
                          {item.quantity} × {formatCurrency(item.price)}
                        </span>
                      </div>
                      <span className="mp-checkout-line-total">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>

                <MarketplaceFulfillmentPicker
                  fulfillment={fulfillment}
                  community={customer.community}
                  value={choice?.method || ''}
                  onChange={(method, label) => setStoreFulfillment(group.businessId, method, label)}
                  showCommunitySelect={false}
                  radioGroupName={`fulfillment-${group.businessId}`}
                />

                <label className="mp-form-label mt-3">
                  הערות לדוכן זה
                  <textarea
                    className="mp-input mt-1"
                    rows={2}
                    placeholder={`הערות ל${group.storeTitle || 'דוכן'} (אופציונלי)`}
                    value={notesByStore[group.businessId] || ''}
                    onChange={(e) => setStoreNotes(group.businessId, e.target.value)}
                  />
                  <span className="mp-section-note text-xs mt-1 block">
                    הערה זו תישלח רק ל{group.storeTitle || 'דוכן זה'}, לא לשאר הדוכנים בסל.
                  </span>
                </label>

                <label className="mp-checkout-confirm-label">
                  <input
                    type="checkbox"
                    checked={Boolean(confirmedStores[group.businessId])}
                    onChange={() => toggleConfirmStore(group.businessId)}
                  />
                  <span>אישרתי את ההזמנה מ{group.storeTitle || 'דוכן זה'}</span>
                </label>
              </section>
            );
          })}
        </div>

        <aside className="mp-checkout-sidebar mp-checkout-receipt-sidebar">
          <div className="mp-panel mp-stack mp-checkout-receipt-panel">
            <p className="mp-checkout-ticket-kicker">קבלה</p>
            <h2 className="mp-section-title mp-section-title-chalk">פרטי קשר</h2>
            {profileLoading && userLoggedIn && (
              <p className="mp-section-note text-sm">טוען פרטים מהחשבון...</p>
            )}
            <label className="mp-form-label">
              שם מלא *
              <input
                type="text"
                className={`mp-input mt-1${fieldErrors.name ? ' has-error' : ''}`}
                placeholder="שם מלא"
                value={customer.name}
                onChange={(e) => handleCustomerFieldChange('name', e.target.value)}
                onBlur={(e) => handleCustomerFieldBlur('name', e.target.value)}
                autoComplete="name"
                required
                aria-invalid={Boolean(fieldErrors.name)}
              />
              {fieldErrors.name && <p className="mp-form-error mt-1">{fieldErrors.name}</p>}
            </label>
            <label className="mp-form-label">
              טלפון *
              <input
                type="tel"
                className={`mp-input mt-1${fieldErrors.phone ? ' has-error' : ''}`}
                placeholder="05X-XXXXXXX"
                value={customer.phone}
                onChange={(e) => handleCustomerFieldChange('phone', e.target.value)}
                onBlur={(e) => handleCustomerFieldBlur('phone', e.target.value)}
                autoComplete="tel"
                inputMode="tel"
                required
                aria-invalid={Boolean(fieldErrors.phone)}
              />
              {fieldErrors.phone && <p className="mp-form-error mt-1">{fieldErrors.phone}</p>}
            </label>
            <label className="mp-form-label">
              אימייל *
              <input
                type="email"
                className={`mp-input mt-1${fieldErrors.email ? ' has-error' : ''}`}
                placeholder="name@example.com"
                value={customer.email}
                onChange={(e) => handleCustomerFieldChange('email', e.target.value)}
                onBlur={(e) => handleCustomerFieldBlur('email', e.target.value)}
                required
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email && <p className="mp-form-error mt-1">{fieldErrors.email}</p>}
            </label>

            <MarketplaceCheckoutAccount
              userLoggedIn={userLoggedIn}
              currentUserEmail={currentUser?.email}
              createAccount={wantsCreateAccount}
              onCreateAccountChange={setWantsCreateAccount}
              password={signupPassword}
              onPasswordChange={setSignupPassword}
            />

            <label className="mp-form-label">
              הקהילה שלי (משפיע על אפשרויות אספקה בכל דוכן)
              <select
                className="mp-select"
                value={customer.community}
                onChange={(e) => setCustomer((c) => ({ ...c, community: e.target.value }))}
              >
                <option value="">בחרו קהילה</option>
                {pickupSpots.map((spot) => (
                  <option key={spot} value={spot}>
                    {spot}
                  </option>
                ))}
              </select>
            </label>

            <div className="mp-checkout-payment-panel mp-payment-wood-panel">
              <h2 className="mp-payment-wood-title">תשלום בשוק</h2>
              <p className="mp-payment-wood-note">
                בחרו אמצעי תשלום — התשלום ישירות לכל דוכן, לא דרך האתר
              </p>
              <div className="mp-payment-chips mp-checkout-payment-chips" role="radiogroup" aria-label="אמצעי תשלום">
                {DEFAULT_MANUAL_PAYMENT_METHODS.map((method) => (
                  <label
                    key={method}
                    className={`mp-payment-chip mp-payment-chip-select${
                      paymentMethod === method ? ' is-selected' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="checkoutPaymentMethod"
                      value={method}
                      checked={paymentMethod === method}
                      onChange={() => setPaymentMethod(method)}
                    />
                    <span className="mp-payment-chip-icon" aria-hidden="true">
                      {PAYMENT_CHIP_ICONS[method] || '•'}
                    </span>
                    {PAYMENT_METHOD_LABELS[method] || method}
                  </label>
                ))}
              </div>
            </div>

            <div className="mp-checkout-total-box">
              <div className="mp-checkout-total-row">
                <span>סכום מוצרים</span>
                <span>{formatCurrency(checkoutTotals.productsTotal)}</span>
              </div>
              {checkoutTotals.deliveryFeesTotal > 0 && (
                <div className="mp-checkout-total-row">
                  <span>דמי משלוח</span>
                  <span>{formatCurrency(checkoutTotals.deliveryFeesTotal)}</span>
                </div>
              )}
              <div className="mp-checkout-total-row is-grand">
                <span>סה״כ ({storeGroups.length} דוכנים)</span>
                <span>{formatCurrency(checkoutTotals.grandTotal)}</span>
              </div>
              <p className="mp-section-note mt-2 text-sm">
                ייווצרו {storeGroups.length} הזמנות נפרדות — אחת לכל דוכן. תשלום בשוק ישירות לבעל
                כל דוכן.
              </p>
            </div>

            <button
              type="submit"
              className="mp-btn mp-btn-wood w-full"
              disabled={submitDisabled}
            >
              {submitting ? 'שולח הזמנות...' : 'אישור ושליחה לשוק'}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
};

export default MarketplaceCheckout;
