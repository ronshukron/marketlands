import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import { useMarketplaceCart } from '../../contexts/MarketplaceCartContext';
import { getPublicMarketplaceStorePage } from '../../services/marketplaceService';
import LoadingSpinner from '../LoadingSpinner';
import MarketplaceStoreProductTile from './MarketplaceStoreProductTile';
import './marketplace.css';

const formatCurrency = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Number(value || 0));

const MarketplaceStoreShop = () => {
  const { businessId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { cartItems, itemsByStore, totalItems } = useMarketplaceCart();
  const [pageData, setPageData] = useState(null);
  const [loading, setLoading] = useState(true);

  const isOwner = currentUser?.uid === businessId;

  const storeGroup = itemsByStore[businessId];
  const storeItemCount = useMemo(
    () =>
      cartItems
        .filter((item) => item.businessId === businessId)
        .reduce((sum, item) => sum + item.quantity, 0),
    [cartItems, businessId]
  );
  const storeSubtotal = storeGroup?.total || 0;

  useEffect(() => {
    const load = async () => {
      if (!businessId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await getPublicMarketplaceStorePage(businessId);
        setPageData(data);
      } catch (error) {
        console.error('Failed to load store shop', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [businessId]);

  const openMarketCart = () => {
    window.dispatchEvent(new CustomEvent('marketplace-open-cart'));
  };

  const handleStickyCheckout = () => {
    if (totalItems === 0) return;
    navigate('/community-marketplace/checkout');
  };

  if (loading) return <LoadingSpinner />;

  if (!pageData) {
    return (
      <div className="mp-page py-12" dir="rtl">
        <div className="mp-main mp-market-empty">
          <h3 className="mp-market-empty-title">הדוכן לא נמצא</h3>
          <Link to="/community-marketplace" className="mp-btn mp-btn-wood mp-mt-4">
            חזרה לשוק הבסטות
          </Link>
        </div>
      </div>
    );
  }

  const { store, business, products, isPublished, storeCartEnabled } = pageData;

  if (!isPublished && !isOwner) {
    return (
      <div className="mp-page py-12" dir="rtl">
        <div className="mp-main mp-market-empty">
          <h3 className="mp-market-empty-title">הדוכן עדיין לא פורסם</h3>
          <Link to="/community-marketplace" className="mp-btn mp-btn-wood mp-mt-4">
            חזרה לשוק הבסטות
          </Link>
        </div>
      </div>
    );
  }

  const title = store.title || store.businessName || business?.businessName || 'דוכן';
  const shopEnabled = storeCartEnabled !== false;
  const showStickyBar = shopEnabled && products.length > 0;

  return (
    <div className={`mp-page mp-shop-page${showStickyBar ? ' has-shop-sticky' : ''} pb-12`} dir="rtl">
      <div className="mp-main mp-stack">
        <header className="mp-panel mp-shop-header">
          <Link to={`/community-marketplace/store/${businessId}`} className="mp-shop-back">
            ← חזרה לדף הדוכן
          </Link>
          <div className="mp-shop-header-row">
            <div>
              <p className="mp-section-kicker">חנות הדוכן</p>
              <h1 className="mp-section-title mp-section-title-chalk">מוצרים — {title}</h1>
              <p className="mp-section-note text-sm mt-1">
                תוויות מחיר מהשדה — הוסיפו לסל השוק ועברו לקופה
              </p>
            </div>
            <span className="mp-badge mp-crate-badge">{products.length} מוצרים</span>
          </div>
        </header>

        {!shopEnabled ? (
          <div className="mp-panel mp-market-empty">
            <p className="mp-market-empty-text">
              החנות הקבועה כבויה כרגע. חזרו לדף הדוכן להזמנות שבועיות.
            </p>
            <Link to={`/community-marketplace/store/${businessId}`} className="mp-btn mp-btn-wood mt-4">
              דף הדוכן
            </Link>
          </div>
        ) : products.length === 0 ? (
          <div className="mp-panel mp-market-empty">
            <p className="mp-market-empty-text">אין מוצרים זמינים לרכישה כרגע.</p>
            <Link to={`/community-marketplace/store/${businessId}`} className="mp-btn mp-btn-wood mt-4">
              דף הדוכן
            </Link>
          </div>
        ) : (
          <div className="mp-shop-crate-grid">
            {products.map((product) => (
              <MarketplaceStoreProductTile
                key={product.id}
                product={product}
                businessId={businessId}
                storeTitle={title}
              />
            ))}
          </div>
        )}
      </div>

      {showStickyBar && (
        <div className="mp-shop-sticky-bar" role="region" aria-label="סל השוק">
          <div className="mp-shop-sticky-inner">
            <button
              type="button"
              className="mp-shop-sticky-summary"
              onClick={openMarketCart}
              aria-label="פתיחת סל השוק"
            >
              <span className="mp-shop-sticky-label">סל השוק</span>
              <span className="mp-shop-sticky-meta">
                {storeItemCount > 0
                  ? `${storeItemCount} פריטים מדוכן זה · ${formatCurrency(storeSubtotal)}`
                  : 'הוסיפו מוצרים לסל'}
              </span>
            </button>
            <button
              type="button"
              className="mp-btn mp-btn-wood mp-shop-sticky-cta"
              onClick={handleStickyCheckout}
              disabled={totalItems === 0}
            >
              {totalItems > 0 ? 'לתשלום בשוק' : 'הוסף לסל השוק'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketplaceStoreShop;
