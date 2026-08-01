import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../contexts/authContext';
import usePickupSpots from '../../hooks/usePickupSpots';
import LoadingSpinner from '../LoadingSpinner';
import { getMarketplacePromotion } from '../../services/marketplaceService';
import { createMarketplacePromotionVolunteer } from '../../services/marketplaceVolunteerService';
import { resolveMarketplaceCommunityName } from '../../utils/marketplaceCommunityIdentity';
import { marketplaceLoginLinkState } from '../../utils/marketplaceRoutes';

const MarketplaceVolunteerPickup = () => {
  const { promotionId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userLoggedIn } = useAuth();
  const { pickupSpots, loaded: communitiesLoaded } = usePickupSpots();
  const [promotion, setPromotion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    community: '',
    address: '',
    locationInstructions: '',
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getMarketplacePromotion(promotionId);
        if (!cancelled) setPromotion(data);
      } catch (error) {
        console.error('Failed to load promotion for volunteering', error);
        if (!cancelled) setPromotion(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [promotionId]);

  useEffect(() => {
    if (!userLoggedIn || !currentUser) return;
    setForm((current) => ({
      ...current,
      fullName: current.fullName || currentUser.displayName || '',
      phone: current.phone || '',
      community:
        current.community ||
        resolveMarketplaceCommunityName(
          localStorage.getItem('selectedPickupSpot') || ''
        ),
    }));
  }, [userLoggedIn, currentUser]);

  const volunteerPath = useMemo(
    () => `/community-marketplace/volunteer/${promotionId}`,
    [promotionId]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!userLoggedIn) {
      navigate('/community-marketplace/login', {
        state: marketplaceLoginLinkState(volunteerPath),
      });
      return;
    }
    if (!promotion?.allowVolunteerPickup) {
      Swal.fire({
        icon: 'info',
        title: 'לא זמין',
        text: 'העסק לא אישר נקודות איסוף של מתנדבים בהזמנה זו.',
      });
      return;
    }

    setSaving(true);
    try {
      await createMarketplacePromotionVolunteer({
        promotion,
        volunteerData: form,
      });
      await Swal.fire({
        icon: 'success',
        title: 'תודה!',
        text: 'נקודת האיסוף נפתחה. לקוחות בקהילה שלכם יוכלו לבחור איסוף מנקודת מתנדב.',
      });
      navigate(`/community-marketplace/order/${promotionId}`);
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'לא ניתן לשמור',
        text: error.message || 'נסו שוב בעוד רגע.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mp-page">
        <LoadingSpinner />
      </div>
    );
  }

  if (!promotion) {
    return (
      <div className="mp-page mp-stack">
        <p className="mp-alert mp-alert-warn">ההזמנה השבועית לא נמצאה.</p>
        <Link to="/community-marketplace" className="mp-btn mp-btn-secondary">
          חזרה לשוק
        </Link>
      </div>
    );
  }

  return (
    <div className="mp-page">
      <div className="mp-container mp-stack" style={{ maxWidth: 640 }}>
        <Link to={`/community-marketplace/order/${promotionId}`} className="mp-link text-sm">
          ← חזרה להזמנה
        </Link>
        <h1 className="mp-page-title">פתיחת נקודת איסוף כמתנדב</h1>
        <p className="mp-section-note">
          להזמנה השבועית של <strong>{promotion.businessName || 'הבסטה'}</strong>
          {promotion.title ? ` — ${promotion.title}` : ''}
        </p>

        {!promotion.allowVolunteerPickup ? (
          <p className="mp-alert mp-alert-warn">
            העסק לא אישר כרגע נקודות איסוף של מתנדבים בהזמנה זו.
          </p>
        ) : (
          <form className="mp-card mp-stack" onSubmit={handleSubmit}>
            {!userLoggedIn && (
              <p className="mp-alert mp-alert-warn text-sm">
                יש להתחבר לחשבון בשוק הבסטות לפני פתיחת נקודת איסוף.{' '}
                <Link
                  to="/community-marketplace/login"
                  state={marketplaceLoginLinkState(volunteerPath)}
                >
                  להתחברות
                </Link>
              </p>
            )}
            <label className="mp-form-label">
              שם מלא *
              <input
                className="mp-input"
                value={form.fullName}
                onChange={(e) => setForm((current) => ({ ...current, fullName: e.target.value }))}
                required
                autoComplete="name"
              />
            </label>
            <label className="mp-form-label">
              טלפון *
              <input
                className="mp-input"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))}
                required
                autoComplete="tel"
              />
            </label>
            <label className="mp-form-label">
              קהילה *
              <select
                className="mp-select"
                value={form.community}
                onChange={(e) => setForm((current) => ({ ...current, community: e.target.value }))}
                required
              >
                <option value="">
                  {communitiesLoaded ? 'בחרו קהילה' : 'טוען קהילות...'}
                </option>
                {pickupSpots.map((spot) => (
                  <option key={spot} value={spot}>
                    {spot}
                  </option>
                ))}
              </select>
            </label>
            <label className="mp-form-label">
              כתובת נקודת האיסוף *
              <input
                className="mp-input"
                value={form.address}
                onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))}
                required
                autoComplete="street-address"
              />
            </label>
            <label className="mp-form-label">
              הוראות הגעה (אופציונלי)
              <textarea
                className="mp-input"
                rows={3}
                value={form.locationInstructions}
                onChange={(e) =>
                  setForm((current) => ({ ...current, locationInstructions: e.target.value }))
                }
                placeholder="קומה, קוד דלת, שעות נוחות..."
              />
            </label>
            <button
              type="submit"
              className="mp-btn mp-btn-primary"
              disabled={saving || !userLoggedIn}
              style={{ minHeight: 44 }}
            >
              {saving ? 'שומרים...' : 'פתיחת נקודת איסוף'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default MarketplaceVolunteerPickup;
