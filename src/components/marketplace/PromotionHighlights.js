import React from 'react';
import { Link } from 'react-router-dom';
import { formatPromotionCardLines } from '../../constants/marketplaceFulfillment';
import './marketplace.css';

const formatDate = (value) => {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const PromotionHighlights = ({ promotions = [], loading = false }) => {
  if (loading) {
    return (
      <div className="mp-grid-promos">
        {[1, 2].map((item) => (
          <div key={item} className="mp-skeleton" />
        ))}
      </div>
    );
  }

  if (promotions.length === 0) {
    return (
      <div className="mp-empty">
        <h3 className="mp-empty-title">אין הזמנות שבועיות פעילות</h3>
        <p className="mp-empty-text">
          כשבסטות בשוק יפרסמו הזמנה שבועית — היא תופיע כאן.
        </p>
      </div>
    );
  }

  return (
    <div className="mp-grid-promos">
      {promotions.map((promotion) => (
        <Link
          key={promotion.id}
          to={`/community-marketplace/order/${promotion.id}`}
          className="mp-promo-card"
        >
          <span className="mp-promo-label">הזמנה מצטברת</span>
          <h3 className="mp-promo-title">
            {promotion.title || 'הזמנה שבועית'}
          </h3>
          <p className="mp-promo-business">
            {promotion.businessName || 'בסטה'}
          </p>
          {formatDate(promotion.endsAt) && (
            <p className="text-xs mt-2" style={{ color: '#8b7355' }}>
              עד {formatDate(promotion.endsAt)}
            </p>
          )}
          {promotion.description && (
            <p className="text-sm mt-3 line-clamp-3" style={{ color: '#6b5a45' }}>
              {promotion.description}
            </p>
          )}
          <ul className="mp-fulfillment-summary-list text-sm mt-3" style={{ color: '#6b5a45' }}>
            {formatPromotionCardLines(promotion).slice(0, 3).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="mp-card-cta">לטופס ההזמנה</div>
        </Link>
      ))}
    </div>
  );
};

export default PromotionHighlights;
