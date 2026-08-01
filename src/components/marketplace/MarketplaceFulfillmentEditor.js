import React from 'react';
import usePickupSpots from '../../hooks/usePickupSpots';
import {
  communityNamesMatch,
  formatDeliveryPrice,
  PICKUP_SCOPE_ALL,
  PICKUP_SCOPE_INHERIT,
  PICKUP_SCOPE_SELECTED,
} from '../../constants/marketplaceFulfillment';

const CommunityChecklist = ({
  communities,
  label,
  hint,
  selected,
  onChange,
  disabled = false,
}) => (
  <div className="mp-fulfillment-communities">
    <p className="mp-form-label">{label}</p>
    {hint && <p className="mp-section-note text-sm mb-2">{hint}</p>}
    <div className="mp-fulfillment-community-grid">
      {communities.map((spot) => {
        const checked = selected.some((community) => communityNamesMatch(community, spot));
        return (
          <label
            key={spot}
            className={`mp-fulfillment-community-chip ${checked ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => {
                if (disabled) return;
                onChange(
                  checked
                    ? selected.filter((community) => !communityNamesMatch(community, spot))
                    : [...selected, spot]
                );
              }}
            />
            <span>{spot}</span>
          </label>
        );
      })}
    </div>
  </div>
);

/**
 * @param {'store' | 'promotion'} mode
 * @param {object} value fulfillment fields on parent form
 * @param {function} onChange (patch) => void
 * @param {object} [storeFulfillment] for promotion inherit preview
 */
const MarketplaceFulfillmentEditor = ({ mode = 'store', value = {}, onChange, storeFulfillment }) => {
  const { pickupSpots, loaded: communitiesLoaded } = usePickupSpots();
  const patch = (updates) => onChange({ ...value, ...updates });

  const isStore = mode === 'store';
  const pickupScope = value.pickupScope || (isStore ? PICKUP_SCOPE_ALL : PICKUP_SCOPE_INHERIT);
  const pickupCommunities = Array.isArray(value.pickupCommunities) ? value.pickupCommunities : [];
  const deliveryCommunities = Array.isArray(value.deliveryCommunities) ? value.deliveryCommunities : [];

  return (
    <div className="mp-fulfillment-editor mp-stack">
      <div>
        <h3 className="mp-section-title text-base">אפשרויות אספקה</h3>
        <p className="mp-section-note text-sm mt-1">
          {isStore
            ? 'איסוף עצמי יכול להיות פתוח לכולם; משלוח — רק לקהילות שתבחרו.'
            : 'הזמנה מצטברת לאורך השבוע. ניתן לאפשר איסוף עצמי בנוסף למשלוח מרוכז בתאריך שנקבע.'}
        </p>
      </div>

      {isStore ? (
        <section className="mp-fulfillment-block">
          <h4 className="mp-fulfillment-subtitle">איסוף עצמי</h4>
          <label className="mp-fulfillment-radio">
            <input
              type="radio"
              name="storePickupScope"
              checked={pickupScope === PICKUP_SCOPE_ALL}
              onChange={() => patch({ pickupScope: PICKUP_SCOPE_ALL, pickupCommunities: [] })}
            />
            <span>כולם יכולים לאסוף בעצמם (כל הקהילות)</span>
          </label>
          <label className="mp-fulfillment-radio">
            <input
              type="radio"
              name="storePickupScope"
              checked={pickupScope === PICKUP_SCOPE_SELECTED}
              onChange={() => patch({ pickupScope: PICKUP_SCOPE_SELECTED })}
            />
            <span>איסוף עצמי רק מקהילות נבחרות</span>
          </label>
          {pickupScope === PICKUP_SCOPE_SELECTED && (
            <CommunityChecklist
              communities={pickupSpots}
              label="קהילות לאיסוף עצמי"
              selected={pickupCommunities}
              onChange={(list) => patch({ pickupCommunities: list })}
            />
          )}
          <label className="mp-form-label mt-3">
            הוראות איסוף
            <textarea
              className="mp-input"
              rows={2}
              value={value.pickupInstructions || ''}
              onChange={(e) => patch({ pickupInstructions: e.target.value })}
              placeholder="מיקום, שעות, תיאום..."
            />
          </label>
        </section>
      ) : (
        <section className="mp-fulfillment-block">
          <h4 className="mp-fulfillment-subtitle">חלון הזמנה מצטברת</h4>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="mp-form-label">
              פתיחת הזמנות
              <input
                type="date"
                className="mp-input"
                value={value.startsAt || ''}
                onChange={(e) => patch({ startsAt: e.target.value })}
              />
            </label>
            <label className="mp-form-label">
              תאריך סגירה
              <input
                type="date"
                className="mp-input"
                value={value.endsAt || ''}
                onChange={(e) => patch({ endsAt: e.target.value })}
                required
              />
            </label>
            <label className="mp-form-label">
              שעת סגירה מדויקת
              <input
                type="time"
                className="mp-input"
                value={value.endsAtTime || ''}
                onChange={(e) => patch({ endsAtTime: e.target.value })}
                required
              />
            </label>
            <label className="mp-form-label">
              תאריך משלוח מרוכז
              <input
                type="date"
                className="mp-input"
                value={value.deliveryDate || ''}
                onChange={(e) => patch({ deliveryDate: e.target.value })}
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-2 text-sm mt-3">
            <input
              type="checkbox"
              checked={value.allowSelfPickup !== false}
              onChange={(e) => patch({ allowSelfPickup: e.target.checked })}
            />
            אפשרו גם איסוף עצמי מהבסטה במהלך השבוע
          </label>

          <label className="inline-flex items-center gap-2 text-sm mt-2">
            <input
              type="checkbox"
              checked={value.allowVolunteerPickup === true}
              onChange={(e) => patch({ allowVolunteerPickup: e.target.checked })}
            />
            אפשרו למתנדבים לפתוח נקודת איסוף לקהילה שלהם
          </label>
          {value.allowVolunteerPickup === true && (
            <p className="mp-section-note text-sm mt-1">
              לקוחות יוכלו לבחור &quot;איסוף מנקודת מתנדב&quot; רק בקהילות שבהן מתנדב פעיל פתח נקודה.
            </p>
          )}

          {value.allowSelfPickup !== false && (
            <>
              <label className="mp-fulfillment-radio mt-2">
                <input
                  type="radio"
                  name="promoPickupScope"
                  checked={pickupScope === PICKUP_SCOPE_INHERIT}
                  onChange={() => patch({ pickupScope: PICKUP_SCOPE_INHERIT })}
                />
                <span>איסוף עצמי — כמו בהגדרות הבסטה</span>
              </label>
              {pickupScope === PICKUP_SCOPE_INHERIT && storeFulfillment && (
                <p className="mp-section-note text-sm mr-6">
                  {storeFulfillment.pickupScope === PICKUP_SCOPE_ALL
                    ? 'לפי הבסטה: איסוף לכל הקהילות'
                    : `לפי הבסטה: ${(storeFulfillment.pickupCommunities || []).join(', ') || 'לא הוגדרו קהילות'}`}
                </p>
              )}
              <label className="mp-fulfillment-radio">
                <input
                  type="radio"
                  name="promoPickupScope"
                  checked={pickupScope === PICKUP_SCOPE_ALL}
                  onChange={() => patch({ pickupScope: PICKUP_SCOPE_ALL, pickupCommunities: [] })}
                />
                <span>איסוף עצמי לכל הקהילות (בהזמנה זו)</span>
              </label>
              <label className="mp-fulfillment-radio">
                <input
                  type="radio"
                  name="promoPickupScope"
                  checked={pickupScope === PICKUP_SCOPE_SELECTED}
                  onChange={() => patch({ pickupScope: PICKUP_SCOPE_SELECTED })}
                />
                <span>איסוף עצמי לקהילות נבחרות (בהזמנה זו)</span>
              </label>
              {pickupScope === PICKUP_SCOPE_SELECTED && (
                <CommunityChecklist
                  communities={pickupSpots}
                  label="קהילות לאיסוף בהזמנה זו"
                  selected={pickupCommunities}
                  onChange={(list) => patch({ pickupCommunities: list })}
                />
              )}
            </>
          )}
        </section>
      )}

      <section className="mp-fulfillment-block">
        <h4 className="mp-fulfillment-subtitle">משלוח לקהילות</h4>
        <label className="inline-flex items-center gap-2 text-sm mb-2">
          <input
            type="checkbox"
            checked={Boolean(value.deliveryEnabled)}
            onChange={(e) =>
              patch({
                deliveryEnabled: e.target.checked,
                ...(e.target.checked ? {} : { deliveryCommunities: [], deliveryInheritFromStore: false }),
              })
            }
          />
          אנחנו מציעים משלוח
        </label>

        {value.deliveryEnabled && (
          <>
            {!isStore && (
              <label className="inline-flex items-center gap-2 text-sm mb-2 mr-4">
                <input
                  type="checkbox"
                  checked={value.deliveryInheritFromStore !== false}
                  onChange={(e) =>
                    patch({
                      deliveryInheritFromStore: e.target.checked,
                      ...(e.target.checked ? { deliveryCommunities: [] } : {}),
                    })
                  }
                />
                משלוח לקהילות כמו בהגדרות הבסטה
              </label>
            )}
            {!isStore &&
              value.deliveryInheritFromStore !== false &&
              storeFulfillment?.deliveryCommunities?.length > 0 && (
                <p className="mp-section-note text-sm mb-2">
                  לפי הבסטה: {storeFulfillment.deliveryCommunities.join(' · ')}
                </p>
              )}
            {((isStore && value.deliveryEnabled) ||
              (!isStore && value.deliveryEnabled && value.deliveryInheritFromStore === false)) && (
              <CommunityChecklist
                communities={pickupSpots}
                label="קהילות למשלוח"
                hint="רק לקהילות אלו יוצג אפשרות משלוח ללקוחות"
                selected={deliveryCommunities}
                onChange={(list) => patch({ deliveryCommunities: list, deliveryInheritFromStore: false })}
              />
            )}

            {isStore && value.deliveryEnabled && (
              <label className="mp-form-label mt-3">
                מחיר משלוח (₪)
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="mp-input"
                  value={value.deliveryPrice ?? 0}
                  onChange={(e) =>
                    patch({
                      deliveryPrice: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                    })
                  }
                  placeholder="0 = ללא תוספת מחיר"
                />
              </label>
            )}

            {!isStore && value.deliveryEnabled && (
              <div className="mt-3">
                <label className="inline-flex items-center gap-2 text-sm mb-2">
                  <input
                    type="checkbox"
                    checked={value.deliveryPriceInheritFromStore !== false}
                    onChange={(e) =>
                      patch({
                        deliveryPriceInheritFromStore: e.target.checked,
                        ...(e.target.checked ? {} : { deliveryPrice: 0 }),
                      })
                    }
                  />
                  מחיר משלוח כמו בהגדרות הבסטה
                </label>
                {value.deliveryPriceInheritFromStore !== false && storeFulfillment && (
                  <p className="mp-section-note text-sm mb-2">
                    לפי הבסטה: {formatDeliveryPrice(storeFulfillment.deliveryPrice)}
                    {parseFloat(storeFulfillment.deliveryPrice) === 0 ? ' (ללא תוספת)' : ''}
                  </p>
                )}
                {value.deliveryPriceInheritFromStore === false && (
                  <label className="mp-form-label">
                    מחיר משלוח להזמנה זו (₪)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="mp-input"
                      value={value.deliveryPrice ?? 0}
                      onChange={(e) =>
                        patch({
                          deliveryPrice:
                            e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                        })
                      }
                    />
                  </label>
                )}
              </div>
            )}

            <label className="mp-form-label mt-3">
              {isStore ? 'הוראות משלוח' : 'הוראות נוספות לאיסוף/משלוח'}
              <textarea
                className="mp-input"
                rows={2}
                value={
                  (isStore ? value.deliveryInstructions : value.pickupInstructions) || ''
                }
                onChange={(e) =>
                  patch(
                    isStore
                      ? { deliveryInstructions: e.target.value }
                      : { pickupInstructions: e.target.value }
                  )
                }
              />
            </label>
          </>
        )}
      </section>
      {!communitiesLoaded && (
        <p className="mp-section-note text-sm" role="status">טוען קהילות זמינות...</p>
      )}
    </div>
  );
};

export default MarketplaceFulfillmentEditor;
