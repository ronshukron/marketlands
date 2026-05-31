import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import { signInMarketplaceCustomer } from '../../services/marketplaceUserService';
import {
  MARKETPLACE_REGISTER_PATH,
  resolveMarketplaceAuthRedirect,
} from '../../utils/marketplaceRoutes';
import './marketplace.css';

const MarketplaceLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userLoggedIn } = useAuth();
  const redirectTo = resolveMarketplaceAuthRedirect(
    location.state?.from,
    '/community-marketplace/my-orders'
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (userLoggedIn) {
      navigate(redirectTo, { replace: true });
    }
  }, [userLoggedIn, navigate, redirectTo]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (isSigningIn) return;

    setIsSigningIn(true);
    setErrorMessage('');
    try {
      await signInMarketplaceCustomer({ email, password });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      console.error('Marketplace login failed', error);
      setErrorMessage(error.message || 'ההתחברות נכשלה');
    } finally {
      setIsSigningIn(false);
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
            <h1 className="mp-section-title">התחברות לחשבון בשוק</h1>
            <p className="mp-section-note mt-2">
              חשבון נפרד מההזמנות השבועיות של האתר — משמש למעקב אחר הזמנות מבסטות בשוק.
            </p>
          </div>

          <form onSubmit={onSubmit} className="mp-stack" style={{ gap: '1rem' }}>
            <label className="mp-form-label">
              אימייל
              <input
                type="email"
                className="mp-input"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label className="mp-form-label">
              סיסמה
              <input
                type="password"
                className="mp-input"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {errorMessage && <p className="text-sm text-red-700 font-medium">{errorMessage}</p>}

            <button
              type="submit"
              className="mp-btn mp-btn-wood w-full justify-center"
              disabled={isSigningIn}
              style={{ opacity: isSigningIn ? 0.7 : 1 }}
            >
              {isSigningIn ? 'מתחברים...' : 'התחברות'}
            </button>
          </form>

          <p className="text-sm text-gray-700">
            אין לכם חשבון בשוק?{' '}
            <Link
              to={MARKETPLACE_REGISTER_PATH}
              state={{ from: redirectTo }}
              className="mp-link font-semibold"
            >
              הרשמה לשוק הבסטות
            </Link>
          </p>

          <p className="text-xs text-gray-500 border-t border-gray-200 pt-3">
            בעלי בסטה או עסקים — התחברו דרך{' '}
            <Link to="/login" state={{ from: '/marketplace/dashboard' }} className="mp-link">
              כניסת עסקים לאתר
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export default MarketplaceLogin;
