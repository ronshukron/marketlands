import React, { useEffect, useRef, useState } from 'react';
import { FiCheck, FiCreditCard, FiLock, FiShield } from 'react-icons/fi';

// Progress shown while a card is being saved with Grow: before the redirect to
// Grow's hosted page ("preparing" -> "redirecting") and after coming back
// ("confirming"). Every step shown matches something that is really happening.

const FALLBACK_LINK_DELAY_MS = 8000;

const STEP_LABELS = {
  signup: ['מכינים את ההרשמה לסל השבועי', 'פותחים חיבור מאובטח לחברת הסליקה Grow', 'הזנת פרטי הכרטיס בעמוד המאובטח'],
  replace: ['מכינים את החלפת הכרטיס', 'פותחים חיבור מאובטח לחברת הסליקה Grow', 'הזנת פרטי הכרטיס בעמוד המאובטח'],
  confirm: ['פרטי הכרטיס הוזנו בעמוד המאובטח', 'מאמתים את שמירת הכרטיס מול Grow', 'משלימים את ההרשמה לסל השבועי'],
  confirmReplace: ['פרטי הכרטיס הוזנו בעמוד המאובטח', 'מאמתים את שמירת הכרטיס מול Grow', 'מעדכנים את הכרטיס השמור'],
};

const labelsKey = (step, purpose) => {
  if (step === 'confirming') return purpose === 'replace' ? 'confirmReplace' : 'confirm';
  return purpose === 'replace' ? 'replace' : 'signup';
};

const TITLES = {
  preparing: 'מכינים עמוד מאובטח לשמירת הכרטיס',
  redirecting: 'מעבירים אותך לעמוד המאובטח של Grow',
  confirming: 'מאמתים את שמירת הכרטיס',
};

const SUBTITLES = {
  preparing: 'פרטי הכרטיס מוזנים ישירות אצל Grow, חברת הסליקה. הם לא עוברים דרך בסטה בסקט ולא נשמרים אצלנו.',
  redirecting: 'פרטי הכרטיס מוזנים ישירות אצל Grow, חברת הסליקה. הם לא עוברים דרך בסטה בסקט ולא נשמרים אצלנו.',
  confirming: 'זה לוקח בדרך כלל כמה שניות. אין צורך לרענן את העמוד.',
};

const activeIndexFor = (step) => {
  if (step === 'preparing') return 0;
  return 1;
};

// Only movement is animated, never opacity: if the browser pauses animations
// (background tab, low-power mode) the screen must still be fully visible.
const ANIMATION_CSS = `
@keyframes secureCardBar { 0% { transform: translateX(100%); } 100% { transform: translateX(-250%); } }
@keyframes secureCardRise { from { transform: translateY(8px); } to { transform: none; } }
.secure-card-bar { animation: secureCardBar 1.4s ease-in-out infinite; }
.secure-card-rise { animation: secureCardRise 0.25s ease-out; }
@media (prefers-reduced-motion: reduce) {
  .secure-card-bar, .secure-card-rise { animation: none; }
}
`;

function StepIndicator({ state, number }) {
  if (state === 'done') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <FiCheck className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-emerald-100" />
        <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-600 motion-safe:animate-spin" />
        <span className="h-2 w-2 rounded-full bg-emerald-600" />
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-gray-200 text-xs font-semibold text-gray-400">
      {number}
    </span>
  );
}

function SecureCardPanel({ step, purpose, fallbackUrl }) {
  const [showFallback, setShowFallback] = useState(false);
  const labels = STEP_LABELS[labelsKey(step, purpose)];
  const activeIndex = activeIndexFor(step);

  useEffect(() => {
    setShowFallback(false);
    if (step !== 'redirecting' || !fallbackUrl) return undefined;
    const timer = setTimeout(() => setShowFallback(true), FALLBACK_LINK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [step, fallbackUrl]);

  return (
    <div
      className="secure-card-rise w-full max-w-md overflow-hidden rounded-2xl bg-white text-right shadow-2xl ring-1 ring-black/5"
      role="status"
      aria-live="polite"
      aria-busy="true"
      dir="rtl"
    >
      <div className="relative h-1 overflow-hidden bg-emerald-50" aria-hidden="true">
        <div className="secure-card-bar absolute inset-y-0 right-0 w-2/5 rounded-full bg-gradient-to-l from-emerald-400 to-emerald-600" />
      </div>

      <div className="px-6 pb-6 pt-7 sm:px-8">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
          <FiShield className="h-8 w-8 text-emerald-600" aria-hidden="true" />
        </div>

        <h2 className="text-center text-xl font-bold text-gray-900">{TITLES[step]}</h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-gray-600">{SUBTITLES[step]}</p>

        <ol className="mt-6 space-y-3">
          {labels.map((label, index) => {
            let state = 'pending';
            if (index < activeIndex) state = 'done';
            else if (index === activeIndex) state = 'active';
            return (
              <li key={label} className="flex items-center gap-3">
                <StepIndicator state={state} number={index + 1} />
                <span
                  className={`text-sm ${
                    state === 'active' ? 'font-semibold text-gray-900' : state === 'done' ? 'text-gray-700' : 'text-gray-400'
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        {showFallback && (
          <p className="mt-5 rounded-lg bg-gray-50 p-3 text-center text-sm text-gray-700">
            לא הועברתם אוטומטית?{' '}
            <a href={fallbackUrl} className="font-semibold text-emerald-700 underline">
              המשך לעמוד המאובטח
            </a>
          </p>
        )}

        <p className="mt-5 text-center text-xs text-gray-500">נא לא לסגור את החלון</p>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3 text-[11px] text-gray-600 sm:text-xs">
        <span className="flex flex-col items-center gap-1 text-center">
          <FiLock className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          חיבור מוצפן
        </span>
        <span className="flex flex-col items-center gap-1 text-center">
          <FiShield className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          הכרטיס נשמר אצל Grow
        </span>
        <span className="flex flex-col items-center gap-1 text-center">
          <FiCreditCard className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          לא מחייבים עכשיו
        </span>
      </div>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {''|'preparing'|'redirecting'|'confirming'} props.step nothing is shown when empty
 * @param {'signup'|'replace'} [props.purpose]
 * @param {'overlay'|'inline'} [props.variant] overlay covers the page; inline sits in the layout
 * @param {string} [props.fallbackUrl] Grow's page, offered as a link if the redirect stalls
 */
export default function SecureCardProgress({ step, purpose = 'signup', variant = 'overlay', fallbackUrl = '' }) {
  const isOverlay = variant === 'overlay';

  useEffect(() => {
    if (!step || !isOverlay) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [step, isOverlay]);

  if (!step || !TITLES[step]) return null;

  const panel = <SecureCardPanel step={step} purpose={purpose} fallbackUrl={fallbackUrl} />;
  return (
    <>
      <style>{ANIMATION_CSS}</style>
      {isOverlay ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          {panel}
        </div>
      ) : (
        <div className="flex justify-center py-6">{panel}</div>
      )}
    </>
  );
}

/**
 * Pressing Back on Grow's page can restore this page from the browser's
 * back-forward cache with the overlay still up. Clear it when that happens.
 * @param {Function} reset
 */
export function useResetOnPageRestore(reset) {
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    const onPageShow = (event) => {
      if (event.persisted) resetRef.current();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);
}
