import React from 'react';
import './marketplace.css';

const VolunteerPickupPlaceholder = () => {
  return (
    <div className="mp-volunteer-placeholder is-disabled" aria-disabled="true">
      <span className="mp-volunteer-placeholder-badge">בקרוב בשוק</span>
      <strong className="mp-volunteer-placeholder-title">נקודות איסוף מתנדבים</strong>
      <p className="mp-volunteer-placeholder-text">
        בשלב זה ההזמנה לפי אפשרויות האיסוף או המשלוח שהדוכן הגדיר. איסוף מתנדבים יתווסף בעדכון
        עתידי.
      </p>
    </div>
  );
};

export default VolunteerPickupPlaceholder;
