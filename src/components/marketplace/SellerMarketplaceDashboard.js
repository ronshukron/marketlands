import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import { pickupSpots } from '../../data/pickupSpots';
import {
  DEFAULT_MANUAL_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  getMarketplaceSettings,
  getSellerMarketplaceData,
  saveMarketplacePromotion,
  saveMarketplaceStore,
  toDate,
} from '../../services/marketplaceService';
import LoadingSpinner from '../LoadingSpinner';
import { DEFAULT_MARKETPLACE_STORE_CONTENT, normalizeStoreContent } from '../../constants/marketplaceStoreContent';
import {
  DEFAULT_PROMOTION_FULFILLMENT,
  DEFAULT_STORE_FULFILLMENT,
  normalizePromotionFulfillment,
  storeFulfillmentToForm,
} from '../../constants/marketplaceFulfillment';
import VolunteerPickupPlaceholder from './VolunteerPickupPlaceholder';
import StoreContentEditor from './StoreContentEditor';
import MarketplaceFulfillmentEditor from './MarketplaceFulfillmentEditor';
import MarketplacePaymentLinksEditor from './MarketplacePaymentLinksEditor';
import {
  DEFAULT_STORE_PAYMENT_LINKS,
  normalizeStorePaymentLinks,
} from '../../constants/marketplacePaymentLinks';
import './marketplace.css';

const emptyStoreForm = {
  title: '',
  shortDescription: '',
  coverImageUrl: '',
  tags: '',
  homeCommunity: '',
  manualPaymentMethods: DEFAULT_MANUAL_PAYMENT_METHODS,
  visible: true,
  status: 'active',
  ...DEFAULT_MARKETPLACE_STORE_CONTENT,
  ...DEFAULT_STORE_FULFILLMENT,
  paymentLinks: DEFAULT_STORE_PAYMENT_LINKS,
};

const getDefaultEndDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
};

const emptyPromotionForm = {
  title: '',
  description: '',
  productIds: [],
  status: 'active',
  startsAt: new Date().toISOString().slice(0, 10),
  endsAt: getDefaultEndDate(),
  deliveryDate: '',
  pickupInstructions: '',
  manualPaymentMethods: DEFAULT_MANUAL_PAYMENT_METHODS,
  sortRank: 0,
  ...DEFAULT_PROMOTION_FULFILLMENT,
};

const formatDate = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleDateString('he-IL') : 'ללא תאריך';
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Number(value || 0));

const SectionButton = ({ active, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`mp-toggle-btn ${active ? 'is-active' : ''}`}
  >
    {children}
  </button>
);

