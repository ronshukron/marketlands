import React, { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import {
  doCreateUserWithEmailAndPassword,
  doSignInWithEmailAndPassword,
  doSignInWithGoogle,
} from '../firebase/auth';
import { db } from '../firebase/firebase';
import { buildCheckoutAccountProfile } from '../utils/checkoutAccountUtils';

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
  const [mode, setMode] = useState('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('create');
    setEmail(prefill?.email || '');
    setPassword('');
    setError('');
  }, [open, prefill?.email]);

  if (!open) return null;

  const submitEmail = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      let credential;
      if (mode === 'create') {
        credential = await doCreateUserWithEmailAndPassword(
          email.trim(),
          password,
          buildCheckoutAccountProfile({ ...prefill, email }),
          'users',
        );
      } else {
        credential = await doSignInWithEmailAndPassword(email.trim(), password);
      }
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
      const profile = buildCheckoutAccountProfile({ ...prefill, email: credential.user.email || prefill?.email });
      try {
        await setDoc(doc(db, 'users', credential.user.uid), {
          ...(profile.name ? { name: profile.name } : {}),
          ...(profile.phone ? { phone: profile.phone } : {}),
          ...(profile.community ? { community: profile.community } : {}),
        }, { merge: true });
      } catch (profileError) {
        console.warn('Could not merge checkout profile after Google sign-in', profileError);
      }
      onAuthenticated(credential.user.uid);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir="rtl">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-account-title"
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="checkout-account-title" className="text-xl font-bold text-gray-900">
              שמירת ההזמנה בחשבון
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              הפרטים כבר מולאו. כך תוכלו לראות את ההזמנה ולעקוב אחריה גם בהמשך.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-xl text-gray-500 hover:bg-gray-100"
            aria-label="סגירת החלון"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => { setMode('create'); setError(''); }}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === 'create' ? 'bg-white text-blue-700 shadow' : 'text-gray-600'}`}
          >
            יצירת חשבון
          </button>
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(''); }}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === 'signin' ? 'bg-white text-blue-700 shadow' : 'text-gray-600'}`}
          >
            יש לי חשבון
          </button>
        </div>

        <form onSubmit={submitEmail} className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            אימייל
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-left"
              dir="ltr"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            סיסמה
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-left"
              dir="ltr"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="min-h-[44px] w-full rounded-lg bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'רגע...' : mode === 'create' ? 'יצירת חשבון והמשך לתשלום' : 'התחברות והמשך לתשלום'}
          </button>
        </form>

        <button
          type="button"
          onClick={submitGoogle}
          disabled={submitting}
          className="mt-3 min-h-[44px] w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          המשך עם Google
        </button>
        <button
          type="button"
          onClick={onContinueAsGuest}
          disabled={submitting}
          className="mt-3 min-h-[44px] w-full px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          המשך כאורח ללא יצירת חשבון
        </button>
      </div>
    </div>
  );
};

export default CheckoutAccountModal;
