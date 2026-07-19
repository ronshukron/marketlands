import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  getActivePaymentLinksForStore,
  PAYMENT_LINK_LABELS,
} from '../../constants/marketplacePaymentLinks';
import { PAYMENT_METHOD_LABELS, getMarketplaceSettings, getMarketplaceStore } from '../../services/marketplaceService';
import {
  clearOrderConfirmationSession,
  loadOrderConfirmationSession,
} from '../../utils/marketplaceOrderConfirmation';
import { PAYMENT_CHIP_ICONS } from '../../utils/marketplacePaymentChips';
import './marketplace.css';

const formatCurrency = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Number(value || 0));

const MarketplaceOrderConfirmation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [storesByBusiness, setStoresByBusiness] = useState({});
  const [loading, setLoading] = useState(true);

  const session = useMemo(
    () => location.state || loadOrderConfirmationSession(),
    [location.state]
  );

  const orders = session?.orders || [];
  const paymentMethod = session?.paymentMethod || '';
  const customer = session?.customer || {};
  const emailSummary = session?.emailSummary;

  useEffect(() => {
    if (!session?.orders?.length) {
      navigate('/community-marketplace', { replace: true });
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const globalSettings = await getMarketplaceSettings();
        setSettings(globalSettings);

        const businessIds = [...new Set(orders.map((o) => o.businessId).filter(Boolean))];
        const storeEntries = await Promise.all(
          businessIds.map(async (id) => {
            const store = await getMarketplaceStore(id);
            return [id, store];
          })
        );
        setStoresByBusiness(Object.fromEntries(storeEntries));
      } catch (error) {
        console.error('Failed to load confirmation page data', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [session, orders, navigate]);

  const showPaymentLinks = settings?.paymentLinksOnConfirmationEnabled !== false;
  const grandTotal = orders.reduce(
    (sum, order) => sum + Number(order.total ?? order.subtotal ?? 0),
    0
  );

  if (!session?.orders?.length) {
    return null;
  }

  if (loading) {
    return (
      <div className="mp-page flex items-center justify-center py-20">
        <p className="mp-section-note">טוען קבלת שוק...</p>
      </div>
    );
  }

  return (
    <div className="mp-page mp-receipt-page" dir="rtl">
      <div className="mp-main mp-stack">
        <header className="mp-panel mp-receipt-hero mp-confirmation-hero">
          <span className="mp-receipt-stamp" aria-hidden="true">
            ✓
          </span>
          <p className="mp-receipt-kicker">קבלת שוק · מהשכונה לשכונה</p>
          <h1 className="mp-section-title">ההזמנה ברשות השוק</h1>
          <p className="mp-section-note mt-2">
            {settings?.confirmationIntroText ||
              'ההזמנה הועברה לדוכן. מכאן הכל ביניכם — תשלום בשוק, תיאום ואיסוף או משלוח.'}
          </p>
          {paymentMethod && (
            <p className="mp-section-note text-sm mt-3">
              אמצעי תשלום שבחרתם:{' '}
              <span className="mp-payment-chip mp-payment-chip-inline">
                <span className="mp-payment-chip-icon" aria-hidden="true">
                  {PAYMENT_CHIP_ICONS[paymentMethod] || '•'}
                </span>
                {PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod}
              </span>
            </p>
          )}
        </header>

        <section className="mp-panel mp-receipt-panel">
          <h2 className="mp-section-title mp-section-title-chalk text-base">מה קורה עכשיו?</h2>
          <ol className="mp-receipt-steps">
            <li>
              <strong>תשלום בשוק:</strong> שלמו לדוכן באמצעי שבחרתם — ישירות אליו, בהקדם אחרי
              סיום ההזמנה.
            </li>
            <li>
              <strong>תיאום:</strong> פרטי תשלום, שאלות והערות — ישירות מול הדוכן (טלפון, וואטסאפ
              או אימייל).
            </li>
            <li>
              <strong>איסוף / משלוח:</strong> כשההזמנה מוכנה, הדוכן יעדכן אתכם. רק אז תגיעו לאסוף
              או תמתינו למשלוח.
            </li>
            {showPaymentLinks && (
              <li>אם הדוכן פרסם קישור תשלום — הוא מופיע בקבלת הדוכן למטה.</li>
            )}
          </ol>
          {settings?.confirmationNextStepsText && (
            <p className="mp-section-note text-sm whitespace-pre-wrap mt-3">
              {settings.confirmationNextStepsText}
            </p>
          )}
        </section>

        {emailSummary && (
          <section className="mp-panel mp-receipt-email-panel">
            <h2 className="mp-section-title text-base mb-2">אימיילים</h2>
            <ul className="mp-receipt-email-list">
              {emailSummary.customerSent && customer.email && (
                <li>
                  נשלח אימייל אישור ל־<strong>{customer.email}</strong>
                </li>
              )}
              {emailSummary.customerSkipped && (
                <li>אימייל אישור ללקוח לא נשלח (חסר אימייל או כבר נשלח בעבר).</li>
              )}
              {emailSummary.customerFailed && customer.email && (
                <li>לא הצלחנו לשלוח אימייל אישור — בדקו בתיבת ספאם או בהזמנות שלי.</li>
              )}
              {!customer.email && !emailSummary.customerSent && (
                <li>לא נשלח אימייל אישור — לא הוזן אימייל בהזמנה.</li>
              )}
              {emailSummary.sellerSent > 0 && (
                <li>
                  נשלחה התראה לדוכן/ים ({emailSummary.sellerSent}{' '}
                  {emailSummary.sellerSent === 1 ? 'מייל' : 'מיילים'})
                </li>
              )}
              {emailSummary.sellerSkipped > 0 && (
                <li>
                  {emailSummary.sellerSkipped === 1
                    ? 'דוכן אחד לא קיבל מייל — חסר אימייל בפרופיל.'
                    : `${emailSummary.sellerSkipped} דוכנים לא קיבלו מייל — חסר אימייל בפרופיל.`}
                </li>
              )}
              {emailSummary.sellerFailed > 0 && (
                <li>חלק מהדוכנים לא קיבלו מייל — נסו ליצור קשר ישירות.</li>
              )}
            </ul>
          </section>
        )}

        {orders.map((order) => {
          const store = storesByBusiness[order.businessId];
          const links = showPaymentLinks
            ? getActivePaymentLinksForStore(store, paymentMethod)
            : [];

          return (
            <article key={order.id} className="mp-panel mp-receipt-slip mp-stack">
              <div className="mp-receipt-slip-head">
                <h2 className="mp-section-title text-base m-0">
                  {order.businessName || store?.title || 'דוכן'}
                </h2>
                <span className="mp-receipt-order-id">#{order.id}</span>
              </div>
              {order.fulfillmentLabel && (
                <p className="mp-section-note text-sm">אספקה: {order.fulfillmentLabel}</p>
              )}
              <div className="mp-receipt-totals">
                <div className="mp-receipt-totals-row">
                  <span>מוצרים</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                {Number(order.deliveryFee) > 0 && (
                  <div className="mp-receipt-totals-row">
                    <span>משלוח</span>
                    <span>{formatCurrency(order.deliveryFee)}</span>
                  </div>
                )}
                <div className="mp-receipt-totals-row is-total">
                  <span>סה״כ לדוכן</span>
                  <span>{formatCurrency(order.total ?? order.subtotal)}</span>
                </div>
              </div>

              {showPaymentLinks && links.length > 0 && (
                <div className="mp-receipt-payment-block mp-confirmation-pay-block">
                  <p className="mp-form-label mb-2">קבלת תשלום — מהדוכן</p>
                  {links.map((link) => (
                    <div key={link.method} className="mp-receipt-pay-item mp-confirmation-pay-item">
                      {link.url ? (
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mp-btn mp-btn-primary mp-receipt-pay-link w-full justify-center"
                        >
                          שלמו ב־{link.label}
                        </a>
                      ) : (
                        <div className="mp-receipt-bank-box mp-confirmation-bank-box">
                          <strong>{link.label}</strong>
                          <p className="whitespace-pre-wrap text-sm mt-1">{link.instructions}</p>
                        </div>
                      )}
                      {link.url && link.instructions && (
                        <p className="mp-section-note mp-receipt-pay-note text-xs mt-1">
                          {link.instructions}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showPaymentLinks && links.length === 0 && paymentMethod && (
                <p className="mp-section-note text-sm mt-2">
                  לתשלום ב־{PAYMENT_LINK_LABELS[paymentMethod] || paymentMethod}: צרו קשר עם הדוכן
                  לקבלת פרטים.
                </p>
              )}
            </article>
          );
        })}

        {orders.length > 1 && (
          <section className="mp-panel mp-receipt-grand">
            <div className="mp-receipt-grand-row">
              <span>סה״כ כל ההזמנות בשוק</span>
              <span className="mp-receipt-grand-amount">{formatCurrency(grandTotal)}</span>
            </div>
          </section>
        )}

        {!showPaymentLinks && (
          <section className="mp-panel mp-checkout-account-ticket">
            <p className="mp-section-note text-sm">
              שלמו לדוכן לפי האמצעי שבחרתם ותיאמתם איתו ישירות. כשההזמנה תהיה מוכנה — תקבלו עדכון
              לאיסוף או למשלוח.
            </p>
          </section>
        )}

        <div className="mp-receipt-actions">
          <Link
            to="/community-marketplace"
            className="mp-btn mp-btn-wood"
            onClick={() => clearOrderConfirmationSession()}
          >
            חזרה לשוק הבסטות
          </Link>
          <Link to="/community-marketplace/my-orders" className="mp-btn mp-btn-primary">
            ההזמנות שלי בשוק
          </Link>
        </div>
      </div>
    </div>
  );
};

export default MarketplaceOrderConfirmation;
