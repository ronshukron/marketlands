import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import {
  PAYMENT_METHOD_LABELS,
  getPublicMarketplaceStorePage,
  toDate,
} from '../../services/marketplaceService';
import LoadingSpinner from '../LoadingSpinner';
import defaultBackground from '../../images/Field.jpg';
import StoreContentDisplay from './StoreContentDisplay';
import MarketplaceFulfillmentSummary from './MarketplaceFulfillmentSummary';
import MarketplaceStoreProductTile from './MarketplaceStoreProductTile';
import './marketplace.css';

const formatDate = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleDateString('he-IL') : '';
};

const MarketplaceStorePage = () => {
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
        console.error('Failed to load marketplace store page', error);
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

  const { store, business, products, promotions, isPublished, storeCartEnabled } = pageData;

  if (!isPublished && !isOwner) {
    return (
      <div className="mp-page py-12" dir="rtl">
        <div className="mp-main mp-empty">
          <h3 className="mp-empty-title">הבסטה עדיין לא פורסמה</h3>
          <p className="mp-empty-text">בעל הבסטה יכול לפרסם אותה מהגדרות דף החנות.</p>
          <Link to="/community-marketplace" className="mp-btn mp-btn-wood" style={{ marginTop: '1rem' }}>
            חזרה לשוק הבסטות
          </Link>
        </div>
      </div>
    );
  }

  const title = store.title || store.businessName || business?.businessName || 'בסטה';
  return (
    <div className="mp-page pb-12" dir="rtl">
      <div className="mp-store-public-hero">
        <img
          src={store.coverImageUrl || defaultBackground}
          alt=""
          className="mp-store-public-cover"
        />
        <div className="mp-store-public-hero-overlay" />
        <div className="mp-main mp-store-public-hero-content">
          <Link to="/community-marketplace" className="mp-store-public-back">
            ← שוק הבסטות
          </Link>
          <div className="mp-store-public-header">
            <div className="mp-store-public-avatar-wrap">
              <img
                src={store.profileImageUrl || store.coverImageUrl || defaultBackground}
                alt={title}
                className="mp-store-public-avatar"
              />
            </div>
            <div>
              <h1 className="mp-store-public-title">{title}</h1>
              {store.businessKind && (
                <span className="mp-badge" style={{ marginTop: '0.35rem' }}>
                  {store.businessKind}
                </span>
              )}
              <p className="mp-store-public-meta">
                {store.homeCommunity || business?.communityName || 'שוק הבסטות'}
              </p>
              {store.shortDescription && (
                <p className="mp-store-public-tagline">{store.shortDescription}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mp-main mp-stack" style={{ marginTop: '-2rem', position: 'relative', zIndex: 2 }}>
        {isOwner && !isPublished && (
          <div className="mp-panel" style={{ borderColor: '#e6c200', background: '#fffbeb' }}>
            <p className="text-sm text-amber-900">
              הדף לא מוצג לציבור.{' '}
              <Link to="/marketplace/my-store" className="font-bold underline">
                פרסמו את הבסטה
              </Link>
            </p>
          </div>
        )}

        {isOwner && (
          <div className="flex justify-end">
            <Link to="/marketplace/my-store" className="mp-btn mp-btn-wood">
              עריכת דף הבסטה
            </Link>
          </div>
        )}

        {(store.storeDescription || business?.storeDescription) && (
          <div className="mp-panel">
            <h2 className="mp-section-title mb-3">אודות הבסטה</h2>
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {store.storeDescription || business?.storeDescription}
            </p>
          </div>
        )}

        <StoreContentDisplay store={store} business={business} />

        <MarketplaceFulfillmentSummary store={store} />

        {Array.isArray(store.tags) && store.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {store.tags.map((tag) => (
              <span key={tag} className="mp-tag">
                {tag}
              </span>
            ))}
          </div>
        )}

        {promotions.length > 0 && (
          <div className="mp-panel">
            <h2 className="mp-section-title mb-4">הזמנות שבועיות פעילות</h2>
            <div className="mp-grid-promos">
              {promotions.map((promotion) => (
                <Link
                  key={promotion.id}
                  to={`/community-marketplace/order/${promotion.id}`}
                  className="mp-promo-card"
                >
                  <span className="mp-promo-label">הזמנה מצטברת</span>
                  <h3 className="mp-promo-title">{promotion.title || 'הזמנה שבועית'}</h3>
                  {formatDate(promotion.endsAt) && (
                    <p className="text-xs mt-2" style={{ color: '#8b7355' }}>
                      עד {formatDate(promotion.endsAt)}
                    </p>
                  )}
                  <div className="mp-card-cta">להזמנה</div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {storeCartEnabled !== false && (
          <div className="mp-panel">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="mp-section-title">מוצרים</h2>
              <span className="text-sm text-gray-500">{products.length} מוצרים</span>
            </div>
            {products.length === 0 ? (
              <p className="mp-section-note">
                אין מוצרים זמינים לרכישה בחנות הקבועה כרגע. בדקו הזמנות שבועיות למטה.
              </p>
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
        )}

        {storeCartEnabled === false && promotions.length === 0 && (
          <div className="mp-panel">
            <p className="mp-section-note">
              הבסטה פעילה כרגע בהזמנות שבועיות בלבד. חזרו בקרוב או פנו לבעל העסק.
            </p>
          </div>
        )}

        {Array.isArray(store.manualPaymentMethods) && store.manualPaymentMethods.length > 0 && (
          <div className="mp-panel">
            <h2 className="mp-section-title mb-2">אמצעי תשלום</h2>
            <p className="text-sm text-gray-600">
              {store.manualPaymentMethods.map((m) => PAYMENT_METHOD_LABELS[m] || m).join(' · ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketplaceStorePage;
