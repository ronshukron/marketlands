import React, { useEffect, useMemo } from 'react';
import usePickupSpots from '../../hooks/usePickupSpots';
import {
  getCanonicalCommunityName,
  getConfiguredCommunityLabels,
  getCustomerFulfillmentOptions,
  getServiceableCommunityNames,
} from '../../constants/marketplaceFulfillment';

const MarketplaceFulfillmentPicker = ({
  fulfillment,
  community,
  value,
  onChange,
  onCommunityChange,
  showCommunitySelect = true,
  /** Unique per business on checkout — otherwise radios share one group page-wide */
  radioGroupName = 'fulfillmentMethod',
  volunteerAvailable = false,
  volunteer = null,
  volunteerCommunities = [],
}) => {
  const { pickupSpots, loaded: communitiesLoaded } = usePickupSpots();
  const communityOptions = useMemo(() => {
    if (!fulfillment) return [];
    return getServiceableCommunityNames(fulfillment, pickupSpots, { volunteerCommunities });
  }, [fulfillment, pickupSpots, volunteerCommunities]);

  const servedCommunityHint = useMemo(
    () => getConfiguredCommunityLabels(fulfillment),
    [fulfillment]
  );

  const options = useMemo(
    () =>
      getCustomerFulfillmentOptions(fulfillment, community, {
        volunteerAvailable,
        volunteer,
      }),
    [fulfillment, community, volunteerAvailable, volunteer]
  );

  const optionIds = useMemo(() => options.map((o) => o.id).join(','), [options]);

  useEffect(() => {
    if (!community || !fulfillment) return;
    const canonical = getCanonicalCommunityName(community);
    if (canonical && canonical !== community) {
      onCommunityChange?.(canonical);
    }
  }, [community, fulfillment, onCommunityChange]);

  useEffect(() => {
    if (!communitiesLoaded || !fulfillment || !community || !onCommunityChange) return;
    const canonical = getCanonicalCommunityName(community);
    if (!communityOptions.includes(canonical)) {
      onCommunityChange('');
    }
  }, [
    communitiesLoaded,
    community,
    communityOptions,
    fulfillment,
    onCommunityChange,
  ]);

  useEffect(() => {
    if (!community || options.length === 0) return;
    const stillValid = value && options.some((o) => o.id === value);
    if (!stillValid) {
      onChange(options[0].id, options[0].label, options[0]);
    }
  }, [community, optionIds, value, onChange, options]);

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
            <option value="">
              {communitiesLoaded ? 'בחרו קהילה' : 'טוען קהילות...'}
            </option>
            {communityOptions.map((spot) => (
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
          {servedCommunityHint.length > 0 ? (
            <>
              הבסטה משרתת רק את הקהילות:{' '}
              <strong>{servedCommunityHint.join(' · ')}</strong>. בחרו אחת מהן ברשימה למעלה.
            </>
          ) : (
            <>הבסטה אינה משרתת את הקהילה שבחרתם באיסוף או במשלוח.</>
          )}
        </p>
      )}

      {community && options.length > 0 && (
        <fieldset className="mp-fulfillment-option-list">
          <legend className="mp-form-label mb-2">אופן אספקה *</legend>
          {options.map((option) => (
            <label
              key={option.id}
              className={`mp-fulfillment-option-card ${value === option.id ? 'is-selected' : ''} ${
                option.subtype === 'volunteer' ? 'is-volunteer' : ''
              }`}
            >
              <input
                type="radio"
                name={radioGroupName}
                className="mp-fulfillment-option-radio"
                checked={value === option.id}
                onChange={() => onChange(option.id, option.label, option)}
              />
              <span className="mp-fulfillment-option-text">
                <strong>{option.label}</strong>
                {option.description && (
                  <span className="mp-fulfillment-option-desc">{option.description}</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {community && options.length > 0 && !value && (
        <p className="mp-alert mp-alert-warn text-sm">בחרו אופן אספקה מהרשימה למעלה.</p>
      )}
    </div>
  );
};

export default MarketplaceFulfillmentPicker;
