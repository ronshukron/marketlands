import React from 'react';
import { pickupSpots } from '../../data/pickupSpots';
import './marketplace.css';

const CommunityFilterToggle = ({
  communityName,
  communityMode,
  onCommunityChange,
  onModeChange,
}) => {
  return (
    <div className="mp-panel" dir="rtl">
      <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
        <div className="flex-1">
          <label className="mp-filter-label">הקהילה שלי</label>
          <select
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
    </div>
  );
};

export default CommunityFilterToggle;
