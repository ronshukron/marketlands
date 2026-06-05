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
    <div className="mp-page mp-auth-page" dir="rtl">
      <div className="mp-auth-split">
        <aside className="mp-auth-visual" aria-hidden="true">
          <div className="mp-auth-visual-inner">
            <span className="mp-auth-visual-kicker">שדה ושכונה</span>
            <h2 className="mp-auth-visual-title">הצטרפו לשכונה</h2>
            <p className="mp-auth-visual-text">
              פתחו חשבון בשוק — הזמינו מהשבוע, עקבו אחר כרטיסי ההזמנה, ושלמו ישירות לדוכן.
            </p>
          </div>
        </aside>

        <div className="mp-auth-form-panel">
          <div className="mp-auth-form-inner">
            <Link to="/community-marketplace" className="mp-link mp-auth-back">
              ← חזרה לשוק הבסטות
            </Link>

            <header className="mp-auth-form-header">
              <span className="mp-weekly-board-label">שוק הבסטות</span>
              <h1 className="mp-section-title mp-section-title-chalk">הרשמה לשוק</h1>
              <p className="mp-section-note">
                חשבון חדש לעקוב אחר הזמנות מהדוכנים — נפרד מההזמנות השבועיות של האתר.
              </p>
            </header>

            <form onSubmit={onSubmit} className="mp-stack mp-stack-form">
              <label className="mp-form-label">
                שם מלא *
                <input
                  className="mp-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
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
                  autoComplete="tel"
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

              {errorMessage && <p className="mp-form-error" role="alert">{errorMessage}</p>}

              <button
                type="submit"
                className="mp-btn mp-btn-wood w-full justify-center"
                disabled={submitting}
              >
                {submitting ? 'יוצרים חשבון...' : 'יצירת חשבון'}
              </button>
            </form>

            <p className="mp-auth-footer-text">
              כבר יש חשבון?{' '}
              <Link
                to={MARKETPLACE_LOGIN_PATH}
                state={{ from: redirectTo }}
                className="mp-link mp-link-emphasis"
              >
                התחברות
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketplaceRegister;
