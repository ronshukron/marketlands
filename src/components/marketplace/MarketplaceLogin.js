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
    <div className="mp-page mp-auth-page" dir="rtl">
      <div className="mp-auth-split">
        <aside className="mp-auth-visual" aria-hidden="true">
          <div className="mp-auth-visual-inner">
            <span className="mp-auth-visual-kicker">שדה ושכונה</span>
            <h2 className="mp-auth-visual-title">מהשדה לשכונה</h2>
            <p className="mp-auth-visual-text">
              שוק קהילתי — הזמנות מהדוכנים, תשלום בשוק, ומעקב במקום אחד.
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
              <h1 className="mp-section-title mp-section-title-chalk">התחברות לשוק</h1>
              <p className="mp-section-note">
                חשבון נפרד מההזמנות השבועיות של האתר — למעקב אחר הזמנות מהדוכנים.
              </p>
            </header>

            <form onSubmit={onSubmit} className="mp-stack mp-stack-form">
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

              {errorMessage && <p className="mp-form-error" role="alert">{errorMessage}</p>}

              <button
                type="submit"
                className="mp-btn mp-btn-wood w-full justify-center"
                disabled={isSigningIn}
              >
                {isSigningIn ? 'מתחברים...' : 'התחברות'}
              </button>
            </form>

            <p className="mp-auth-footer-text">
              אין לכם חשבון בשוק?{' '}
              <Link
                to={MARKETPLACE_REGISTER_PATH}
                state={{ from: redirectTo }}
                className="mp-link mp-link-emphasis"
              >
                הרשמה לשוק הבסטות
              </Link>
            </p>

            <p className="mp-auth-footer-muted">
              בעלי דוכן — התחברו דרך{' '}
              <Link to="/login" state={{ from: '/marketplace/dashboard' }} className="mp-link">
                כניסת עסקים לאתר
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketplaceLogin;
