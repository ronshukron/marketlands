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
  loadCheckoutCustomerProfile,
  resolveMarketplaceOrderAccount,
} from '../../services/marketplaceUserService';
import MarketplaceCheckoutAccount from './MarketplaceCheckoutAccount';
import MarketplaceFulfillmentPicker from './MarketplaceFulfillmentPicker';
import { pickupSpots } from '../../data/pickupSpots';
import LoadingSpinner from '../LoadingSpinner';
import MarketplaceSubmittingOverlay from './MarketplaceSubmittingOverlay';
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
  const profilePrefilledRef = useRef(false);

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

    if (!customer.name.trim() || !customer.phone.trim()) {
      Swal.fire({ icon: 'warning', title: 'חסרים פרטי קשר', text: 'שם וטלפון הם שדות חובה.' });
      return;
    }

    if (!customer.community) {
      Swal.fire({ icon: 'warning', title: 'בחרו קהילה' });
      return;
    }

    const emailForOrder = (customer.email || currentUser?.email || '').trim();
    if (!emailForOrder) {
      Swal.fire({
        icon: 'warning',
        title: 'נדרש אימייל',
        text: 'הזינו אימייל לשיוך ההזמנה לחשבון.',
      });
      return;
    }

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
          customer,
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
              ...customer,
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
          customer: { ...customer, email: orderAccount.email },
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
        customer,
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

  return (
    <div className="mp-page py-8" dir="rtl">
      {submitting && (
        <MarketplaceSubmittingOverlay
          message={
            storeGroups.length > 1
              ? `שולח ${storeGroups.length} הזמנות לבסטות...`
              : 'שולח את ההזמנה...'
          }
        />
      )}
      <form onSubmit={handleSubmit} className="mp-main mp-checkout-layout">
        <div className="mp-stack">
          <div className="mp-panel">
            <Link to="/community-marketplace" className="mp-link">
              ← חזרה לשוק הבסטות
            </Link>
            <h1 className="mp-section-title mt-3">אישור הזמנה</h1>
            <p className="mp-section-note mt-1">
              הסל מחולק לפי בסטה. לכל בסטה בחרו איסוף או משלוח, אשרו את המקטע, ואז שלחו.
            </p>
          </div>

          {storeGroups.map((group) => {
            const store = storeMap[group.businessId];
            const fulfillment = normalizeStoreFulfillment(store);
            const choice = fulfillmentByStore[group.businessId];
            const groupDeliveryFee = getGroupDeliveryFee(group);
            const groupTotal = group.total + groupDeliveryFee;

            return (
              <section key={group.businessId} className="mp-panel mp-checkout-store-section">
                <div className="mp-checkout-store-head">
                  <div>
                    <h2 className="mp-section-title">{group.storeTitle || 'בסטה'}</h2>
                    <p className="text-sm text-gray-600 mt-1">
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
                    לחנות הבסטה
                  </Link>
                </div>

                <ul className="mp-checkout-lines">
                  {group.items.map((item) => (
                    <li key={item.uid} className="mp-checkout-line">
                      {item.images?.[0] ? (
                        <img src={item.images[0]} alt={item.name} className="mp-checkout-line-img" />
                      ) : (
                        <div className="mp-checkout-line-img mp-checkout-line-img-placeholder">
                          ללא
                        </div>
                      )}
                      <div className="mp-checkout-line-body">
                        <span className="font-semibold">{item.name}</span>
                        <span className="text-sm text-gray-600">
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
                  הערות לבסטה זו
                  <textarea
                    className="mp-input mt-1"
                    rows={2}
                    placeholder={`הערות ל${group.storeTitle || 'בסטה'} (אופציונלי)`}
                    value={notesByStore[group.businessId] || ''}
                    onChange={(e) => setStoreNotes(group.businessId, e.target.value)}
                  />
                  <span className="text-xs text-gray-500 mt-1 block">
                    הערה זו תישלח רק ל{group.storeTitle || 'בסטה זו'}, לא לשאר הבסטות בסל.
                  </span>
                </label>

                <label className="mp-checkout-confirm-label">
                  <input
                    type="checkbox"
                    checked={Boolean(confirmedStores[group.businessId])}
                    onChange={() => toggleConfirmStore(group.businessId)}
                  />
                  אישרתי את ההזמנה מ{group.storeTitle || 'בסטה זו'}
                </label>
              </section>
            );
          })}
        </div>

        <aside className="mp-checkout-sidebar">
          <div className="mp-panel mp-stack">
            <h2 className="mp-section-title">פרטי קשר</h2>
            {profileLoading && userLoggedIn && (
              <p className="text-sm text-gray-500">טוען פרטים מהחשבון...</p>
            )}
            <input
              type="text"
              className="mp-input"
              placeholder="שם מלא *"
              value={customer.name}
              onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
              autoComplete="name"
              required
            />
            <input
              type="tel"
              className="mp-input"
              placeholder="טלפון *"
              value={customer.phone}
              onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
              autoComplete="tel"
              required
            />
            <input
              type="email"
              className="mp-input"
              placeholder="אימייל *"
              value={customer.email}
              onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
              required
              autoComplete="email"
            />

            <MarketplaceCheckoutAccount
              userLoggedIn={userLoggedIn}
              currentUserEmail={currentUser?.email}
              createAccount={wantsCreateAccount}
              onCreateAccountChange={setWantsCreateAccount}
              password={signupPassword}
              onPasswordChange={setSignupPassword}
            />

            <label className="mp-form-label">
              הקהילה שלי (משפיע על אפשרויות אספקה בכל בסטה)
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

            <h2 className="mp-section-title mt-2">אמצעי תשלום</h2>
            <select
              className="mp-select"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {DEFAULT_MANUAL_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method] || method}
                </option>
              ))}
            </select>

            <div className="mp-checkout-total-box">
              <div className="flex justify-between text-sm text-gray-600">
                <span>סכום מוצרים</span>
                <span>{formatCurrency(checkoutTotals.productsTotal)}</span>
              </div>
              {checkoutTotals.deliveryFeesTotal > 0 && (
                <div className="flex justify-between text-sm text-gray-600 mt-1">
                  <span>דמי משלוח</span>
                  <span>{formatCurrency(checkoutTotals.deliveryFeesTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold mt-2">
                <span>סה״כ ({storeGroups.length} בסטות)</span>
                <span>{formatCurrency(checkoutTotals.grandTotal)}</span>
              </div>
              <p className="mp-section-note mt-2 text-sm">
                ייווצרו {storeGroups.length} הזמנות נפרדות — אחת לכל בסטה. התשלום ישירות לכל בסטה, לא
                דרך האתר.
              </p>
            </div>

            <button
              type="submit"
              className="mp-btn mp-btn-wood w-full"
              disabled={
                submitting ||
                !allConfirmed ||
                !allFulfillmentValid ||
                (!userLoggedIn && !wantsCreateAccount)
              }
              style={{
                opacity:
                  submitting ||
                  !allConfirmed ||
                  !allFulfillmentValid ||
                  (!userLoggedIn && !wantsCreateAccount)
                    ? 0.6
                    : 1,
              }}
            >
              {submitting ? 'שולח הזמנות...' : 'אישור ושליחה'}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
};

export default MarketplaceCheckout;
