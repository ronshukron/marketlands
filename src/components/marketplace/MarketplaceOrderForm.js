import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import { usePickupSpot } from '../../contexts/PickupSpotContext';
import { resolveMarketplaceOrderAccount } from '../../services/marketplaceUserService';
import MarketplaceCheckoutAccount from './MarketplaceCheckoutAccount';
import {
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
import { notifyMarketplaceOrderForBusinessId } from '../../services/marketplaceOrderNotifications';
import { summarizeEmailNotifications } from '../../utils/marketplaceEmailSummary';
import LoadingSpinner from '../LoadingSpinner';
import MarketplaceSubmittingOverlay from './MarketplaceSubmittingOverlay';
import VolunteerPickupPlaceholder from './VolunteerPickupPlaceholder';
import MarketplaceFulfillmentSummary from './MarketplaceFulfillmentSummary';
import MarketplaceFulfillmentPicker from './MarketplaceFulfillmentPicker';
import { saveOrderConfirmationSession } from '../../utils/marketplaceOrderConfirmation';
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
  const [paymentMethod, setPaymentMethod] = useState('bit');

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
    if (!currentUser) return;
    setCustomer((current) => ({
      ...current,
      email: current.email || currentUser.email || '',
      userId: current.userId || currentUser.uid || '',
    }));
  }, [currentUser]);

  useEffect(() => {
    if (selectedPickupSpot && !customer.community) {
      setCustomer((current) => ({ ...current, community: selectedPickupSpot }));
    }
  }, [customer.community, selectedPickupSpot]);

  useEffect(() => {
    setFulfillmentMethod('');
    setFulfillmentLabel('');
  }, [customer.community]);

  const fulfillment = useMemo(
    () => (promotion ? resolvePromotionFulfillment(promotion, store) : null),
    [promotion, store]
  );

  const products = useMemo(() => promotion?.products || [], [promotion]);
  const paymentMethods = promotion?.manualPaymentMethods?.length
    ? promotion.manualPaymentMethods
    : DEFAULT_MANUAL_PAYMENT_METHODS;

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

  const handleQuantityChange = (productId, value) => {
    const product = products.find((entry) => entry.id === productId);
    const quantity = product
      ? clampCartQuantityToStock(product, value)
      : Math.max(0, Number(value || 0));
    setQuantities((current) => ({ ...current, [productId]: quantity }));
  };

  const handleFulfillmentChange = (method, label) => {
    setFulfillmentMethod(method);
    setFulfillmentLabel(label);
  };

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

    const fulfillmentError = validateFulfillmentChoice(
      fulfillment,
      customer.community,
      fulfillmentMethod
    );
    if (fulfillmentError) {
      Swal.fire({ icon: 'warning', title: 'אופן אספקה', text: fulfillmentError });
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

      const order = await placeMarketplaceManualOrder({
        promotion,
        customer: {
          ...customer,
          email: orderAccount.email,
          userId: orderAccount.userId,
          fulfillmentMethod,
          fulfillmentLabel,
          deliveryFee,
        },
        lines: orderLines,
        selectedDeliveryOption: fulfillmentLabel,
        paymentMethod,
      });

      const notifications = await notifyMarketplaceOrderForBusinessId({
        businessId: promotion.businessId,
        order,
        customer: { ...customer, email: orderAccount.email, fulfillmentLabel },
        paymentMethod,
        fulfillmentLabel,
        storeTitle: promotion.businessName,
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

  return (
    <div className="mp-page py-8" dir="rtl">
      {submitting && <MarketplaceSubmittingOverlay message="שולח את ההזמנה..." />}
      <form onSubmit={handleSubmit} className="mp-main mp-order-layout">
        <div className="mp-stack">
          <div className="mp-order-panel">
            <Link to="/community-marketplace" className="mp-link">
              חזרה לשוק הבסטות
            </Link>
            <span className="mp-promo-label" style={{ display: 'inline-block', marginTop: '0.75rem' }}>
              הזמנה מצטברת
            </span>
            <h1 className="mp-section-title" style={{ marginTop: '0.5rem' }}>
              {promotion.title}
            </h1>
            <p className="mp-promo-business">{promotion.businessName}</p>
            {promotion.description && (
              <p className="mp-section-note" style={{ marginTop: '1rem' }}>
                {promotion.description}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              {formatDate(promotion.startsAt) && (
                <span className="mp-tag">נפתח {formatDate(promotion.startsAt)}</span>
              )}
              {formatDate(promotion.endsAt) && (
                <span className="mp-tag">סגירה {formatDate(promotion.endsAt)}</span>
              )}
              {promotion.deliveryDate && (
                <span className="mp-badge">משלוח מרוכז {promotion.deliveryDate}</span>
              )}
            </div>
          </div>

          <MarketplaceFulfillmentSummary store={store} promotion={promotion} />

          <div className="mp-order-panel">
            <h2 className="mp-section-title mb-4">בחירת מוצרים מהבסטה</h2>
            {products.length === 0 ? (
              <div className="mp-alert mp-alert-warn">
                אין מוצרים מאושרים זמינים בהזמנה הזו כרגע.
              </div>
            ) : (
              <div>
                {products.map((product) => (
                  <div key={product.id} className="mp-product-row">
                    {Array.isArray(product.images) && product.images[0] && (
                      <img src={product.images[0]} alt={product.name} />
                    )}
                    <div className="flex-1">
                      <h3 className="font-bold" style={{ color: '#3d2f1f' }}>
                        {product.name}
                      </h3>
                      {product.description && (
                        <p className="text-sm line-clamp-2 mt-1" style={{ color: '#6b5a45' }}>
                          {product.description}
                        </p>
                      )}
                      <div className="text-sm font-bold mt-2" style={{ color: '#4a7c3f' }}>
                        {formatCurrency(product.price)}
                      </div>
                      {getProductStockLimit(product) !== null && (
                        <p className="text-xs mt-1" style={{ color: isMarketplaceProductInStock(product) ? '#6b5a45' : '#b91c1c' }}>
                          {isMarketplaceProductInStock(product)
                            ? `מלאי: ${getProductStockLimit(product)}`
                            : 'אזל המלאי'}
                        </p>
                      )}
                    </div>
                    <div style={{ width: '5rem' }}>
                      <label className="mp-filter-label">כמות</label>
                      <input
                        type="number"
                        min="0"
                        max={getProductStockLimit(product) ?? undefined}
                        step="1"
                        value={quantities[product.id] || ''}
                        onChange={(event) => handleQuantityChange(product.id, event.target.value)}
                        className="mp-input text-center"
                        disabled={!isMarketplaceProductInStock(product)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside>
          <div className="mp-order-panel">
            <h2 className="mp-section-title mb-4">פרטי הזמנה</h2>
            <div className="space-y-3">
              <input
                type="text"
                value={customer.name}
                onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))}
                placeholder="שם מלא *"
                className="mp-input"
              />
              <input
                type="tel"
                value={customer.phone}
                onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))}
                placeholder="טלפון *"
                className="mp-input"
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

              <MarketplaceFulfillmentPicker
                fulfillment={fulfillment}
                community={customer.community}
                value={fulfillmentMethod}
                onChange={handleFulfillmentChange}
                onCommunityChange={(community) =>
                  setCustomer((current) => ({ ...current, community }))
                }
              />

              <VolunteerPickupPlaceholder />
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                className="mp-select"
              >
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_LABELS[method] || method}
                  </option>
                ))}
              </select>
              <textarea
                value={customer.notes}
                onChange={(event) => setCustomer((current) => ({ ...current, notes: event.target.value }))}
                placeholder="הערות לבסטה"
                rows={3}
                className="mp-textarea"
              />
            </div>

            <div style={{ borderTop: '2px solid #e8dcc8', marginTop: '1.25rem', paddingTop: '1rem' }}>
              <div className="flex justify-between text-sm" style={{ color: '#6b5a45' }}>
                <span>סכום מוצרים</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="flex justify-between text-sm mt-1" style={{ color: '#6b5a45' }}>
                  <span>דמי משלוח</span>
                  <span>{formatCurrency(deliveryFee)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold mt-2" style={{ color: '#3d2f1f' }}>
                <span>סה"כ לתשלום ידני</span>
                <span>{formatCurrency(orderTotal)}</span>
              </div>
              <p className="mp-section-note mt-2">
                התשלום ישירות לבסטה לפי האמצעי שבחרתם. לאחר התשלום — הבסטה תעדכן אתכם כשההזמנה מוכנה.
              </p>
            </div>

            <button
              type="submit"
              disabled={
                submitting ||
                products.length === 0 ||
                (!userLoggedIn && !wantsCreateAccount)
              }
              className="mp-btn mp-btn-wood w-full mt-5"
              style={{
                opacity:
                  submitting ||
                  products.length === 0 ||
                  (!userLoggedIn && !wantsCreateAccount)
                    ? 0.6
                    : 1,
              }}
            >
              {submitting ? 'שולח הזמנה...' : 'שליחת הזמנה'}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
};

export default MarketplaceOrderForm;
