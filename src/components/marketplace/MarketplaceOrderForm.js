import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import { usePickupSpot } from '../../contexts/PickupSpotContext';
import {
  loadCheckoutCustomerProfile,
  resolveMarketplaceOrderAccount,
} from '../../services/marketplaceUserService';
import MarketplaceCheckoutAccount from './MarketplaceCheckoutAccount';
import {
  FULFILLMENT_METHOD_VOLUNTEER_PICKUP,
  getDeliveryFeeForMethod,
  resolvePromotionFulfillment,
  validateFulfillmentChoice,
} from '../../constants/marketplaceFulfillment';
import {
  DEFAULT_MANUAL_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  getMarketplaceStore,
  getMarketplacePromotionWithProducts,
  placeMarketplaceManualOrder,
} from '../../services/marketplaceService';
import {
  findActiveMarketplaceVolunteerForCommunity,
  listActiveMarketplaceVolunteersForPromotion,
} from '../../services/marketplaceVolunteerService';
import { notifyMarketplaceOrderForBusinessId } from '../../services/marketplaceOrderNotifications';
import { summarizeEmailNotifications } from '../../utils/marketplaceEmailSummary';
import LoadingSpinner from '../LoadingSpinner';
import MarketplaceSubmittingOverlay from './MarketplaceSubmittingOverlay';
import MarketplaceFulfillmentPicker from './MarketplaceFulfillmentPicker';
import MarketplaceVolunteerPickupPanel from './MarketplaceVolunteerPickupPanel';
import { saveOrderConfirmationSession } from '../../utils/marketplaceOrderConfirmation';
import { getPromotionDeadlineChip } from '../../utils/marketplacePromotionDeadline';
import { formatPromotionClosingDateTime } from '../../utils/marketplacePromotionSchedule';
import { PAYMENT_CHIP_ICONS } from '../../utils/marketplacePaymentChips';
import {
  clampCartQuantityToStock,
  getProductStockLimit,
  isMarketplaceProductInStock,
} from '../../utils/marketplaceProductStock';
import './marketplace.css';

const formatCurrency = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('he-IL');
};

