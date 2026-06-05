import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
import {
  DEFAULT_MARKETPLACE_STORE_CONTENT,
  mergeStoreContentSources,
} from '../../constants/marketplaceStoreContent';
import {
  DEFAULT_PROMOTION_FULFILLMENT,
  DEFAULT_STORE_FULFILLMENT,
  normalizePromotionFulfillment,
  storeFulfillmentToForm,
} from '../../constants/marketplaceFulfillment';
import StoreContentEditor from './StoreContentEditor';
import MarketplaceFulfillmentEditor from './MarketplaceFulfillmentEditor';
import MarketplacePaymentLinksEditor from './MarketplacePaymentLinksEditor';
import MarketplacePromotionEditor from './MarketplacePromotionEditor';
import MarketplacePromotionsManager from './MarketplacePromotionsManager';
import {
  DEFAULT_STORE_PAYMENT_LINKS,
  normalizeStorePaymentLinks,
} from '../../constants/marketplacePaymentLinks';
import './marketplace.css';

const emptyStoreForm = {
  title: '',
  shortDescription: '',
  storeDescription: '',
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

const BenchTab = ({ active, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`mp-bench-tab${active ? ' is-active' : ''}`}
    aria-selected={active}
    role="tab"
  >
    {children}
  </button>
);

const SellerMarketplaceDashboard = () => {
  const { currentUser, userRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
    const sectionParam = searchParams.get('section');
    if (location.pathname.includes('/promotions/new')) {
      setActiveSection('promotion');
    } else if (sectionParam === 'promotions') {
      setActiveSection('promotions');
    } else if (location.pathname.includes('/store')) {
      setActiveSection('store');
    } else {
      setActiveSection('overview');
    }
  }, [location.pathname, searchParams]);

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
      const mergedContent = mergeStoreContentSources(data.store, data.business);
      setStoreForm({
        ...emptyStoreForm,
        ...mergedContent,
        ...storeFulfillmentToForm(data.store),
        paymentLinks: normalizeStorePaymentLinks(data.store),
        title: data.store?.title || data.business?.businessName || '',
        shortDescription: data.store?.shortDescription || '',
        storeDescription: mergedContent.storeDescription,
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

  const handleSectionChange = (section) => {
    setActiveSection(section);
    if (section === 'store') navigate('/marketplace/store');
    if (section === 'promotion') navigate('/marketplace/promotions/new');
    if (section === 'promotions') navigate('/marketplace/dashboard?section=promotions');
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

  const ordersTodayCount = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return orders.filter((order) => {
      const created = toDate(order.createdAt);
      return created && created >= start;
    }).length;
  }, [orders]);

  const activeWeekCount = useMemo(() => {
    const now = new Date();
    return promotions.filter((promotion) => {
      const isActive = promotion.status === 'active' || !promotion.status;
      const ends = toDate(promotion.endsAt);
      return isActive && (!ends || ends >= now);
    }).length;
  }, [promotions]);

  if (!currentUser) {
    return (
      <div dir="rtl" className="mp-page mp-bench-page">
        <div className="mp-main mp-bench mp-empty text-center">
          <span className="mp-weekly-board-label">שדה ושכונה</span>
          <h1 className="mp-section-title mp-section-title-chalk mt-2 mb-3">
            בסטה בשוק
          </h1>
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
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mp-page mp-bench-page flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if ((userRole !== 'business' && userRole !== 'localBusiness') || !business) {
    return (
      <div dir="rtl" className="mp-page mp-bench-page">
        <div className="mp-main mp-bench mp-empty text-center">
          <h1 className="mp-section-title mp-section-title-chalk mb-3">
            שוק הבסטות לחשבונות עסק בלבד
          </h1>
          <p className="mp-section-note">לא נמצא פרופיל עסק פעיל לחשבון הזה.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-page mp-bench-page" dir="rtl">
      <div className="mp-main mp-bench">
        <header className="mp-bench-header">
          <div className="mp-bench-header-main">
            <span className="mp-weekly-board-label">שדה ושכונה · בסטה</span>
            <h1 className="mp-bench-title mp-section-title-chalk">
              {business.businessName || 'הבסטה שלי'}
            </h1>
            <p className="mp-bench-subtitle">
              ניהול הבסטה, הזמנות שבועיות והזמנות מהשכונה.
            </p>
          </div>
          <div className="mp-bench-header-actions">
            <Link to="/community-marketplace" className="mp-link">
              צפייה בשוק
            </Link>
            <Link to="/marketplace/orders" className="mp-btn mp-btn-outline mp-bench-btn-sm">
              הזמנות
            </Link>
            <Link to="/marketplace/products" className="mp-btn mp-btn-wood mp-bench-btn-sm">
              מוצרים
            </Link>
          </div>
        </header>

        <nav className="mp-bench-nav" role="tablist" aria-label="ניווט בסטה">
          <div className="mp-bench-tabs">
            <BenchTab
              active={activeSection === 'overview'}
              onClick={() => handleSectionChange('overview')}
            >
              יום בשוק
            </BenchTab>
            <BenchTab active={activeSection === 'store'} onClick={() => handleSectionChange('store')}>
              הבסטה שלי
            </BenchTab>
            <BenchTab
              active={activeSection === 'promotions'}
              onClick={() => handleSectionChange('promotions')}
            >
              השבוע בשוק
            </BenchTab>
            <BenchTab
              active={activeSection === 'promotion'}
              onClick={() => handleSectionChange('promotion')}
            >
              פתיחת הזמנה שבועית
            </BenchTab>
          </div>
        </nav>

        <div className="mp-bench-body mp-stack">
        {activeSection === 'overview' && (
          <>
            <div className="mp-bench-stats">
              <div className="mp-bench-stat mp-bench-stat--highlight">
                <span className="mp-bench-stat-label">הזמנות היום</span>
                <span className="mp-bench-stat-value">{ordersTodayCount}</span>
                <Link to="/marketplace/orders" className="mp-bench-stat-link">
                  לכל ההזמנות
                </Link>
              </div>
              <div className="mp-bench-stat">
                <span className="mp-bench-stat-label">פעיל השבוע</span>
                <span className="mp-bench-stat-value">{activeWeekCount}</span>
                <span className="mp-bench-stat-note">קידומים פתוחים</span>
              </div>
              <div className="mp-bench-stat">
                <span className="mp-bench-stat-label">מוצרים מאושרים</span>
                <span className="mp-bench-stat-value">{approvedProducts.length}</span>
                <Link to="/marketplace/products" className="mp-bench-stat-link">
                  ניהול מוצרים
                </Link>
              </div>
              <div className="mp-bench-stat">
                <span className="mp-bench-stat-label">סה״כ מהשוק</span>
                <span className="mp-bench-stat-value">{orders.length}</span>
              </div>
            </div>

            <div className="mp-bench-grid">
            <section className="mp-bench-panel mp-bench-panel--wide">
              <h2 className="mp-bench-panel-title mp-section-title-chalk">
                מהשדה השבוע — אחרונים
              </h2>
              {promotions.length === 0 ? (
                <p className="mp-section-note">עדיין לא נוצרו קידומים.</p>
              ) : (
                <ul className="mp-bench-list">
                  {promotions.slice(0, 5).map((promotion) => (
                    <li key={promotion.id} className="mp-bench-list-item">
                      <div className="mp-bench-list-item-main">
                        <h3 className="mp-bench-list-item-title">{promotion.title}</h3>
                        <p className="mp-bench-list-item-meta">עד {formatDate(promotion.endsAt)}</p>
                      </div>
                      <Link
                        to={`/marketplace/promotions/${promotion.id}/orders`}
                        className="mp-btn mp-btn-outline mp-bench-btn-sm"
                      >
                        הזמנות וסיכום
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mp-bench-panel">
              <div className="mp-bench-panel-head">
                <h2 className="mp-bench-panel-title mp-section-title-chalk">הזמנות אחרונות</h2>
                <Link to="/marketplace/orders" className="mp-btn mp-btn-wood mp-bench-btn-sm">
                  כל ההזמנות
                </Link>
              </div>
              {orders.length === 0 ? (
                <p className="mp-section-note">עדיין אין הזמנות מהשוק.</p>
              ) : (
                <ul className="mp-bench-list">
                  {orders.slice(0, 5).map((order) => (
                    <li key={order.id} className="mp-bench-list-item">
                      <div className="mp-bench-list-item-main">
                        <h3 className="mp-bench-list-item-title">
                          {order.customerName || 'לקוח'}
                        </h3>
                        <p className="mp-bench-list-item-meta">{formatCurrency(order.subtotal)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            </div>
          </>
        )}

        {activeSection === 'store' && (
          <form onSubmit={handleSaveStore} className="mp-bench-panel mp-bench-panel--form space-y-5">
            <div className="mp-bench-panel-head">
              <h2 className="mp-bench-panel-title mp-section-title-chalk">הבסטה שלי בשוק</h2>
              <Link to="/marketplace/my-store" className="mp-btn mp-btn-wood mp-bench-btn-sm">
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
            <button type="submit" disabled={savingStore} className="mp-btn mp-btn-wood">
              {savingStore ? 'שומר...' : 'שמירת הבסטה'}
            </button>
          </form>
        )}

        {activeSection === 'promotions' && (
          <MarketplacePromotionsManager
            promotions={promotions}
            approvedProducts={approvedProducts}
            storeForm={storeForm}
            business={business}
            businessId={currentUser.uid}
            onReload={loadData}
            initialEditId={searchParams.get('edit')}
          />
        )}

        {activeSection === 'promotion' && (
          <div className="mp-bench-panel">
            <h2 className="mp-bench-panel-title mp-section-title-chalk mb-2">
              פתיחת הזמנה שבועית
            </h2>
            <p className="mp-section-note text-sm mb-4">
              הלקוחות מזמינים לאורך השבוע; בסוף התקופה תבצעו משלוח מרוכז (או איסוף עצמי לפי ההגדרות).
            </p>
            <MarketplacePromotionEditor
              form={promotionForm}
              onChange={setPromotionForm}
              approvedProducts={approvedProducts}
              storeForm={storeForm}
              onToggleProduct={togglePromotionProduct}
              onTogglePaymentMethod={(method) => togglePaymentMethod(method, 'promotion')}
              onSubmit={handleSavePromotion}
              saving={savingPromotion}
              submitLabel="פרסום הזמנה שבועית"
            />
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default SellerMarketplaceDashboard;

