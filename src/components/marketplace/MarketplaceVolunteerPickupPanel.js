import React from 'react';
import { Link } from 'react-router-dom';
import { summarizeVolunteerPickupPoint } from '../../utils/marketplaceVolunteerUtils';

/**
 * Customer-facing panel for volunteer pickup status on a weekly promotion order form.
 */
const MarketplaceVolunteerPickupPanel = ({
  promotionId,
  allowVolunteerPickup = false,
  community = '',
  volunteer = null,
  loading = false,
}) => {
  if (!allowVolunteerPickup) return null;

  return (
    <div className="mp-volunteer-panel mp-stack mt-3">
      <h4 className="mp-fulfillment-subtitle">נקודת איסוף של מתנדב</h4>
      {loading && <p className="mp-section-note text-sm">בודקים האם יש מתנדב בקהילה...</p>}
      {!loading && community && volunteer && (
        <p className="mp-alert mp-alert-success text-sm">
          יש נקודת מתנדב פעילה: <strong>{summarizeVolunteerPickupPoint(volunteer)}</strong>
        </p>
      )}
      {!loading && community && !volunteer && (
        <p className="mp-alert mp-alert-warn text-sm">
          אין כרגע נקודת מתנדב פעילה בקהילה שבחרתם. אפשר לפתוח נקודה חדשה או לבחור איסוף מהבסטה /
          משלוח אם זמינים.
        </p>
      )}
      <Link
        to={`/community-marketplace/volunteer/${promotionId}`}
        className="mp-btn mp-btn-secondary text-sm"
        style={{ alignSelf: 'flex-start', minHeight: 44 }}
      >
        לפתוח נקודת איסוף כמתנדב
      </Link>
    </div>
  );
};

export default MarketplaceVolunteerPickupPanel;
