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
        <p className="text-gray-600">טוען פרטי אישור...</p>
      </div>
    );
  }

  return (
    <div className="mp-page py-10" dir="rtl">
      <div className="mp-main mp-stack" style={{ maxWidth: '40rem' }}>
        <div className="mp-panel mp-confirmation-hero">
          <span className="mp-confirmation-icon" aria-hidden="true">
            ✓
          </span>
          <h1 className="mp-section-title">ההזמנה התקבלה</h1>
          <p className="mp-section-note mt-2">
            {settings?.confirmationIntroText ||
              'ההזמנה הועברה לבסטה. מכאן הכל ביניכם לבין הבסטה — תשלום, תיאום ואיסוף או משלוח.'}
          </p>
        </div>

        <div className="mp-panel mp-stack">
          <h2 className="mp-section-title text-base">מה קורה עכשיו?</h2>
          <ol className="mp-confirmation-steps">
            <li>
              <strong>תשלום:</strong> שלמו לבסטה באמצעי שבחרתם (
              {PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod || 'לפי תיאום'}) — ישירות אליה, בהקדם
              אחרי סיום ההזמנה.
            </li>
            <li>
              <strong>תיאום:</strong> פרטי תשלום, שאלות והערות — ישירות מול הבסטה (טלפון, וואטסאפ או אימייל
              שתקבלו ממנה).
            </li>
            <li>
              <strong>איסוף / משלוח:</strong> כשההזמנה מוכנה, הבסטה תעדכן אתכם. רק אז תגיעו לאסוף או תמתינו
              למשלוח לפי מה שסיכמתם.
            </li>
            {showPaymentLinks && (
              <li>
                אם הבסטה פרסמה קישור או הוראות תשלום — הן מופיעות למטה לנוחותכם.
              </li>
            )}
          </ol>
          {settings?.confirmationNextStepsText && (
            <p className="mp-section-note text-sm whitespace-pre-wrap mt-3">
              {settings.confirmationNextStepsText}
            </p>
          )}
        </div>

        {emailSummary && (
          <div className="mp-panel mp-checkout-account-box">
            <h2 className="mp-section-title text-base mb-2">אימיילים</h2>
            <ul className="text-sm text-gray-800 space-y-1 list-disc list-inside">
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
                  נשלחה התראה לבסטה/ות ({emailSummary.sellerSent}{' '}
                  {emailSummary.sellerSent === 1 ? 'מייל' : 'מיילים'})
                </li>
              )}
              {emailSummary.sellerSkipped > 0 && (
                <li>
                  {emailSummary.sellerSkipped === 1
                    ? 'בסטה אחת לא קיבלה מייל — חסר אימייל בפרופיל.'
                    : `${emailSummary.sellerSkipped} בסטות לא קיבלו מייל — חסר אימייל בפרופיל.`}
                </li>
              )}
              {emailSummary.sellerFailed > 0 && (
                <li>חלק מהבסטות לא קיבלו מייל — שגיאת שליחה. נסו ליצור קשר עם הבסטה ישירות.</li>
              )}
            </ul>
          </div>
        )}

        {orders.map((order) => {
          const store = storesByBusiness[order.businessId];
          const links = showPaymentLinks
            ? getActivePaymentLinksForStore(store, paymentMethod)
            : [];

          return (
            <div key={order.id} className="mp-panel mp-stack">
              <h2 className="mp-section-title text-base">
                {order.businessName || store?.title || 'בסטה'}
              </h2>
              <p className="text-sm text-gray-600">
                מס׳ הזמנה: <span className="font-mono">{order.id}</span>
              </p>
              {order.fulfillmentLabel && (
                <p className="text-sm text-gray-600">אספקה: {order.fulfillmentLabel}</p>
              )}
              <div className="text-sm mt-2">
                <div className="flex justify-between">
                  <span>מוצרים</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                {Number(order.deliveryFee) > 0 && (
                  <div className="flex justify-between">
                    <span>משלוח</span>
                    <span>{formatCurrency(order.deliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold mt-1">
                  <span>סה״כ</span>
                  <span>{formatCurrency(order.total ?? order.subtotal)}</span>
                </div>
              </div>

              {showPaymentLinks && links.length > 0 && (
                <div className="mp-confirmation-pay-block">
                  <p className="mp-form-label mb-2">פרטי תשלום ששיתפה הבסטה</p>
                  {links.map((link) => (
                    <div key={link.method} className="mp-confirmation-pay-item">
                      {link.url ? (
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mp-btn mp-btn-wood w-full justify-center"
                        >
                          שלמו ב־{link.label}
                        </a>
                      ) : (
                        <div className="mp-confirmation-bank-box">
                          <strong>{link.label}</strong>
                          <p className="whitespace-pre-wrap text-sm mt-1">{link.instructions}</p>
                        </div>
                      )}
                      {link.url && link.instructions && (
                        <p className="text-xs text-gray-600 mt-1">{link.instructions}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showPaymentLinks && links.length === 0 && paymentMethod && (
                <p className="mp-section-note text-sm">
                  לתשלום ב־{PAYMENT_LINK_LABELS[paymentMethod] || paymentMethod}: צרו קשר עם הבסטה לקבלת
                  פרטים וסגירת התשלום.
                </p>
              )}
            </div>
          );
        })}

        {orders.length > 1 && (
          <div className="mp-panel">
            <div className="flex justify-between text-lg font-bold">
              <span>סה״כ כל ההזמנות</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        )}

        {!showPaymentLinks && (
          <div className="mp-panel mp-checkout-account-box">
            <p className="text-sm text-gray-800">
              שלמו לבסטה לפי האמצעי שבחרתם ותיאמתם איתה ישירות. כשההזמנה תהיה מוכנה — תקבלו ממנה עדכון
              לאיסוף או למשלוח.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
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
