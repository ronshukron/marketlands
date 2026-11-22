import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RecaptchaVerifier, linkWithPhoneNumber } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FiCheckCircle, FiSmartphone } from 'react-icons/fi';
import { auth, db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import { formatIsraeliMobile, toIsraeliMobileE164 } from '../../utils/israeliPhone';

// New customer accounts (signed up with email and password after this was
// introduced) verify their phone by SMS before using the logged-in site.
// Older accounts are never asked, Google sign-ins are not marked, and
// ordering as a guest works as before. Checkout pages stay open so an account
// created mid-checkout can finish the order.

const OPEN_PATHS = [
  '/login',
  '/user-register',
  '/coordinator-register',
  '/business-register',
  '/local-business-register',
  '/marketplace/register',
  '/order-confirmation', // also -delayed, -success, -free
  '/order-summary',
  '/payment-success',
  '/payment-cancel',
  '/payment-instructions',
];

const RESEND_COOLDOWN_SECONDS = 60;
const RECAPTCHA_CONTAINER_ID = 'bb-phone-recaptcha';

export const isVerificationOpenPath = (pathname) => OPEN_PATHS.some((path) => pathname.startsWith(path));

const SMS_ERRORS = {
  'auth/invalid-phone-number': 'מספר הטלפון לא תקין',
  'auth/missing-phone-number': 'יש להזין מספר טלפון',
  'auth/too-many-requests': 'היו יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
  'auth/quota-exceeded': 'לא ניתן לשלוח SMS כרגע. נסו שוב מאוחר יותר.',
  'auth/captcha-check-failed': 'בדיקת האבטחה נכשלה. רעננו את העמוד ונסו שוב.',
  'auth/credential-already-in-use': 'המספר הזה כבר מחובר לחשבון אחר. התחברו לחשבון ההוא, או הזינו מספר אחר.',
  'auth/account-exists-with-different-credential': 'המספר הזה כבר מחובר לחשבון אחר. התחברו לחשבון ההוא, או הזינו מספר אחר.',
  'auth/invalid-verification-code': 'הקוד שגוי. בדקו את ה-SMS ונסו שוב.',
  'auth/code-expired': 'תוקף הקוד פג. שלחו קוד חדש.',
  'auth/operation-not-allowed': 'אימות בטלפון עוד לא הופעל באתר. פנו אלינו.',
};

const describeSmsError = (error) => SMS_ERRORS[error?.code] || 'הפעולה נכשלה. נסו שוב.';

export const PhoneVerificationScreen = () => {
  const { currentUser, completePhoneVerification, signOut } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const verifierRef = useRef(null);
  const confirmationRef = useRef(null);
  const sentToRef = useRef('');

  // Start from the number they gave at signup.
  useEffect(() => {
    let active = true;
    if (!currentUser?.uid) return undefined;
    getDoc(doc(db, 'users', currentUser.uid))
      .then((snap) => {
        const saved = snap.exists() ? String(snap.data()?.phone || '') : '';
        if (active && saved) setPhone((current) => current || saved);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [currentUser?.uid]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => () => {
    if (verifierRef.current) verifierRef.current.clear();
    verifierRef.current = null;
  }, []);

  const resetVerifier = () => {
    if (verifierRef.current) verifierRef.current.clear();
    verifierRef.current = null;
  };

  const sendCode = async (event) => {
    event?.preventDefault();
    const e164 = toIsraeliMobileE164(phone);
    if (!e164) {
      setError('יש להזין מספר נייד ישראלי, למשל 050-1234567');
      return;
    }
    setBusy(true);
    setError('');
    try {
      auth.languageCode = 'he';
      if (!verifierRef.current) {
        verifierRef.current = new RecaptchaVerifier(auth, RECAPTCHA_CONTAINER_ID, { size: 'invisible' });
      }
      confirmationRef.current = await linkWithPhoneNumber(auth.currentUser, e164, verifierRef.current);
      sentToRef.current = e164;
      setCode('');
      setStep('code');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      console.warn('Sending the SMS code failed', err?.code || err);
      if (err?.code === 'auth/provider-already-linked') {
        await completePhoneVerification();
        return;
      }
      resetVerifier();
      setError(describeSmsError(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (event) => {
    event?.preventDefault();
    const clean = code.replace(/\D/g, '');
    if (clean.length !== 6) {
      setError('הקוד הוא 6 ספרות');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await confirmationRef.current.confirm(clean);
      try {
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          phone: formatIsraeliMobile(sentToRef.current).replace('-', ''),
          phoneVerifiedAt: new Date(),
        }, { merge: true });
      } catch (profileError) {
        console.warn('Could not save the verified phone on the profile', profileError);
      }
      await completePhoneVerification();
    } catch (err) {
      console.warn('Confirming the SMS code failed', err?.code || err);
      setError(describeSmsError(err));
    } finally {
      setBusy(false);
    }
  };

  const continueAsGuest = async () => {
    try {
      await signOut();
    } finally {
      navigate('/');
    }
  };

  const inputClass = 'mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-lg tracking-wide focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const primaryClass = 'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 text-base font-bold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:bg-emerald-600';

  return (
    <div className="mx-auto max-w-md px-4 py-10" dir="rtl">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <FiSmartphone className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-black text-gray-900">אימות מספר הטלפון</h1>

        {step === 'phone' ? (
          <form onSubmit={sendCode} noValidate>
            <p className="mt-2 text-sm text-gray-600">נשלח לכם קוד ב-SMS כדי לסיים את פתיחת החשבון.</p>
            <label className="mt-4 block text-right text-sm font-medium text-gray-700">
              מספר נייד
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="050-1234567"
                className={inputClass}
              />
            </label>
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            <button type="submit" disabled={busy} className={primaryClass}>
              {busy ? 'שולחים…' : 'שלחו לי קוד'}
            </button>
          </form>
        ) : (
          <form onSubmit={confirmCode} noValidate>
            <p className="mt-2 text-sm text-gray-600">
              שלחנו קוד בן 6 ספרות אל
              <span className="mt-1 block font-semibold text-gray-900" dir="ltr">{formatIsraeliMobile(sentToRef.current)}</span>
            </p>
            <label className="mt-4 block text-right text-sm font-medium text-gray-700">
              הקוד מה-SMS
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className={`${inputClass} text-2xl tracking-[0.5em]`}
                autoFocus
              />
            </label>
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            <button type="submit" disabled={busy} className={primaryClass}>
              <FiCheckCircle className="h-5 w-5" aria-hidden="true" />
              {busy ? 'בודקים…' : 'אישור'}
            </button>
            <div className="mt-3 flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => { setStep('phone'); setError(''); }}
                className="text-gray-600 underline hover:text-gray-900"
              >
                שינוי מספר
              </button>
              <button
                type="button"
                onClick={sendCode}
                disabled={busy || cooldown > 0}
                className="font-semibold text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
              >
                {cooldown > 0 ? `שליחה חוזרת בעוד ${cooldown}` : 'שליחת קוד חדש'}
              </button>
            </div>
          </form>
        )}

        <div id={RECAPTCHA_CONTAINER_ID} />
        <button
          type="button"
          onClick={continueAsGuest}
          className="mt-6 text-sm text-gray-600 underline hover:text-gray-900"
        >
          התנתקות והזמנה כאורח
        </button>
      </div>
    </div>
  );
};

const AccountVerificationGate = ({ children }) => {
  const { currentUser, verificationRequired } = useAuth() || {};
  const { pathname } = useLocation();
  const blocked = Boolean(
    currentUser && verificationRequired && !currentUser.phoneNumber && !isVerificationOpenPath(pathname),
  );
  return blocked ? <PhoneVerificationScreen /> : children;
};

export default AccountVerificationGate;
