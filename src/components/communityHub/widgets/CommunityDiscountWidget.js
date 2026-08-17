import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/authContext';
import { subscribeDisplayDiscountInfo } from '../../../services/communityDiscountService';

const CommunityDiscountWidget = ({
  communityName,
  deliveryWeekKey,
  variant = 'full',
  showCommunityLink = false,
}) => {
  const { userLoggedIn, loading: authLoading } = useAuth();
  const [discountInfo, setDiscountInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!communityName) {
      setDiscountInfo(null);
      setError(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError(null);
    return subscribeDisplayDiscountInfo({
      communityName,
      ...(deliveryWeekKey ? { deliveryWeekKey } : {}),
      onValue: (info) => {
        setDiscountInfo(info);
        setLoading(false);
      },
      onError: (err) => {
        console.error('Error loading discount info:', err);
        setError(err.message);
        setLoading(false);
      },
    });
  }, [communityName, deliveryWeekKey]);

  if (loading || authLoading) {
    if (variant === 'compact') return null;
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
        <div className="h-8 bg-gray-200 rounded w-full" />
      </div>
    );
  }

  if (error) {
    if (variant === 'compact') return null;
    return (
      <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
        <p className="text-red-500 text-sm text-center">שגיאה בטעינת נתוני הנחה: {error}</p>
      </div>
    );
  }

  if (!discountInfo || discountInfo.tiers.length === 0) {
    return null;
  }

  if (!userLoggedIn) {
    if (variant === 'compact') {
      return (
        <section
          className="rounded-lg border border-green-200 bg-gradient-to-l from-green-50 to-emerald-50 px-3 py-2 shadow-sm"
          aria-label="הנחת קהילה"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-gray-900">הנחת קהילה</h2>
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center text-xs font-semibold text-green-800 underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              התחברות
            </Link>
          </div>
          <p className="mt-1 text-xs text-gray-600">יש להתחבר כדי לצפות</p>
        </section>
      );
    }
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
        <h3 className="text-lg font-bold text-gray-900">הנחת קהילה</h3>
        <p className="mt-2 text-sm text-gray-600">יש להתחבר כדי לצפות</p>
        <Link
          to="/login"
          className="mt-3 inline-flex min-h-11 items-center font-semibold text-green-700 underline-offset-4 hover:underline"
        >
          התחברות
        </Link>
      </div>
    );
  }

  const {
    discountPercent,
    currentTier,
    nextTier,
    weeklyTotal,
    tiers,
    isVip,
    vipPerks,
    weekStart,
    weekEnd,
  } = discountInfo;
  const formatDate = (value) => value
    ? new Date(value).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
    : '';
  const weekLabel = weekStart && weekEnd
    ? `${formatDate(weekStart)}–${formatDate(weekEnd)}`
    : '';

  // Calculate progress toward the next display threshold
  const nextDisplayThreshold = nextTier?.displayThreshold;
  const currentDisplayThreshold = currentTier?.displayThreshold || 0;
  const progressPercent = nextDisplayThreshold
    ? Math.min(100, (weeklyTotal / nextDisplayThreshold) * 100)
    : 100;

  if (variant === 'compact') {
    return (
      <section
        className={`rounded-lg border px-3 py-2 shadow-sm ${
          isVip
            ? 'border-yellow-300 bg-gradient-to-l from-yellow-50 to-amber-50'
            : 'border-green-200 bg-gradient-to-l from-green-50 to-emerald-50'
        }`}
        aria-label="התקדמות הנחת הקהילה"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-gray-900">הנחת קהילה</h2>
            {isVip && (
              <span className="rounded-full bg-yellow-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                VIP
              </span>
            )}
          </div>
          {discountPercent > 0 && (
            <span className={`flex-shrink-0 text-sm font-bold ${
              isVip ? 'text-yellow-700' : 'text-green-700'
            }`}>
              {discountPercent}%
            </span>
          )}
        </div>

        {nextTier ? (
          <div className="mt-2">
            <div className="mb-1 flex justify-between gap-3 text-[11px] text-gray-500">
              <span>{Math.round(weeklyTotal).toLocaleString('he-IL')}</span>
              <span>{nextDisplayThreshold.toLocaleString('he-IL')}</span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-white"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={nextDisplayThreshold}
              aria-valuenow={Math.min(weeklyTotal, nextDisplayThreshold)}
              aria-label={`התקדמות ליעד הבא: ${Math.round(progressPercent)} אחוז`}
            >
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  isVip
                    ? 'bg-gradient-to-l from-yellow-300 to-yellow-500'
                    : 'bg-gradient-to-l from-green-400 to-green-600'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className={`mt-1 text-xs font-semibold ${isVip ? 'text-yellow-700' : 'text-green-700'}`}>
              להנחה הבאה: {nextTier.discountPercent}%
            </p>
          </div>
        ) : (
          <p className={`mt-1.5 text-xs font-semibold ${isVip ? 'text-yellow-700' : 'text-green-700'}`}>
            רמת ההנחה הגבוהה ביותר
          </p>
        )}

        {showCommunityLink && (
          <Link
            to={`/community/${encodeURIComponent(communityName)}`}
            className={`mt-0.5 inline-flex items-center py-1 text-xs font-medium underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isVip
                ? 'text-yellow-800 focus:ring-yellow-500'
                : 'text-green-800 focus:ring-green-500'
            }`}
          >
            למרכז הקהילה
          </Link>
        )}
      </section>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className={`text-white px-6 py-4 ${isVip ? 'bg-gradient-to-l from-yellow-500 via-yellow-600 to-amber-600' : 'bg-gradient-to-l from-green-600 to-green-700'}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">הנחת קהילה</h3>
              {isVip && (
                <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-bold border border-white/30">
                  VIP
                </span>
              )}
            </div>
            <p className={`text-sm mt-1 ${isVip ? 'text-yellow-100' : 'text-green-100'}`}>
              {isVip
                ? 'קהילת VIP — נהנים מהטבות מיוחדות!'
                : 'ככל שהקהילה מזמינה יותר, כולם חוסכים יותר!'}
            </p>
          </div>
          {discountPercent > 0 && (
            <div className={`rounded-full px-4 py-2 font-bold text-xl ${isVip ? 'bg-white text-yellow-600' : 'bg-white text-green-700'}`}>
              {discountPercent}%
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* VIP base discount badge */}
        {isVip && vipPerks?.baseDiscount?.enabled && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
            <span className="text-yellow-600 text-lg">&#9733;</span>
            <p className="text-sm text-yellow-800">
              כקהילת VIP, יש לכם הנחה מובטחת של לפחות{' '}
              <strong>{tiers[vipPerks.baseDiscount.guaranteedTierIndex]?.discountPercent || 0}%</strong>
              {' '}ללא קשר לסכום ההזמנות!
            </p>
          </div>
        )}

        {/* Current week total */}
        <div className="text-center mb-6">
          <p className="text-gray-500 text-sm">
            סה"כ הזמנות הקהילה לשבוע המשלוח{weekLabel ? ` ${weekLabel}` : ''}
          </p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {Math.round(weeklyTotal).toLocaleString('he-IL')} &#8362;
          </p>
          <p className="text-xs text-gray-400 mt-1">לפי הסכום המשוער לפני שקילה, ללא משלוח</p>
          {discountPercent > 0 && (
            <p className={`font-semibold mt-1 ${isVip ? 'text-yellow-600' : 'text-green-600'}`}>
              הקהילה זכאית להנחה של {discountPercent}%!
            </p>
          )}
        </div>

        {/* Progress bar */}
        {nextTier && (
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>{currentDisplayThreshold > 0 ? `${currentDisplayThreshold.toLocaleString('he-IL')} \u20AA` : '0 \u20AA'}</span>
              <span>{nextDisplayThreshold.toLocaleString('he-IL')} &#8362;</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${isVip ? 'bg-gradient-to-l from-yellow-300 to-yellow-500' : 'bg-gradient-to-l from-green-400 to-green-600'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-center text-sm text-gray-500 mt-2">
              {'עוד '}
              <span className={`font-semibold ${isVip ? 'text-yellow-600' : 'text-green-700'}`}>
                {Math.max(0, Math.round(nextDisplayThreshold - weeklyTotal)).toLocaleString('he-IL')} &#8362;
              </span>
              {' להנחה של '}{nextTier.discountPercent}%
            </p>
          </div>
        )}

        {nextTier === null && discountPercent > 0 && (
          <div className="text-center mb-4">
            <span className={`inline-block rounded-full px-4 py-1 text-sm font-semibold ${isVip ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
              הגעתם לרמת ההנחה הגבוהה ביותר!
            </span>
          </div>
        )}

        {/* Tier milestones */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">רמות ההנחה:</p>
          {tiers.map((tier, idx) => {
            const achieved = weeklyTotal >= tier.realThreshold;
            const vipGuaranteed = isVip && vipPerks?.baseDiscount?.enabled && idx <= (vipPerks.baseDiscount.guaranteedTierIndex ?? -1);
            const isActive = achieved || vipGuaranteed;
            return (
              <div
                key={idx}
                className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                  isActive
                    ? (isVip ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200')
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                    isActive ? (isVip ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white') : 'bg-gray-300 text-white'
                  }`}>
                    {isActive ? '\u2713' : idx + 1}
                  </div>
                  <span className={`text-sm ${isActive ? (isVip ? 'text-yellow-800 font-semibold' : 'text-green-800 font-semibold') : 'text-gray-600'}`}>
                    {tier.displayThreshold.toLocaleString('he-IL')} &#8362;
                  </span>
                  {vipGuaranteed && !achieved && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">VIP</span>
                  )}
                </div>
                <span className={`font-bold ${isActive ? (isVip ? 'text-yellow-700' : 'text-green-700') : 'text-gray-400'}`}>
                  {tier.discountPercent}% הנחה
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CommunityDiscountWidget;
