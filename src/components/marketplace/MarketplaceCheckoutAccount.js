import React from 'react';
import { Link } from 'react-router-dom';
import {
  MARKETPLACE_LOGIN_PATH,
  MARKETPLACE_REGISTER_PATH,
  marketplaceLoginLinkState,
} from '../../utils/marketplaceRoutes';
import './marketplace.css';

const MarketplaceCheckoutAccount = ({
  userLoggedIn,
  currentUserEmail,
  createAccount,
  onCreateAccountChange,
  password,
  onPasswordChange,
  loginRedirectPath = '/community-marketplace/checkout',
}) => {
  if (userLoggedIn) {
    return (
      <div className="mp-checkout-account-ticket is-logged-in">
        <p className="mp-checkout-account-title">מחוברים לשוק</p>
        <p className="mp-section-note text-sm mt-1">
          ההזמנה תישויך לחשבון: <strong>{currentUserEmail}</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="mp-checkout-account-ticket">
      <h3 className="mp-checkout-account-title">חשבון בשוק הבסטות</h3>
      <p className="mp-section-note text-sm mt-1">
        כדי לשלוח הזמנה יש ליצור חשבון (או להתחבר). ההזמנה תישויך לאימייל שתזינו.
      </p>

      <label className="mp-checkout-confirm-label mt-3">
        <input
          type="checkbox"
          checked={createAccount}
          onChange={(e) => onCreateAccountChange(e.target.checked)}
          required
        />
        <span>
          צרו לי חשבון בשוק ושלחו את ההזמנה <span className="text-red-700">*</span>
        </span>
      </label>

      {!createAccount && (
        <p className="mp-checkout-account-warn">
          יש לסמן את האפשרות למעלה כדי להמשיך, או{' '}
          <Link
            to={MARKETPLACE_LOGIN_PATH}
            state={marketplaceLoginLinkState(loginRedirectPath)}
            className="mp-link font-semibold"
          >
            להתחבר
          </Link>{' '}
          לחשבון קיים.
        </p>
      )}

      {createAccount && (
        <input
          type="password"
          className="mp-input mt-3"
          placeholder="סיסמה (לפחות 6 תווים) *"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          required
        />
      )}

      <p className="mp-auth-footer-text mt-3">
        כבר יש חשבון?{' '}
        <Link
          to={MARKETPLACE_LOGIN_PATH}
          state={marketplaceLoginLinkState(loginRedirectPath)}
          className="mp-link font-semibold"
        >
          התחברות לשוק
        </Link>
        {!createAccount && (
          <>
            {' '}
            ·{' '}
            <Link
              to={MARKETPLACE_REGISTER_PATH}
              state={marketplaceLoginLinkState(loginRedirectPath)}
              className="mp-link font-semibold"
            >
              הרשמה
            </Link>
          </>
        )}
      </p>
    </div>
  );
};

export default MarketplaceCheckoutAccount;
