import React from 'react';
import { Link } from 'react-router-dom';
import { formatPromotionCardLines } from '../../constants/marketplaceFulfillment';
import { getPromotionDeadlineChip } from '../../utils/marketplacePromotionDeadline';
import { formatPromotionClosingDateTime } from '../../utils/marketplacePromotionSchedule';
import './marketplace.css';

const PromotionHighlights = ({ promotions = [], loading = false }) => {
  if (loading) {
    return (
      <div className="mp-weekly-board-wrap">
        <div className="mp-weekly-board" aria-busy="true">
          {[1, 2, 3].map((item) => (
            <div key={item} className="mp-skeleton mp-weekly-board-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (promotions.length === 0) {
    return (
      <div className="mp-market-empty">
        <h3 className="mp-market-empty-title">עדיין אין הזמנות השבוע</h3>
        <p className="mp-market-empty-text">
          כשבסטות בשוק יפרסמו מכירה שבועית — היא תופיע כאן על לוח השוק.
        </p>
      </div>
    );
  }

  return (
    <div className="mp-weekly-board-wrap">
      <div className="mp-weekly-board" role="list">
        {promotions.map((promotion) => {
          const deadline = getPromotionDeadlineChip(promotion.endsAt);
          const closingLabel = formatPromotionClosingDateTime(promotion.endsAt);

          return (
            <Link
              key={promotion.id}
              to={`/community-marketplace/order/${promotion.id}`}
              className="mp-weekly-board-card"
              role="listitem"
            >
              <div className="mp-weekly-board-card-head">
                <span className="mp-weekly-board-label">מהשדה השבוע</span>
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
              <p className="mp-weekly-board-business">
                {promotion.businessName || 'בסטה'}
              </p>
              {promotion.description && (
                <p className="mp-weekly-board-desc line-clamp-2">
                  {promotion.description}
                </p>
              )}
              <ul className="mp-weekly-board-lines">
                {closingLabel && <li>נסגרת: {closingLabel}</li>}
                {formatPromotionCardLines(promotion).slice(0, 3).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="mp-weekly-board-cta">להזמין מהשבוע ←</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default PromotionHighlights;