const MarketplaceOrderForm = () => {
  const { promotionId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userLoggedIn } = useAuth();
  const { selectedPickupSpot } = usePickupSpot();
  const [promotion, setPromotion] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [wantsCreateAccount, setWantsCreateAccount] = useState(false);
  const [signupPassword, setSignupPassword] = useState('');
  const [quantities, setQuantities] = useState({});
  const [customer, setCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    community: selectedPickupSpot || '',
    notes: '',
  });
  const [fulfillmentMethod, setFulfillmentMethod] = useState('');
  const [fulfillmentLabel, setFulfillmentLabel] = useState('');
  const [selectedVolunteerId, setSelectedVolunteerId] = useState(null);
  const [communityVolunteer, setCommunityVolunteer] = useState(null);
  const [volunteerCommunities, setVolunteerCommunities] = useState([]);
  const [volunteersLoading, setVolunteersLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('bit');
  const [agreeToMarketplaceTerms, setAgreeToMarketplaceTerms] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const profilePrefilledRef = useRef(false);

  useEffect(() => {
    const loadPromotion = async () => {
      setLoading(true);
      try {
        const data = await getMarketplacePromotionWithProducts(promotionId);
        setPromotion(data);
        if (data?.businessId) {
          const storeDoc = await getMarketplaceStore(data.businessId);
          setStore(storeDoc);
        }
        const methods = data?.manualPaymentMethods?.length
          ? data.manualPaymentMethods
          : DEFAULT_MANUAL_PAYMENT_METHODS;
        setPaymentMethod(methods[0] || 'bit');
      } catch (error) {
        console.error('Failed to load marketplace promotion', error);
      } finally {
        setLoading(false);
      }
    };

    loadPromotion();
  }, [promotionId]);

  useEffect(() => {
    if (!userLoggedIn || !currentUser?.uid) {
      profilePrefilledRef.current = false;
      return;
    }

    if (profilePrefilledRef.current) return;

    let cancelled = false;
    const prefillProfile = async () => {
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
        console.warn('Failed to prefill promotion order profile', error);
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

    prefillProfile();
    return () => {
      cancelled = true;
    };
  }, [userLoggedIn, currentUser, selectedPickupSpot]);

  useEffect(() => {
    if (selectedPickupSpot) {
      setCustomer((current) => ({
        ...current,
        community: current.community || selectedPickupSpot,
      }));
    }
  }, [selectedPickupSpot]);

  const prevCommunityRef = useRef(customer.community);
  useEffect(() => {
    if (prevCommunityRef.current === customer.community) return;
    prevCommunityRef.current = customer.community;
    setFulfillmentMethod('');
    setFulfillmentLabel('');
    setSelectedVolunteerId(null);
  }, [customer.community]);

  const fulfillment = useMemo(
    () => (promotion ? resolvePromotionFulfillment(promotion, store) : null),
    [promotion, store]
  );

  useEffect(() => {
    let cancelled = false;
    const loadVolunteers = async () => {
      if (!promotion?.id || promotion.allowVolunteerPickup !== true) {
        setVolunteerCommunities([]);
        setCommunityVolunteer(null);
        return;
      }
      setVolunteersLoading(true);
      try {
        const active = await listActiveMarketplaceVolunteersForPromotion(promotion.id);
        if (cancelled) return;
        setVolunteerCommunities(
          active.map((entry) => entry.community).filter(Boolean)
        );
        if (customer.community) {
          const match = await findActiveMarketplaceVolunteerForCommunity({
            promotionId: promotion.id,
            community: customer.community,
          });
          if (!cancelled) setCommunityVolunteer(match);
        } else if (!cancelled) {
          setCommunityVolunteer(null);
        }
      } catch (error) {
        console.warn('Failed to load marketplace volunteers', error);
        if (!cancelled) {
          setVolunteerCommunities([]);
          setCommunityVolunteer(null);
        }
      } finally {
        if (!cancelled) setVolunteersLoading(false);
      }
    };
    loadVolunteers();
    return () => {
      cancelled = true;
    };
  }, [promotion?.id, promotion?.allowVolunteerPickup, customer.community]);

  const products = useMemo(() => promotion?.products || [], [promotion]);
  const paymentMethods = promotion?.manualPaymentMethods?.length
    ? promotion.manualPaymentMethods
    : DEFAULT_MANUAL_PAYMENT_METHODS;

  useEffect(() => {
    if (!paymentMethods.length) return;
    if (!paymentMethods.includes(paymentMethod)) {
      setPaymentMethod(paymentMethods[0]);
    }
  }, [paymentMethods, paymentMethod]);

  const orderLines = useMemo(() => {
    return products
      .map((product) => ({
        productId: product.id,
        name: product.name,
        price: Number(product.price || 0),
        quantity: Number(quantities[product.id] || 0),
      }))
      .filter((line) => line.quantity > 0);
  }, [products, quantities]);

  const subtotal = orderLines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const deliveryFee = getDeliveryFeeForMethod(fulfillment, fulfillmentMethod);
  const orderTotal = subtotal + deliveryFee;

  const submitDisabled =
    submitting || products.length === 0 || (!userLoggedIn && !wantsCreateAccount);

  const handleQuantityChange = (productId, value) => {
    const product = products.find((entry) => entry.id === productId);
    const quantity = product
      ? clampCartQuantityToStock(product, value)
      : Math.max(0, Number(value || 0));
    setQuantities((current) => ({ ...current, [productId]: quantity }));
  };

  const handleFulfillmentChange = useCallback((method, label, option = null) => {
    setFulfillmentMethod(method);
    setFulfillmentLabel(label);
    setSelectedVolunteerId(
      method === FULFILLMENT_METHOD_VOLUNTEER_PICKUP
        ? option?.volunteerId || communityVolunteer?.id || null
        : null
    );
  }, [communityVolunteer?.id]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!customer.name.trim() || !customer.phone.trim()) {
      Swal.fire({ icon: 'warning', title: 'חסרים פרטי קשר', text: 'שם וטלפון הם שדות חובה.' });
      return;
    }

    if (!customer.community) {
      Swal.fire({ icon: 'warning', title: 'בחרו קהילה', text: 'יש לבחור קהילה כדי לבדוק אפשרויות אספקה.' });
      return;
    }

    const volunteerAvailable = Boolean(communityVolunteer);
    const fulfillmentError = validateFulfillmentChoice(
      fulfillment,
      customer.community,
      fulfillmentMethod,
      { volunteerAvailable }
    );
    if (fulfillmentError) {
      Swal.fire({ icon: 'warning', title: 'אופן אספקה', text: fulfillmentError });
      return;
    }
    if (
      fulfillmentMethod === FULFILLMENT_METHOD_VOLUNTEER_PICKUP &&
      !selectedVolunteerId &&
      !communityVolunteer?.id
    ) {
      Swal.fire({
        icon: 'warning',
        title: 'נקודת מתנדב',
        text: 'בחרו קהילה עם נקודת מתנדב פעילה, או פתחו נקודה חדשה.',
      });
      return;
    }

    if (orderLines.length === 0) {
      Swal.fire({ icon: 'warning', title: 'לא נבחרו מוצרים', text: 'בחרו לפחות מוצר אחד להזמנה.' });
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

    if (!agreeToMarketplaceTerms) {
      Swal.fire({
        icon: 'warning',
        title: 'תקנון השוק',
        text: 'יש לאשר את תקנון שוק הקהילתי לפני שליחת ההזמנה.',
      });
      return;
    }

    setSubmitting(true);
    try {
      let orderAccount;
      try {
        orderAccount = await resolveMarketplaceOrderAccount({
          currentUser: userLoggedIn ? currentUser : null,
          customer,
          createAccount: wantsCreateAccount,
          password: signupPassword,
          source: 'marketplace_promotion_order',
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

      const volunteerIdForOrder =
        fulfillmentMethod === FULFILLMENT_METHOD_VOLUNTEER_PICKUP
          ? selectedVolunteerId || communityVolunteer?.id || null
          : null;
      const order = await placeMarketplaceManualOrder({
        promotion,
        customer: {
          ...customer,
          email: orderAccount.email,
          userId: orderAccount.userId,
          fulfillmentMethod,
          fulfillmentLabel,
          deliveryFee,
          volunteerId: volunteerIdForOrder,
        },
        lines: orderLines,
        selectedDeliveryOption: fulfillmentLabel,
        paymentMethod,
        marketplaceTermsAcceptedAt: new Date().toISOString(),
        volunteerId: volunteerIdForOrder,
      });

      const notifications = await notifyMarketplaceOrderForBusinessId({
        businessId: promotion.businessId,
        order,
        customer: { ...customer, email: orderAccount.email, fulfillmentLabel },
        paymentMethod,
        fulfillmentLabel,
        storeTitle: promotion.businessName,
        orderKind: 'promotion',
        promotion: {
          id: promotion.id,
          title: promotion.title,
          deliveryDate: promotion.deliveryDate,
          endsAt: promotion.endsAt,
        },
      });

      const confirmationPayload = {
        orders: [
          {
            id: order.id,
            businessId: order.businessId,
            businessName: order.businessName,
            subtotal: order.subtotal,
            deliveryFee: order.deliveryFee,
            total: order.total,
            paymentMethod: order.paymentMethod || paymentMethod,
            fulfillmentLabel: fulfillmentLabel || order.selectedDeliveryOption,
            notifications,
          },
        ],
        paymentMethod,
        customer: { ...customer, email: orderAccount.email, fulfillmentMethod, fulfillmentLabel },
        emailSummary: summarizeEmailNotifications([notifications]),
      };
      saveOrderConfirmationSession(confirmationPayload);
      navigate('/community-marketplace/order-confirmation', {
        replace: true,
        state: confirmationPayload,
      });
    } catch (error) {
      console.error('Failed to place marketplace order', error);
      Swal.fire({ icon: 'error', title: 'שגיאה בשליחת ההזמנה', text: error.message || 'נסו שוב בעוד רגע.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mp-page flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!promotion) {
    return (
      <div className="mp-page" dir="rtl">
        <div className="mp-main text-center py-12">
          <h1 className="mp-section-title mb-3">ההזמנה השבועית לא נמצאה</h1>
          <Link to="/community-marketplace" className="mp-link">
            חזרה לשוק הבסטות
          </Link>
        </div>
      </div>
    );
  }

  const deadlineChip = getPromotionDeadlineChip(promotion.endsAt);

  return (
    <div className="mp-page mp-order-form-page" dir="rtl">
      {submitting && <MarketplaceSubmittingOverlay message="שולח את ההזמנה לשוק..." />}
      <form onSubmit={handleSubmit} className="mp-main">
        <div className="mp-order-layout">
          <div className="mp-stack">
            <header className="mp-order-panel mp-order-panel-hero">
              <Link to="/community-marketplace" className="mp-link">
                ← חזרה לשוק הבסטות
              </Link>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="mp-weekly-board-label">מהשדה השבוע</span>
                {deadlineChip && !deadlineChip.past && (
                  <span
                    className={`mp-deadline-chip${deadlineChip.soon ? ' is-soon' : ''}`}
                  >
                    {deadlineChip.text}
                  </span>
                )}
              </div>
              <h1 className="mp-section-title mp-section-title-chalk mt-2">
                {promotion.title}
              </h1>
              <p className="mp-weekly-board-business">{promotion.businessName}</p>
              {promotion.description && (
                <p className="mp-section-note mt-3">{promotion.description}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                {formatDate(promotion.startsAt) && (
                  <span className="mp-tag">נפתח {formatDate(promotion.startsAt)}</span>
                )}
                {formatPromotionClosingDateTime(promotion.endsAt) && (
                  <span className="mp-tag">
                    סגירה {formatPromotionClosingDateTime(promotion.endsAt)}
                  </span>
                )}
                {promotion.deliveryDate && (
                  <span className="mp-badge mp-crate-badge">
                    משלוח מרוכז {promotion.deliveryDate}
                  </span>
                )}
              </div>
            </header>

            <section
              id="order-step-products"
              className="mp-order-panel mp-order-panel-step"
              data-step-label="שלב 1 · מוצרים"
              aria-labelledby="order-products-title"
            >
              <h2 id="order-products-title" className="mp-section-title mp-section-title-chalk mb-4">
                בחרו מהדוכן
              </h2>
              {products.length === 0 ? (
                <div className="mp-alert mp-alert-warn">
                  אין מוצרים מאושרים זמינים בהזמנה הזו כרגע.
                </div>
              ) : (
                <ul className="mp-order-slip-list">
                  {products.map((product) => {
                    const qty = Number(quantities[product.id] || 0);
                    const inStock = isMarketplaceProductInStock(product);
                    const stockLimit = getProductStockLimit(product);
                    const atMaxStock = stockLimit !== null && qty >= stockLimit;

                    return (
                      <li
                        key={product.id}
                        className={`mp-order-slip-line${qty > 0 ? ' is-selected' : ''}`}
                      >
                        {product.images?.[0] ? (
                          <img
                            src={product.images[0]}
                            alt=""
                            className="mp-order-slip-thumb"
                          />
                        ) : (
                          <div className="mp-order-slip-thumb mp-order-slip-thumb-placeholder">
                            —
                          </div>
                        )}
                        <div className="mp-order-slip-body">
                          <div className="mp-order-slip-name">{product.name}</div>
                          {product.description && (
                            <p className="mp-order-slip-desc">{product.description}</p>
                          )}
                          <div className="mp-order-slip-meta">
                            <span className="mp-order-slip-price">
                              {formatCurrency(product.price)}
                            </span>
                            {stockLimit !== null && (
                              <span
                                className={`mp-order-slip-stock${
                                  !inStock ? ' is-out' : ''
                                }`}
                              >
                                {inStock ? `מלאי: ${stockLimit}` : 'אזל המלאי'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mp-order-slip-qty">
                          <span className="mp-order-slip-qty-label">כמות</span>
                          <div className="mp-order-product-qty">
                            <button
                              type="button"
                              className="mp-cart-qty-btn"
                              onClick={() => handleQuantityChange(product.id, qty - 1)}
                              disabled={qty <= 0}
                              aria-label={`הפחתת כמות ${product.name}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <span className="mp-cart-qty" aria-live="polite">
                              {qty}
                            </span>
                            <button
                              type="button"
                              className="mp-cart-qty-btn"
                              onClick={() => handleQuantityChange(product.id, qty + 1)}
                              disabled={!inStock || atMaxStock}
                              aria-label={`הוספת כמות ${product.name}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <aside className="mp-order-sidebar-panel">
            <div className="mp-order-panel mp-stack">
              <h2 className="mp-section-title mp-section-title-chalk">פרטי ההזמנה</h2>
              {profileLoading && (
                <p className="mp-section-note text-sm">טוען את הפרטים מהחשבון שלכם...</p>
              )}
              <input
                type="text"
                value={customer.name}
                onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))}
                placeholder="שם מלא *"
                className="mp-input"
                autoComplete="name"
              />
              <input
                type="tel"
                value={customer.phone}
                onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))}
                placeholder="טלפון *"
                className="mp-input"
                autoComplete="tel"
              />
              <input
                type="email"
                value={customer.email}
                onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))}
                placeholder="אימייל *"
                className="mp-input"
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
                loginRedirectPath={`/community-marketplace/order/${promotionId}`}
              />

              <section
                id="order-step-fulfillment"
                className="mp-order-section-divider mp-order-panel-step"
                data-step-label="שלב 2 · איסוף"
              >
                <MarketplaceFulfillmentPicker
                  fulfillment={fulfillment}
                  community={customer.community}
                  value={fulfillmentMethod}
                  onChange={handleFulfillmentChange}
                  onCommunityChange={(community) =>
                    setCustomer((current) => ({ ...current, community }))
                  }
                  radioGroupName={`fulfillment-order-${promotionId}`}
                  volunteerAvailable={Boolean(communityVolunteer)}
                  volunteer={communityVolunteer}
                  volunteerCommunities={volunteerCommunities}
                />
                <MarketplaceVolunteerPickupPanel
                  promotionId={promotionId}
                  allowVolunteerPickup={promotion?.allowVolunteerPickup === true}
                  community={customer.community}
                  volunteer={communityVolunteer}
                  loading={volunteersLoading}
                />
              </section>

              <section
                id="order-step-payment"
                className="mp-order-section-divider mp-order-panel-step"
                data-step-label="שלב 3 · תשלום"
              >
                <div className="mp-checkout-payment-panel mp-payment-wood-panel">
                  <h3 className="mp-payment-wood-title">תשלום בשוק</h3>
                  <p className="mp-payment-wood-note">
                    בחרו אמצעי תשלום — ישירות לדוכן, לא דרך האתר
                  </p>
                  <div
                    className="mp-payment-chips mp-checkout-payment-chips"
                    role="radiogroup"
                    aria-label="אמצעי תשלום"
                  >
                    {paymentMethods.map((method) => (
                      <label
                        key={method}
                        className={`mp-payment-chip mp-payment-chip-select${
                          paymentMethod === method ? ' is-selected' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="orderPaymentMethod"
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
                <textarea
                  value={customer.notes}
                  onChange={(event) =>
                    setCustomer((current) => ({ ...current, notes: event.target.value }))
                  }
                  placeholder="הערות לדוכן (אופציונלי)"
                  rows={3}
                  className="mp-textarea mt-3"
                />
              </section>

              <section
                id="order-step-submit"
                className="mp-order-totals-box mp-order-panel-step"
                data-step-label="שלב 4 · שליחה"
              >
                <div className="mp-order-totals-row">
                  <span>סכום מוצרים</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="mp-order-totals-row">
                    <span>דמי משלוח</span>
                    <span>{formatCurrency(deliveryFee)}</span>
                  </div>
                )}
                <div className="mp-order-totals-row is-grand">
                  <span>סה״כ לתשלום בשוק</span>
                  <span>{formatCurrency(orderTotal)}</span>
                </div>
                <p className="mp-section-note mt-2 text-sm">
                  התשלום ישירות לדוכן לפי האמצעי שבחרתם. לאחר התשלום — הדוכן יעדכן כשההזמנה
                  מוכנה.
                </p>
                <label className="flex items-start gap-2 mt-4 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={agreeToMarketplaceTerms}
                    onChange={(event) => setAgreeToMarketplaceTerms(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    קראתי ואני מסכים/ה ל
                    <Link to="/community-marketplace/terms" target="_blank" className="text-green-700 underline mx-1">
                      תקנון שוק הקהילתי
                    </Link>
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={submitDisabled || !agreeToMarketplaceTerms}
                  className="mp-btn mp-btn-wood w-full mt-4"
                >
                  {submitting ? 'שולח הזמנה...' : 'שליחת ההזמנה לשוק'}
                </button>
              </section>
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
};

export default MarketplaceOrderForm;
