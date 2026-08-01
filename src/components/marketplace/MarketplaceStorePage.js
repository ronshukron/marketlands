import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import {
  PAYMENT_METHOD_LABELS,
  getPublicMarketplaceStorePage,
} from '../../services/marketplaceService';
import { cleanShortDescription } from '../../constants/marketplaceStoreContent';
import { getPromotionDeadlineChip } from '../../utils/marketplacePromotionDeadline';
import { formatPromotionClosingDateTime } from '../../utils/marketplacePromotionSchedule';
import { PAYMENT_CHIP_ICONS } from '../../utils/marketplacePaymentChips';
import LoadingSpinner from '../LoadingSpinner';
import defaultBackground from '../../images/Field.jpg';
import StoreContentDisplay, { hasStorePageEditorContent } from './StoreContentDisplay';
import MarketplaceFulfillmentSummary from './MarketplaceFulfillmentSummary';
import MarketplaceStoreProductTile from './MarketplaceStoreProductTile';
import './marketplace.css';

const FEATURED_PRODUCT_COUNT = 4;

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
        <div className="mp-main mp-market-empty">
          <h3 className="mp-market-empty-title">הבסטה לא נמצאה</h3>
          <Link to="/community-marketplace" className="mp-btn mp-btn-wood mp-mt-4">
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
        <div className="mp-main mp-market-empty">
          <h3 className="mp-market-empty-title">הבסטה עדיין לא פורסמה</h3>
          <p className="mp-market-empty-text">בעל הבסטה יכול לפרסם אותה מהגדרות דף החנות.</p>
          <Link to="/community-marketplace" className="mp-btn mp-btn-wood mp-mt-4">
            חזרה לשוק הבסטות
          </Link>
        </div>
      </div>
    );
  }

  const title = store.title || store.businessName || business?.businessName || 'בסטה';
  const shortDescription = cleanShortDescription(store.shortDescription);
  const phone = store.phone || business?.phone;
  const homeCommunity = store.homeCommunity || business?.communityName || '';
  const shopEnabled = storeCartEnabled !== false;
  const featuredProducts = products.slice(0, FEATURED_PRODUCT_COUNT);
  const hasMoreProducts = products.length > FEATURED_PRODUCT_COUNT;
  const paymentMethods = Array.isArray(store.manualPaymentMethods)
    ? store.manualPaymentMethods
    : [];
  const tags = Array.isArray(store.tags) ? store.tags : [];
  const hasBastaDetails = Boolean(homeCommunity) || tags.length > 0 || Boolean(phone);
  const showStorePageContent = hasStorePageEditorContent(store, business);

  const primaryShopCta =
    shopEnabled && products.length > 0
      ? {
          to: `/community-marketplace/store/${businessId}/shop`,
          label: 'לחנות ולסל השוק',
        }
      : null;

  return (
    <div className="mp-page pb-12" dir="rtl">
      <header className="mp-stall-cover mp-store-public-hero">
        <img
          src={store.coverImageUrl || defaultBackground}
          alt=""
          className="mp-stall-cover-image mp-store-public-cover"
        />
        <div className="mp-stall-cover-topo" aria-hidden="true" />
        <div className="mp-stall-cover-overlay mp-store-public-hero-overlay" />
        <div className="mp-main mp-stall-cover-content mp-store-public-hero-content">
          <Link to="/community-marketplace" className="mp-stall-cover-back mp-store-public-back">
            ← חזרה לשוק הבסטות
          </Link>
          <div className="mp-stall-cover-header mp-store-public-header">
            <div className="mp-stall-cover-avatar-wrap mp-store-public-avatar-wrap">
              <img
                src={store.profileImageUrl || store.coverImageUrl || defaultBackground}
                alt={title}
                className="mp-stall-cover-avatar mp-store-public-avatar"
              />
            </div>
            <div>
              <h1 className="mp-stall-cover-title mp-store-public-title">{title}</h1>
              {store.businessKind && (
                <span className="mp-badge mp-crate-badge mp-mt-1">
                  {store.businessKind}
                </span>
              )}
              {homeCommunity && (
                <p className="mp-stall-cover-meta mp-store-public-meta">{homeCommunity}</p>
              )}
              {shortDescription && (
                <p className="mp-stall-cover-tagline mp-store-public-tagline">{shortDescription}</p>
              )}
              <div className="mp-stall-cover-actions">
                {shopEnabled && products.length > 0 && (
                  <a href="#stall-products" className="mp-btn mp-btn-primary">
                    למוצרים
                  </a>
                )}
                {promotions.length > 0 && (
                  <a href="#stall-weekly" className="mp-btn mp-btn-wood">
                    הזמנה שבועית
                  </a>
                )}
                {primaryShopCta && (
                  <Link to={primaryShopCta.to} className="mp-btn mp-btn-wood">
                    {primaryShopCta.label}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mp-main mp-stack mp-stall-page-body">
        {isOwner && !isPublished && (
          <div className="mp-panel mp-store-notice">
            <p className="mp-text-soil text-sm">
              הדף לא מוצג לציבור.{' '}
              <Link to="/marketplace/my-store" className="font-bold underline">
                פרסמו את הבסטה
              </Link>
            </p>
          </div>
        )}

        {isOwner && (
          <div className="flex flex-wrap justify-end gap-2">
            <Link to="/marketplace/my-store" className="mp-btn mp-btn-wood">
              עריכת דף הבסטה
            </Link>
            {primaryShopCta && (
              <Link to={primaryShopCta.to} className="mp-btn mp-btn-primary">
                תצוגת חנות מלאה
              </Link>
            )}
          </div>
        )}

        {/* 1. מוצרים — ראשון */}
        {shopEnabled && (
          <section
            id="stall-products"
            className="mp-panel mp-crate-row-section"
            aria-labelledby="stall-products-title"
          >
            <div className="mp-crate-row-head">
              <div>
                <h2 id="stall-products-title" className="mp-section-title mp-section-title-chalk">
                  מוצרים מהבסטה
                </h2>
                <p className="mp-section-note text-sm mt-1">
                  {products.length > 0
                    ? 'גללו את שורת המוצרים — הוסיפו לסל השוק'
                    : 'בקרוב יתווספו מוצרים לרכישה.'}
                </p>
              </div>
              {products.length > 0 && (
                <Link
                  to={`/community-marketplace/store/${businessId}/shop`}
                  className="mp-btn mp-btn-wood"
                >
                  לכל המוצרים ({products.length})
                </Link>
              )}
            </div>

            {products.length === 0 ? (
              <p className="mp-section-note px-5 pb-4">
                אין מוצרים זמינים לרכישה מיידית.
                {promotions.length > 0 ? ' בדקו את ההזמנה השבועית למטה.' : ''}
              </p>
            ) : (
              <>
                <div className="mp-crate-row-scroll">
                  {featuredProducts.map((product) => (
                    <MarketplaceStoreProductTile
                      key={product.id}
                      product={product}
                      businessId={businessId}
                      storeTitle={title}
                    />
                  ))}
                </div>
                {hasMoreProducts && (
                  <div className="mp-crate-row-footer">
                    <span className="mp-crate-row-count">
                      מוצגים {FEATURED_PRODUCT_COUNT} מתוך {products.length} מוצרים
                    </span>
                    <Link
                      to={`/community-marketplace/store/${businessId}/shop`}
                      className="mp-btn mp-btn-wood"
                    >
                      לחנות המלאה ←
                    </Link>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* 2. תוכן דף הבסטה — קצת עלינו, הודעות, קשר, מדיניות, רשתות */}
        {showStorePageContent && (
          <StoreContentDisplay
            store={store}
            business={business}
            showDeliverySection
            showGroupTitle
          />
        )}

        {/* הזמנות שבועיות פעילות */}
        {promotions.length > 0 && (
          <section id="stall-weekly" className="mp-panel" aria-labelledby="stall-weekly-title">
            <h2 id="stall-weekly-title" className="mp-section-title mp-section-title-chalk mb-4">
              הזמנה שבועית מהבסטה
            </h2>
            <div className="mp-stall-weekly-inline">
              {promotions.map((promotion) => {
                const deadline = getPromotionDeadlineChip(promotion.endsAt);
                const closingLabel = formatPromotionClosingDateTime(promotion.endsAt);
                return (
                  <Link
                    key={promotion.id}
                    to={`/community-marketplace/order/${promotion.id}`}
                    className="mp-weekly-board-card"
                  >
                    <div className="mp-weekly-board-card-head">
                      <span className="mp-weekly-board-label">הזמנה מצטברת</span>
                      {deadline && !deadline.past && (
                        <span
                          className={`mp-deadline-chip${deadline.soon ? ' is-soon' : ''}`}
                        >
                          {deadline.text}
                        </span>
                      )}
                    </div>
                    <h3 className="mp-weekly-board-title">
                      {promotion.title || 'הזמנה שבועית'}
                    </h3>
                    {closingLabel && (
                      <p className="mp-weekly-board-business">נסגרת: {closingLabel}</p>
                    )}
                    <div className="mp-weekly-board-cta">להזמין ←</div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* פרטי הבסטה — כמו בדף my-store */}
        {hasBastaDetails && (
          <section className="mp-panel mp-basta-quick-facts" aria-label="פרטי הבסטה">
            <h2 className="mp-section-title mp-section-title-chalk mb-3">פרטי הבסטה</h2>
            {homeCommunity && (
              <p className="mp-section-note text-sm mb-2">
                <strong>קהילת בית:</strong> {homeCommunity}
              </p>
            )}
            {tags.length > 0 && (
              <div className="mp-basta-quick-facts-tags">
                {tags.map((tag) => (
                  <span key={tag} className="mp-tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {phone && (
              <div className="mp-basta-quick-facts-contact">
                <a href={`tel:${phone}`} className="mp-btn mp-btn-outline mp-bench-btn-sm">
                  {phone}
                </a>
              </div>
            )}
          </section>
        )}

        {/* אפשרויות אספקה — כמו בדף my-store */}
        <MarketplaceFulfillmentSummary store={store} title="אפשרויות אספקה" />

        {/* אמצעי תשלום ידניים */}
        {paymentMethods.length > 0 && (
          <section className="mp-payment-wood-panel" aria-labelledby="stall-payment-title">
            <h2 id="stall-payment-title" className="mp-payment-wood-title">
              תשלום בשוק
            </h2>
            <p className="mp-payment-wood-note">תשלום ידני ישירות לבעל הבסטה לאחר ההזמנה</p>
            <div className="mp-payment-chips">
              {paymentMethods.map((method) => (
                <span key={method} className="mp-payment-chip">
                  <span className="mp-payment-chip-icon" aria-hidden="true">
                    {PAYMENT_CHIP_ICONS[method] || '•'}
                  </span>
                  {PAYMENT_METHOD_LABELS[method] || method}
                </span>
              ))}
            </div>
          </section>
        )}

        {shopEnabled === false && promotions.length === 0 && (
          <div className="mp-panel">
            <p className="mp-section-note">
              הבסטה פעילה כרגע בהזמנות שבועיות בלבד. חזרו בקרוב או פנו לבעל העסק.
            </p>
          </div>
        )}

        {!shopEnabled && promotions.length > 0 && (
          <p className="mp-section-note text-sm">
            החנות הקבועה כבויה — ניתן להזמין דרך ההזמנה השבועית למעלה.
          </p>
        )}
      </div>
    </div>
  );
};

export default MarketplaceStorePage;
