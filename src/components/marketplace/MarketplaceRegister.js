import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import { usePickupSpot } from '../../contexts/PickupSpotContext';
import { registerMarketplaceCustomer } from '../../services/marketplaceUserService';
import {
  MARKETPLACE_LOGIN_PATH,
  resolveMarketplaceAuthRedirect,
} from '../../utils/marketplaceRoutes';
import { pickupSpots } from '../../data/pickupSpots';
import './marketplace.css';

const MarketplaceRegister = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userLoggedIn } = useAuth();
  const { selectedPickupSpot } = usePickupSpot();
  const redirectTo = resolveMarketplaceAuthRedirect(
    location.state?.from,
    '/community-marketplace/my-orders'
  );

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [community, setCommunity] = useState(selectedPickupSpot || '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (userLoggedIn) {
      navigate(redirectTo, { replace: true });
    }
  }, [userLoggedIn, navigate, redirectTo]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setErrorMessage('');
    try {
      await registerMarketplaceCustomer({
        email,
        password,
        name,
        phone,
        community,
        source: 'marketplace_register',
      });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      console.error('Marketplace register failed', error);
      setErrorMessage(error.message || 'ההרשמה נכשלה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mp-page py-12" dir="rtl">
      <div className="mp-main" style={{ maxWidth: '28rem' }}>
        <div className="mp-panel mp-stack">
          <Link to="/community-marketplace" className="mp-link text-sm">
            ← חזרה לשוק הבסטות
          </Link>

          <div>
            <p className="mp-eyebrow" style={{ color: '#6b5a45' }}>
              שוק הבסטות
            </p>
            <h1 className="mp-section-title">הרשמה לשוק הבסטות</h1>
            <p className="mp-section-note mt-2">
              חשבון חדש לעקוב אחר הזמנות מבסטות בשוק — נפרד מההזמנות השבועיות של האתר.
            </p>
          </div>

          <form onSubmit={onSubmit} className="mp-stack" style={{ gap: '1rem' }}>
            <label className="mp-form-label">
              שם מלא *
              <input
                className="mp-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>

            <label className="mp-form-label">
              אימייל *
              <input
                type="email"
                className="mp-input"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="mp-form-label">
              טלפון
              <input
                type="tel"
                className="mp-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>

            <label className="mp-form-label">
              קהילה
              <select
                className="mp-input"
                value={community}
                onChange={(e) => setCommunity(e.target.value)}
              >
                <option value="">בחרו קהילה</option>
                {pickupSpots.map((spot) => (
                  <option key={spot} value={spot}>
                    {spot}
                  </option>
                ))}
              </select>
            </label>

            <label className="mp-form-label">
              סיסמה (לפחות 6 תווים) *
              <input
                type="password"
                className="mp-input"
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            {errorMessage && <p className="text-sm text-red-700 font-medium">{errorMessage}</p>}

            <button
              type="submit"
              className="mp-btn mp-btn-wood w-full justify-center"
              disabled={submitting}
              style={{ opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? 'יוצרים חשבון...' : 'יצירת חשבון'}
            </button>
          </form>

          <p className="text-sm text-gray-700">
            כבר יש חשבון?{' '}
            <Link
              to={MARKETPLACE_LOGIN_PATH}
              state={{ from: redirectTo }}
              className="mp-link font-semibold"
            >
              התחברות
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default MarketplaceRegister;
