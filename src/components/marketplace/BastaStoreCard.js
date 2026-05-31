import React from 'react';
import { Link } from 'react-router-dom';
import defaultBackground from '../../images/Field.jpg';
import './marketplace.css';

/**
 * Single בסטה card — marketplace store page or manual featured card (`href`).
 */
const BastaStoreCard = ({ store, featured = false }) => {
  const businessId = store.businessId || store.id;
  const to = store.href || `/community-marketplace/store/${businessId}`;
  const ctaLabel = store.ctaLabel || 'כניסה לבסטה';

  return (
    <Link
      to={to}
      className={`mp-basta-card ${featured ? 'mp-basta-card-featured' : ''}`}
    >
      {featured && (
        <span className="mp-basta-card-featured-ribbon">הבסטה שלנו</span>
      )}
      <div className="mp-basta-card-image">
        <img
          src={store.coverImageUrl || defaultBackground}
          alt={store.title || store.businessName || 'בסטה'}
        />
      </div>
      <div className="mp-basta-card-body">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="mp-basta-card-title">
              {store.title || store.businessName || 'בסטה'}
            </h3>
            <p className="mp-basta-card-meta">
              {store.homeCommunity || 'כל הקהילות'}
            </p>
          </div>
          {store.businessKind && (
            <span className="mp-badge">{store.businessKind}</span>
          )}
        </div>
        {store.shortDescription && (
          <p className="text-sm mt-3 line-clamp-2" style={{ color: '#6b5a45' }}>
            {store.shortDescription}
          </p>
        )}
        {Array.isArray(store.tags) && store.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {store.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="mp-tag">{tag}</span>
            ))}
          </div>
        )}
        <div className="mp-card-cta">{ctaLabel}</div>
      </div>
    </Link>
  );
};

export default BastaStoreCard;
