import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import { getPublicMarketplaceStorePage } from '../../services/marketplaceService';
import LoadingSpinner from '../LoadingSpinner';
import MarketplaceStoreProductTile from './MarketplaceStoreProductTile';
import './marketplace.css';

const MarketplaceStoreShop = () => {
  const { businessId } = useParams();
  const { currentUser } = useAuth();
  const [pageData, setPageData] = useState(null);
  const [loading, setLoading] = useState(true);

  const isOwner = currentUser?.uid === businessId;

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

  if (loading) return <LoadingSpinner />;

  if (!pageData) {
    return (
      <div className="mp-page py-12" dir="rtl">
        <div className="mp-main mp-empty">
          <h3 className="mp-empty-title">הבסטה לא נמצאה</h3>
          <Link to="/community-marketplace" className="mp-btn mp-btn-wood" style={{ marginTop: '1rem' }}>
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
        <div className="mp-main mp-empty">
          <h3 className="mp-empty-title">הבסטה עדיין לא פורסמה</h3>
          <Link to="/community-marketplace" className="mp-btn mp-btn-wood" style={{ marginTop: '1rem' }}>
            חזרה לשוק הבסטות
          </Link>
        </div>
      </div>
    );
  }

  const title = store.title || store.businessName || business?.businessName || 'בסטה';
  const shopEnabled = storeCartEnabled !== false;

  return (
    <div className="mp-page pb-12" dir="rtl">
      <div className="mp-main mp-stack">
        <div className="mp-panel mp-store-shop-header">
          <Link to={`/community-marketplace/store/${businessId}`} className="mp-link">
            ← חזרה לדף הבסטה
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-3">
            <div>
              <h1 className="mp-section-title">מוצרים — {title}</h1>
              <p className="mp-section-note text-sm mt-1">
                הוסיפו לסל ועברו לתשלום בקופה. הסל נשמר בין דפי השוק.
              </p>
            </div>
            <span className="mp-badge">{products.length} מוצרים</span>
          </div>
        </div>

        {!shopEnabled ? (
          <div className="mp-panel mp-empty text-center">
            <p className="mp-section-note">
              החנות הקבועה כבויה כרגע. חזרו לדף הבסטה להזמנות שבועיות.
            </p>
            <Link to={`/community-marketplace/store/${businessId}`} className="mp-btn mp-btn-wood mt-4">
              דף הבסטה
            </Link>
          </div>
        ) : products.length === 0 ? (
          <div className="mp-panel mp-empty text-center">
            <p className="mp-section-note">אין מוצרים זמינים לרכישה כרגע.</p>
            <Link to={`/community-marketplace/store/${businessId}`} className="mp-btn mp-btn-wood mt-4">
              דף הבסטה
            </Link>
          </div>
        ) : (
          <div className="mp-store-products-grid">
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
    </div>
  );
};

export default MarketplaceStoreShop;