const SellerMarketplaceDashboard = () => {
  const { currentUser, userRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');
  const [business, setBusiness] = useState(null);
  const [approvedProducts, setApprovedProducts] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [storeForm, setStoreForm] = useState(emptyStoreForm);
  const [promotionForm, setPromotionForm] = useState(emptyPromotionForm);
  const [loading, setLoading] = useState(true);
  const [savingStore, setSavingStore] = useState(false);
  const [savingPromotion, setSavingPromotion] = useState(false);
  const [globalSettings, setGlobalSettings] = useState(null);

  useEffect(() => {
    if (location.pathname.includes('/promotions/new')) {
      setActiveSection('promotion');
    } else if (location.pathname.includes('/store')) {
      setActiveSection('store');
    } else {
      setActiveSection('overview');
    }
  }, [location.pathname]);

  useEffect(() => {
    const preselected = location.state?.preselectedProductIds;
    if (!Array.isArray(preselected) || preselected.length === 0) return;

    setActiveSection('promotion');
    setPromotionForm((current) => ({
      ...current,
      productIds: [...new Set([...current.productIds, ...preselected])],
    }));
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  const loadData = async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [data, settings] = await Promise.all([
        getSellerMarketplaceData(currentUser.uid),
        getMarketplaceSettings(),
      ]);
      setGlobalSettings(settings);
      setBusiness(data.business);
      setApprovedProducts(data.approvedProducts);
      setPromotions(data.promotions);
      setOrders(data.orders);
      setStoreForm({
        ...emptyStoreForm,
        ...normalizeStoreContent(data.store),
        ...storeFulfillmentToForm(data.store),
        paymentLinks: normalizeStorePaymentLinks(data.store),
        title: data.store?.title || data.business?.businessName || '',
        shortDescription: data.store?.shortDescription || '',
        coverImageUrl: data.store?.coverImageUrl || '',
        tags: (data.store?.tags || []).join(', '),
        homeCommunity: data.store?.homeCommunity || data.business?.communityName || '',
        manualPaymentMethods: data.store?.manualPaymentMethods || DEFAULT_MANUAL_PAYMENT_METHODS,
        visible: data.store?.visible !== false,
        status: data.store?.status || 'active',
      });
      setPromotionForm((current) => ({
        ...current,
        manualPaymentMethods: data.store?.manualPaymentMethods || DEFAULT_MANUAL_PAYMENT_METHODS,
      }));
    } catch (error) {
      console.error('Failed to load seller marketplace dashboard', error);
      Swal.fire({ icon: 'error', title: 'שגיאה בטעינת המרקטפלייס' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const selectedProductSet = useMemo(
    () => new Set(promotionForm.productIds),
    [promotionForm.productIds]
  );

  const handleSectionChange = (section) => {
    setActiveSection(section);
    if (section === 'store') navigate('/marketplace/store');
    if (section === 'promotion') navigate('/marketplace/promotions/new');
    if (section === 'overview') navigate('/marketplace/dashboard');
  };

  const togglePaymentMethod = (method, formName) => {
    if (formName === 'store') {
      setStoreForm((current) => {
        const set = new Set(current.manualPaymentMethods);
        set.has(method) ? set.delete(method) : set.add(method);
        return { ...current, manualPaymentMethods: [...set] };
      });
      return;
    }

    setPromotionForm((current) => {
      const set = new Set(current.manualPaymentMethods);
      set.has(method) ? set.delete(method) : set.add(method);
      return { ...current, manualPaymentMethods: [...set] };
    });
  };

  const togglePromotionProduct = (productId) => {
    setPromotionForm((current) => {
      const next = new Set(current.productIds);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      return { ...current, productIds: [...next] };
    });
  };

  const handleSaveStore = async (event) => {
    event.preventDefault();
    if (!currentUser) return;

    setSavingStore(true);
    try {
      await saveMarketplaceStore({
        businessId: currentUser.uid,
        businessData: business || {},
        storeData: storeForm,
      });
      await loadData();
      Swal.fire({ icon: 'success', title: 'פרופיל המרקטפלייס נשמר', timer: 1600, showConfirmButton: false });
    } catch (error) {
      console.error('Failed to save marketplace store', error);
      Swal.fire({ icon: 'error', title: 'שגיאה בשמירת הפרופיל' });
    } finally {
      setSavingStore(false);
    }
  };

  const handleSavePromotion = async (event) => {
    event.preventDefault();
    if (!currentUser) return;

    if (promotionForm.productIds.length === 0) {
      Swal.fire({ icon: 'warning', title: 'בחרו לפחות מוצר מאושר אחד' });
      return;
    }

    setSavingPromotion(true);
    try {
      await saveMarketplacePromotion({
        businessId: currentUser.uid,
        businessData: business || {},
        promotionData: promotionForm,
      });
      setPromotionForm({
        ...emptyPromotionForm,
        manualPaymentMethods: promotionForm.manualPaymentMethods,
        deliveryInheritFromStore: true,
      });
      await loadData();
      Swal.fire({ icon: 'success', title: 'הקידום השבועי נוצר', timer: 1600, showConfirmButton: false });
    } catch (error) {
      console.error('Failed to save marketplace promotion', error);
      Swal.fire({ icon: 'error', title: 'שגיאה ביצירת הקידום', text: error.message });
    } finally {
      setSavingPromotion(false);
    }
  };

  if (!currentUser) {
    return (
      <div dir="rtl" className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="mp-section-title mb-3">ניהול בסטה בשוק</h1>
        <p className="mp-section-note mb-6">יש להתחבר כחשבון עסק כדי לפתוח ולנהל בסטה.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/local-business-register" className="mp-btn mp-btn-wood">
            הרשמה לשוק הבסטות
          </Link>
          <Link to="/login" className="mp-btn mp-btn-primary">
            התחברות
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mp-page flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if ((userRole !== 'business' && userRole !== 'localBusiness') || !business) {
    return (
      <div dir="rtl" className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="mp-section-title mb-3">שוק הבסטות לחשבונות עסק בלבד</h1>
        <p className="mp-section-note">לא נמצא פרופיל עסק פעיל לחשבון הזה.</p>
      </div>
    );
  }

  return (
    <div className="mp-page py-8" dir="rtl">
      <div className="mp-main mp-stack">
        <div className="mp-panel">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="mp-section-kicker">הבסטה שלי בשוק</p>
              <h1 className="mp-hero-title" style={{ fontSize: '1.75rem' }}>
                {business.businessName || 'הבסטה שלי'}
              </h1>
              <p className="mp-section-note mt-1">
                ניהול כרטיס בסטה, הזמנות שבועיות והזמנות ידניות מהלקוחות.
              </p>
            </div>
            <Link to="/community-marketplace" className="mp-link">
              צפייה בשוק הבסטות
            </Link>
          </div>
          <div className="mp-dashboard-tabs">
            <SectionButton active={activeSection === 'overview'} onClick={() => handleSectionChange('overview')}>
              סקירה
            </SectionButton>
            <SectionButton active={activeSection === 'store'} onClick={() => handleSectionChange('store')}>
              כרטיס הבסטה
            </SectionButton>
            <SectionButton active={activeSection === 'promotion'} onClick={() => handleSectionChange('promotion')}>
              קידום שבועי חדש
            </SectionButton>
          </div>
        </div>

        {activeSection === 'overview' && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="mp-stat-card">
              <p className="mp-section-note">מוצרים מאושרים</p>
              <div className="mp-stat-value">{approvedProducts.length}</div>
              <Link to="/marketplace/products" className="mp-link text-sm mt-2 inline-block">
                ניהול מוצרים
              </Link>
            </div>
            <div className="mp-stat-card">
              <p className="mp-section-note">הזמנות שבועיות</p>
              <div className="mp-stat-value">{promotions.length}</div>
            </div>
            <div className="mp-stat-card">
              <p className="mp-section-note">הזמנות מהשוק</p>
              <div className="mp-stat-value">{orders.length}</div>
            </div>

            <div className="lg:col-span-2 mp-panel">
              <h2 className="mp-section-title mb-4">הזמנות שבועיות אחרונות</h2>
              {promotions.length === 0 ? (
                <p className="text-sm text-gray-600">עדיין לא נוצרו קידומים.</p>
              ) : (
                <div className="space-y-3">
                  {promotions.slice(0, 5).map((promotion) => (
                    <div key={promotion.id} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">{promotion.title}</h3>
                          <p className="text-xs text-gray-500">עד {formatDate(promotion.endsAt)}</p>
                        </div>
                        <Link to={`/community-marketplace/order/${promotion.id}`} className="text-sm text-blue-700">
                          צפייה
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mp-panel">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="mp-section-title">הזמנות אחרונות</h2>
                <Link to="/marketplace/orders" className="mp-btn mp-btn-wood text-sm">
                  כל ההזמנות מהשוק
                </Link>
              </div>
              {orders.length === 0 ? (
                <p className="mp-section-note">עדיין אין הזמנות מהשוק.</p>
              ) : (
                <div className="space-y-3">
                  {orders.slice(0, 5).map((order) => (
                    <div key={order.id} className="border border-gray-100 rounded-xl p-3">
                      <h3 className="font-semibold text-gray-900">{order.customerName || 'לקוח'}</h3>
                      <p className="text-xs text-gray-500">{formatCurrency(order.subtotal)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'store' && (
          <form onSubmit={handleSaveStore} className="mp-panel space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="mp-section-title">כרטיס הבסטה בשוק</h2>
              <Link to="/marketplace/my-store" className="mp-btn mp-btn-wood text-sm">
                עריכת דף + תמונות
              </Link>
            </div>
            <p className="mp-section-note text-sm">
              להעלאת תמונות קאבר ופרופיל השתמשו ב{' '}
              <Link to="/marketplace/my-store" className="font-semibold underline text-green-800">
                דף הבסטה שלי
              </Link>
              . הלקוחות רואים את הדף בלחיצה על הכרטיס בשוק.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={storeForm.title}
                onChange={(event) => setStoreForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="כותרת כרטיס"
                className="mp-input"
              />
              <input
                value={storeForm.coverImageUrl}
                onChange={(event) => setStoreForm((current) => ({ ...current, coverImageUrl: event.target.value }))}
                placeholder="קישור לתמונת קאבר (או העלאה בדף הבסטה)"
                className="mp-input"
              />
              <select
                value={storeForm.homeCommunity}
                onChange={(event) => setStoreForm((current) => ({ ...current, homeCommunity: event.target.value }))}
                className="mp-select"
              >
                <option value="">קהילת בית</option>
                {pickupSpots.map((spot) => <option key={spot} value={spot}>{spot}</option>)}
              </select>
              <input
                value={storeForm.tags}
                onChange={(event) => setStoreForm((current) => ({ ...current, tags: event.target.value }))}
                placeholder="תגיות מופרדות בפסיקים"
                className="mp-input"
              />
            </div>
            <textarea
              value={storeForm.shortDescription}
              onChange={(event) => setStoreForm((current) => ({ ...current, shortDescription: event.target.value }))}
              placeholder="תיאור קצר על הבסטה"
              rows={3}
              className="mp-textarea"
            />
            <StoreContentEditor form={storeForm} setForm={setStoreForm} />
            <MarketplaceFulfillmentEditor
              mode="store"
              value={storeForm}
              onChange={(patch) => setStoreForm((current) => ({ ...current, ...patch }))}
            />
            <MarketplacePaymentLinksEditor
              paymentLinks={storeForm.paymentLinks}
              onChange={(paymentLinks) => setStoreForm((current) => ({ ...current, paymentLinks }))}
              disabled={globalSettings?.paymentLinksOnConfirmationEnabled === false}
              disabledNote="קישורי תשלום מושבתים על ידי המנהל."
            />
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">אמצעי תשלום ידניים</p>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_MANUAL_PAYMENT_METHODS.map((method) => (
                  <label key={method} className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={storeForm.manualPaymentMethods.includes(method)}
                      onChange={() => togglePaymentMethod(method, 'store')}
                    />
                    {PAYMENT_METHOD_LABELS[method]}
                  </label>
                ))}
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={storeForm.visible}
                onChange={(event) => setStoreForm((current) => ({ ...current, visible: event.target.checked }))}
              />
              הצגת הבסטה בשוק
            </label>
            <button
              type="submit"
              disabled={savingStore}
              className="mp-btn mp-btn-wood"
              style={{ opacity: savingStore ? 0.6 : 1 }}
            >
              {savingStore ? 'שומר...' : 'שמירת כרטיס הבסטה'}
            </button>
          </form>
        )}

        {activeSection === 'promotion' && (
          <form onSubmit={handleSavePromotion} className="mp-panel space-y-5">
            <h2 className="mp-section-title">הזמנה שבועית מצטברת</h2>
            <p className="mp-section-note text-sm">
              הלקוחות מזמינים לאורך השבוע; בסוף התקופה תבצעו משלוח מרוכז (או איסוף עצמי לפי ההגדרות).
            </p>
            <input
              value={promotionForm.title}
              onChange={(event) => setPromotionForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="שם ההזמנה השבועית"
              className="mp-input"
              required
            />
            <textarea
              value={promotionForm.description}
              onChange={(event) => setPromotionForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="תיאור ההזמנה השבועית"
              rows={3}
              className="mp-textarea"
            />
            <MarketplaceFulfillmentEditor
              mode="promotion"
              value={promotionForm}
              storeFulfillment={storeFulfillmentToForm(storeForm)}
              onChange={(patch) => setPromotionForm((current) => ({ ...current, ...patch }))}
            />
            <VolunteerPickupPlaceholder />
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">בחירת מוצרים להזמנה השבועית</p>
              <p className="mp-promotion-products-intro">
                סמנו את המוצרים המאושרים שיופיעו בדף ההזמנה. ניתן גם להוסיף מוצר מראש מ{' '}
                <Link to="/marketplace/products">רשימת המוצרים</Link> בלחיצה על &quot;הוסף לקידום שבועי&quot;.
              </p>
              {approvedProducts.length === 0 ? (
                <div className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  אין מוצרים מאושרים לבחירה. הוסיפו מוצרים ב{' '}
                  <Link to="/marketplace/products" className="text-green-800 font-semibold underline">
                    המוצרים שלי
                  </Link>
                  {' '}והמתינו לאישור מנהל.
                </div>
              ) : (
                <>
                  <p className="mp-promotion-selected-count">
                    נבחרו {promotionForm.productIds.length} מתוך {approvedProducts.length} מוצרים
                  </p>
                  <div className="mp-promotion-product-grid">
                    {approvedProducts.map((product) => {
                      const isSelected = selectedProductSet.has(product.id);
                      return (
                        <label
                          key={product.id}
                          className={`mp-promotion-product-option ${isSelected ? 'is-selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePromotionProduct(product.id)}
                          />
                          <span className="mp-promotion-product-option-text">
                            <span className="block font-medium text-gray-900">{product.name}</span>
                            <span className="block text-sm text-gray-600">{formatCurrency(product.price)}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">אמצעי תשלום ידניים</p>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_MANUAL_PAYMENT_METHODS.map((method) => (
                  <label key={method} className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={promotionForm.manualPaymentMethods.includes(method)}
                      onChange={() => togglePaymentMethod(method, 'promotion')}
                    />
                    {PAYMENT_METHOD_LABELS[method]}
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={savingPromotion || approvedProducts.length === 0}
              className="mp-btn mp-btn-wood"
              style={{ opacity: savingPromotion || approvedProducts.length === 0 ? 0.6 : 1 }}
            >
              {savingPromotion ? 'יוצר הזמנה...' : 'פרסום הזמנה שבועית'}
            </button>
            <p className="text-xs text-gray-500">
              בחירה בפועל נשמרת רק עם מוצרים מאושרים. מוצרים ממתינים או דחויים לא ייכנסו לקידום.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default SellerMarketplaceDashboard;

