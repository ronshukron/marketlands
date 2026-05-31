import React from 'react';
import { Link } from 'react-router-dom';
import {
  MARKETPLACE_LOGIN_PATH,
  MARKETPLACE_REGISTER_PATH,
  marketplaceLoginLinkState,
} from '../../utils/marketplaceRoutes';

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
      <div className="mp-panel mp-checkout-account-box">
        <p className="text-sm font-semibold text-green-900">מחוברים כמשתמש</p>
        <p className="text-sm text-gray-600 mt-1">
          ההזמנה תישויך לחשבון: <strong>{currentUserEmail}</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="mp-panel mp-checkout-account-box">
      <h3 className="mp-section-title text-base">חשבון לשוק הבסטות</h3>
      <p className="mp-section-note text-sm mt-1">
        כדי לשלוח הזמנה יש ליצור חשבון בשוק (או להתחבר). ההזמנה תישויך לאימייל שתזינו.
      </p>

      <label className="mp-checkout-confirm-label mt-3">
        <input
          type="checkbox"
          checked={createAccount}
          onChange={(e) => onCreateAccountChange(e.target.checked)}
          required
        />
        <span>
          צרו לי חשבון בשוק הבסטות ושלחו את ההזמנה <span className="text-red-700">*</span>
        </span>
      </label>

      {!createAccount && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
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

      <p className="text-sm mt-3">
        כבר יש חשבון בשוק?{' '}
        <Link
          to={MARKETPLACE_LOGIN_PATH}
          state={marketplaceLoginLinkState(loginRedirectPath)}
          className="mp-link font-semibold"
        >
          התחברות לשוק הבסטות
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
