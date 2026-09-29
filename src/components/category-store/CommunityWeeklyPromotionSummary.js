import React, { useMemo } from 'react';

const UNIT_LABELS = {
  kg: 'לק"ג',
  unit: 'ליח׳',
  package: 'לאריזה',
};

const formatPrice = (value) => {
  const number = Number(value);
  return Number.isInteger(number) ? `₪${number}` : `₪${number.toFixed(2)}`;
};

const CommunityWeeklyPromotionSummary = ({ promotion, unlocked, onUnlock }) => {
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

  if (!promotion) return null;

  return (
    <section
      className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2"
      aria-label="מבצע שבועי לקהילה"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-sm font-bold text-gray-900">
          <span className="text-blue-700">מבצע שבועי:</span>{' '}
          {promotion.title || 'מחיר קהילתי מיוחד'}
        </h2>
        {!unlocked && (
          <button
            type="button"
            onClick={onUnlock}
            className="min-h-11 max-w-[11rem] flex-shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold leading-tight text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            פתיחת המבצע עבור כל הקהילה
          </button>
        )}
      </div>

      {deals.length > 0 && (
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

      {!unlocked && (
        <p className="mt-1 text-[11px] text-gray-500">שיתוף אחד בקבוצת הקהילה פותח את המחיר לכל חברי הקהילה.</p>
      )}
    </section>
  );
};

export default CommunityWeeklyPromotionSummary;
