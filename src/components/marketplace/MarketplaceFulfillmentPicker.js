import React, { useEffect } from 'react';
import { pickupSpots } from '../../data/pickupSpots';
import { getCustomerFulfillmentOptions } from '../../constants/marketplaceFulfillment';

const MarketplaceFulfillmentPicker = ({
  fulfillment,
  community,
  value,
  onChange,
  onCommunityChange,
  showCommunitySelect = true,
  /** Unique per business on checkout — otherwise radios share one group page-wide */
  radioGroupName = 'fulfillmentMethod',
}) => {
  const options = getCustomerFulfillmentOptions(fulfillment, community);

  useEffect(() => {
    if (!value && options.length > 0) {
      onChange(options[0].id, options[0].label);
    }
  }, [options, value, onChange]);

  return (
    <div className="mp-fulfillment-picker mp-stack">
      {showCommunitySelect && (
        <label className="mp-form-label">
          הקהילה שלי
          <select
            className="mp-select"
            value={community || ''}
            onChange={(e) => onCommunityChange?.(e.target.value)}
          >
            <option value="">בחרו קהילה</option>
            {pickupSpots.map((spot) => (
              <option key={spot} value={spot}>
                {spot}
              </option>
            ))}
          </select>
        </label>
      )}

      {!community && (
        <p className="mp-alert mp-alert-warn text-sm">בחרו קהילה כדי לראות אפשרויות אספקה.</p>
      )}

      {community && options.length === 0 && (
        <p className="mp-alert mp-alert-warn text-sm">
          הבסטה אינה משרתת את הקהילה שבחרתם באיסוף או במשלוח.
        </p>
      )}

      {community && options.length > 0 && (
        <div className="mp-fulfillment-option-list">
          <p className="mp-form-label mb-2">אופן אספקה</p>
          {options.map((option) => (
            <label
              key={option.id}
              className={`mp-fulfillment-option-card ${value === option.id ? 'is-selected' : ''}`}
            >
              <input
                type="radio"
                name={radioGroupName}
                checked={value === option.id}
                onChange={() => onChange(option.id, option.label)}
              />
              <span>
                <strong>{option.label}</strong>
                {option.description && (
                  <span className="block text-sm text-gray-600 mt-0.5">{option.description}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export default MarketplaceFulfillmentPicker;
