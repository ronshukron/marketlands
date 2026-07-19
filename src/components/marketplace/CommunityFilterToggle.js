import React from 'react';
import { pickupSpots } from '../../data/pickupSpots';
import './marketplace.css';

const CommunityPinIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 21s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

const CommunityFilterToggle = ({
  communityName,
  communityMode,
  onCommunityChange,
  onModeChange,
  variant = 'panel',
}) => {
  const isRail = variant === 'rail';

  const content = (
    <>
      {isRail && (
        <div className="mp-community-rail-head">
          <CommunityPinIcon />
          <span>מאיזו קהילה אתם?</span>
        </div>
      )}
      <div className="mp-community-rail-row">
        <div className={isRail ? 'flex-1 min-w-0' : 'flex-1'}>
          <label className="mp-filter-label" htmlFor="mp-community-select">
            {isRail ? 'הקהילה שלי' : 'הקהילה שלי'}
          </label>
          <select
            id="mp-community-select"
            value={communityName}
            onChange={(event) => onCommunityChange(event.target.value)}
            className="mp-select"
          >
            <option value="">בחרו קהילה</option>
            {pickupSpots.map((spot) => (
              <option key={spot} value={spot}>
                {spot}
              </option>
            ))}
          </select>
        </div>

        <div className="mp-toggle-group">
          <button
            type="button"
            onClick={() => onModeChange('own')}
            className={`mp-toggle-btn ${communityMode === 'own' ? 'is-active' : ''}`}
          >
            הקהילה שלי
          </button>
          <button
            type="button"
            onClick={() => onModeChange('all')}
            className={`mp-toggle-btn ${communityMode === 'all' ? 'is-active' : ''}`}
          >
            כל הקהילות
          </button>
        </div>
      </div>
    </>
  );

  if (isRail) {
    return (
      <div id="community-filter" className="mp-community-rail" dir="rtl">
        {content}
      </div>
    );
  }

  return (
    <div id="community-filter" className="mp-panel" dir="rtl">
      <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
        {content}
      </div>
    </div>
  );
};

export default CommunityFilterToggle;
