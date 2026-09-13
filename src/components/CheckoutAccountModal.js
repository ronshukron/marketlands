import React, { useEffect, useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import {
  doCreateUserWithEmailAndPassword,
  doSignInWithEmailAndPassword,
  doSignInWithGoogle,
} from '../firebase/auth';
import { db } from '../firebase/firebase';
import usePickupSpots from '../hooks/usePickupSpots';
import { buildCheckoutAccountProfile } from '../utils/checkoutAccountUtils';
import {
  validateCustomerEmail,
  validateCustomerName,
  validateCustomerPhone,
} from '../utils/marketplaceCustomerValidation';

const inputClass =
  'mt-1 min-h-[44px] w-full rounded-md border border-gray-300 px-3 py-2.5 text-base text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50';

const authErrorMessage = (error) => {
  switch (error?.code) {
    case 'auth/email-already-in-use':
      return 'כבר קיים חשבון עם כתובת האימייל הזו. עברנו להתחברות — הזינו את הסיסמה.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'האימייל או הסיסמה אינם נכונים.';
    case 'auth/weak-password':
      return 'יש לבחור סיסמה באורך 6 תווים לפחות.';
    case 'auth/popup-closed-by-user':
      return 'חלון ההתחברות נסגר לפני השלמת התהליך.';
    default:
      return error?.message || 'לא הצלחנו להשלים את ההתחברות. נסו שוב.';
  }
};

const CheckoutAccountModal = ({
  open,
  prefill,
  onAuthenticated,
  onContinueAsGuest,
  onCancel,
}) => {
  const { pickupSpots = [], loaded: communitiesLoaded } = usePickupSpots();
  const [mode, setMode] = useState('create');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [community, setCommunity] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('create');
    setName(prefill?.name || '');
    setPhone(prefill?.phone || '');
    setCommunity(prefill?.community || '');
    setEmail(prefill?.email || '');
    setPassword('');
    setError('');
  }, [open, prefill?.community, prefill?.email, prefill?.name, prefill?.phone]);

  const communityOptions = useMemo(() => {
    const options = pickupSpots.filter((spot) => spot && spot !== 'הכל');
    if (community && !options.includes(community)) {
      return [community, ...options];
    }
    return options;
  }, [community, pickupSpots]);

  if (!open) return null;

  const currentProfile = () => buildCheckoutAccountProfile({
    email,
    name,
    phone,
    community,
  });

  const validateCreateDetails = () => {
    const nameResult = validateCustomerName(name);
    if (!nameResult.valid) return nameResult.message;
    const phoneResult = validateCustomerPhone(phone);
    if (!phoneResult.valid) return phoneResult.message;
    if (!String(community || '').trim()) return 'יש לבחור קהילה';
    const emailResult = validateCustomerEmail(email);
    if (!emailResult.valid) return emailResult.message;
    if (String(password).length < 6) return 'יש לבחור סיסמה באורך 6 תווים לפחות.';
    return '';
  };

  const submitEmail = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (mode === 'create') {
        const detailsError = validateCreateDetails();
        if (detailsError) {
          setError(detailsError);
          return;
        }
        const credential = await doCreateUserWithEmailAndPassword(
          email.trim(),
          password,
          currentProfile(),
          'users',
        );
        onAuthenticated(credential.user.uid, currentProfile());
        return;
      }
      const credential = await doSignInWithEmailAndPassword(email.trim(), password);
      onAuthenticated(credential.user.uid);
    } catch (err) {
      if (err?.code === 'auth/email-already-in-use') setMode('signin');
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitGoogle = async () => {
    setSubmitting(true);
    setError('');
    try {
      const credential = await doSignInWithGoogle();
      const profile = buildCheckoutAccountProfile({
        ...currentProfile(),
        email: credential.user.email || email,
        name: name || credential.user.displayName || '',
      });
      try {
        await setDoc(doc(db, 'users', credential.user.uid), {
          ...(profile.name ? { name: profile.name } : {}),
          ...(profile.phone ? { phone: profile.phone } : {}),
          ...(profile.community ? { community: profile.community } : {}),
        }, { merge: true });
      } catch (profileError) {
        console.warn('Could not merge checkout profile after Google sign-in', profileError);
      }
      onAuthenticated(credential.user.uid, profile);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const isCreate = mode === 'create';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      dir="rtl"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-account-title"
        className="flex max-h-[100dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-xl"
      >
        <div className="relative shrink-0 border-b border-gray-100 px-4 pb-2 pt-3 sm:px-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="absolute left-1.5 top-1.5 inline-flex h-12 w-12 items-center justify-center rounded-full text-gray-900 hover:bg-gray-100"
            aria-label="סגירת החלון"
          >
            <svg viewBox="0 0 24 24" className="h-9 w-9" aria-hidden="true">
              <path
                d="M4 4l16 16M20 4L4 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="pl-12">
            <p className="text-right text-xs font-bold text-blue-700">
              {isCreate ? 'הרשמה לחשבון חדש' : 'התחברות לחשבון קיים'}
            </p>
            <h2 id="checkout-account-title" className="mt-0.5 !text-right text-lg font-bold text-gray-900">
              {isCreate ? 'יצירת חשבון חדש' : 'ברוכים השבים'}
            </h2>
            <p className="mt-1 text-right text-sm leading-5 text-gray-600">
              {isCreate
                ? 'זה לא התחברות — נפתח לכם חשבון חדש עם השם, הטלפון והקהילה, כדי שתוכלו לעקוב אחרי ההזמנה.'
                : 'הזינו אימייל וסיסמה של החשבון הקיים כדי להמשיך לתשלום.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onContinueAsGuest}
            disabled={submitting}
            className="mt-2 min-h-[44px] w-full rounded-lg bg-gray-50 px-3 text-sm font-semibold text-gray-800 hover:bg-gray-100"
          >
            לא עכשיו — המשך כאורח
          </button>

          <div className="mt-2 grid grid-cols-2 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => { setMode('create'); setError(''); }}
              className={`min-h-[40px] rounded-md px-3 py-2 text-sm font-semibold ${isCreate ? 'bg-white text-blue-700 shadow' : 'text-gray-600'}`}
            >
              יצירת חשבון
            </button>
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(''); }}
              className={`min-h-[40px] rounded-md px-3 py-2 text-sm font-semibold ${!isCreate ? 'bg-white text-blue-700 shadow' : 'text-gray-600'}`}
            >
              יש לי חשבון
            </button>
          </div>
        </div>

        <form onSubmit={submitEmail} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-5">
            {isCreate && (
              <>
                <label className="block text-sm font-medium text-gray-700">
                  שם מלא
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  מספר טלפון
                  <input
                    type="tel"
                    required
                    autoComplete="tel"
                    inputMode="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className={`${inputClass} text-left`}
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  קהילה
                  <select
                    required
                    value={community}
                    onChange={(event) => setCommunity(event.target.value)}
                    className={inputClass}
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
              </>
            )}

            <label className="block text-sm font-medium text-gray-700">
              אימייל {isCreate ? 'לחיבור לחשבון' : ''}
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`${inputClass} text-left`}
                dir="ltr"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              {isCreate ? 'בחירת סיסמה לחשבון החדש' : 'סיסמה'}
              <input
                type="password"
                required
                minLength={6}
                autoComplete={isCreate ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${inputClass} text-left`}
                dir="ltr"
              />
              {isCreate && (
                <span className="mt-1 block text-xs text-gray-500">
                  לפחות 6 תווים. זו סיסמה חדשה — לא סיסמה של חשבון קיים.
                </span>
              )}
            </label>
            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-100 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] w-full rounded-lg bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'רגע...' : isCreate ? 'יצירת חשבון והמשך לתשלום' : 'התחברות והמשך לתשלום'}
            </button>
            <button
              type="button"
              onClick={submitGoogle}
              disabled={submitting}
              className="mt-2 min-h-[44px] w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              {isCreate ? 'הרשמה עם Google' : 'התחברות עם Google'}
            </button>
            <button
              type="button"
              onClick={onContinueAsGuest}
              disabled={submitting}
              className="mt-1 min-h-[40px] w-full px-4 py-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900"
            >
              המשך כאורח ללא יצירת חשבון
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CheckoutAccountModal;
