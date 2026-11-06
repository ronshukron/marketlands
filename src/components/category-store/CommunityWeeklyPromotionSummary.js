import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';

const UNIT_LABELS = {
  kg: 'לק"ג',
  unit: 'ליח׳',
  package: 'לאריזה',
};

const formatPrice = (value) => {
  const number = Number(value);
  return Number.isInteger(number) ? `₪${number}` : `₪${number.toFixed(2)}`;
};

const CommunityWeeklyPromotionSummary = ({
  promotion,
  unlocked,
  onUnlock,
  requiresSignIn = false,
  checkingAccess = false,
}) => {
  const deals = useMemo(() => {
    const seen = new Set();
    return (Array.isArray(promotion?.productSnapshots) ? promotion.productSnapshots : [])
      .filter((entry) => {
        const key = String(entry?.productId || entry?.id || '');
        if (!key || seen.has(key) || !(Number(entry.promotionPrice) > 0)) return false;
        seen.add(key);
        return true;
      })
      .map((entry) => ({
        key: String(entry.productId || entry.id),
        name: entry.name,
        regularPrice: Number(entry.regularPrice),
        promotionPrice: Number(entry.promotionPrice),
        unitLabel: UNIT_LABELS[entry.measurementType] || '',
      }));
  }, [promotion]);
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const showDeals = !requiresSignIn && !checkingAccess;

  if (!promotion) return null;

  return (
    <section
      className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 shadow-sm"
      aria-label="מבצע שבועי לקהילה"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold text-emerald-800">מבצע שבועי לקהילה</p>
          <h2 className="mt-0.5 text-lg font-black text-gray-900">
            {promotion.title || 'מחיר קהילתי מיוחד'}
          </h2>
        </div>
        {requiresSignIn && (
          <Link
            to="/login"
            state={{ from: returnTo }}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          >
            התחברות למבצע
          </Link>
        )}
        {!requiresSignIn && !checkingAccess && !unlocked && (
          <button
            type="button"
            onClick={onUnlock}
            className="min-h-11 shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          >
            שיתוף ופתיחת המחיר
          </button>
        )}
      </div>

      {showDeals && deals.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-gray-700">
          {deals.map((deal) => (
            <li key={deal.key} className="flex justify-between gap-2">
              <span className="truncate">{deal.name}</span>
              <span className="flex-shrink-0">
                <span className="font-bold text-emerald-700">
                  {formatPrice(deal.promotionPrice)} {deal.unitLabel}
                </span>
                {deal.regularPrice > deal.promotionPrice && (
                  <span className="mr-1 text-gray-400 line-through">{formatPrice(deal.regularPrice)}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {requiresSignIn && (
        <p className="mt-2 text-sm font-medium text-emerald-900">המבצע זמין רק למשתמשים מחוברים.</p>
      )}
      {!requiresSignIn && !checkingAccess && !unlocked && (
        <p className="mt-2 text-sm font-medium text-emerald-900">שיתוף אחד בקבוצת הקהילה פותח את המחיר לכל חברי הקהילה.</p>
      )}
    </section>
  );
};

export default CommunityWeeklyPromotionSummary;
