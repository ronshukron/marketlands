import React, { useEffect, useRef, useState } from 'react';
import { confirmCommunityUnlock } from '../../services/communityWeeklyPromotionService';
import usePickupSpots from '../../hooks/usePickupSpots';
import { resolveCommunityByCode, resolveCommunityName } from '../../services/pickupSpotsService';
import {
  buildCommunityStoreUrlForCode,
  buildCommunityWeeklyPromotionShareMessage,
} from '../../utils/communityWeeklyPromotionShareMessage';

const copyText = async (value) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand?.('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('copy-unavailable');
};

const CommunityWeeklyPromotionUnlockModal = ({
  open,
  promotion,
  communityCode,
  communityName = '',
  onClose,
  onUnlocked,
}) => {
  const { pickupSpotsData = {} } = usePickupSpots();
  const [step, setStep] = useState('share');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const operationRef = useRef(0);
  const loadingRef = useRef(false);
  loadingRef.current = loading;

  useEffect(() => {
    if (!open) {
      operationRef.current += 1;
      setStep('share');
      setLoading(false);
      setError('');
      setCopyStatus('');
      return undefined;
    }

    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !loadingRef.current) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = [...dialogRef.current.querySelectorAll(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [onClose, open]);

  if (!open || !promotion?.id || !communityCode) return null;

  const resolvedCommunityName = resolveCommunityName(communityName)
    || resolveCommunityByCode(communityCode)
    || communityName
    || '';
  const communityData = pickupSpotsData[resolvedCommunityName] || {};
  const customStoreLink = String(communityData.storeLink || '').trim();
  const storeUrl = customStoreLink || buildCommunityStoreUrlForCode({
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    communityCode,
    communityName: resolvedCommunityName,
  });
  const shareText = buildCommunityWeeklyPromotionShareMessage({
    promotion,
    communityName: resolvedCommunityName,
    communityCode,
    storeUrl,
    whatsappGroupLink: communityData.whatsappGroupLink,
  });

  const confirmShare = async () => {
    const operation = ++operationRef.current;
    setLoading(true);
    setError('');
    try {
      await confirmCommunityUnlock({
        promotionId: promotion.id,
        communityCode,
        promotion,
      });
      if (operation === operationRef.current) await onUnlocked();
    } catch {
      if (operation === operationRef.current) {
        setError('לא הצלחנו לפתוח את המחיר כרגע. נסו שוב.');
      }
    } finally {
      if (operation === operationRef.current) setLoading(false);
    }
  };

  const copyShareMessage = async () => {
    setCopyStatus('');
    setError('');
    try {
      await copyText(shareText);
      setStep('confirm');
      setCopyStatus('ההודעה הועתקה!');
    } catch {
      setError('לא הצלחנו להעתיק. אפשר לסמן את ההודעה ולהעתיק אותה ידנית.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
      dir="rtl"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-promotion-unlock-title"
        aria-describedby="community-promotion-unlock-description"
        className="font-hebrew max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue-700">המבצע השבועי של הקהילה</p>
            <h2
              id="community-promotion-unlock-title"
              className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl"
            >
              פותחים יחד מחיר קהילתי
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="סגירת החלון"
            disabled={loading}
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-2xl text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <p
          id="community-promotion-unlock-description"
          className="mt-4 text-base leading-7 text-slate-700"
        >
          העתיקו את ההודעה, שתפו אותה בקבוצת הוואטסאפ של הקהילה וחזרו לכאן לפתיחת המחיר.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-5 space-y-3">
          {step === 'share' ? (
            <>
              <label htmlFor="community-promotion-share-text" className="block text-sm font-bold text-slate-800">
                ההודעה לשיתוף
              </label>
              <textarea
                id="community-promotion-share-text"
                readOnly
                value={shareText}
                onFocus={(event) => event.target.select()}
                className="min-h-32 w-full resize-none rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm leading-6 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={copyShareMessage}
                className="min-h-[48px] w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
              >
                העתקת ההודעה
              </button>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p aria-live="polite" className="font-bold text-emerald-800">{copyStatus}</p>
                <p className="mt-1 text-sm leading-6 text-emerald-900">
                  עכשיו שתפו אותה בקבוצת הוואטסאפ של הקהילה וחזרו לכאן.
                </p>
              </div>
              <button
                type="button"
                onClick={confirmShare}
                disabled={loading}
                className="min-h-[48px] w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
              >
                {loading ? 'פותחים את המחיר…' : 'שיתפתי — פתיחת ההנחה'}
              </button>
              <button
                type="button"
                onClick={() => setStep('share')}
                disabled={loading}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
              >
                חזרה להודעה
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommunityWeeklyPromotionUnlockModal;
