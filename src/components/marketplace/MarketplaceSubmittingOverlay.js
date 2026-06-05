import React from 'react';
import './marketplace.css';

const MarketplaceSubmittingOverlay = ({ message = 'שולח הזמנה...' }) => (
  <div className="mp-submit-overlay" role="status" aria-live="polite" aria-busy="true">
    <div className="mp-submit-overlay-card">
      <p className="mp-submit-overlay-kicker">קופת השוק</p>
      <div className="mp-submit-spinner" aria-hidden="true" />
      <p className="mp-submit-overlay-message">{message}</p>
      <p className="mp-submit-overlay-hint">אנא המתינו — אל תסגרו את הדף</p>
    </div>
  </div>
);

export default MarketplaceSubmittingOverlay;
