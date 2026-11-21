import React from 'react';
import { Link } from 'react-router-dom';

const formatMoney = (value) => `₪${Number(value || 0).toFixed(0)}`;

const SubscriptionBasketCard = ({ basket, community }) => {
  const componentCount = basket.componentLines?.length || 0;
  const componentNames = (basket.componentLines || [])
    .slice(0, 4)
    .map((line) => line.productName)
    .filter(Boolean);
  const signupPath = `/subscribe/${encodeURIComponent(basket.id)}?community=${encodeURIComponent(community || '')}`;

  return (
    <div className="bg-white rounded-xl shadow-sm border-2 border-amber-200 overflow-hidden flex flex-col h-full">
      <div className="relative h-44 bg-gradient-to-br from-amber-50 to-emerald-50">
        {basket.image ? (
          <img
            src={basket.image}
            alt={basket.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="h-full flex items-center justify-center text-amber-800 font-bold text-lg px-4 text-center">
            סל קבוע
          </div>
        )}
        <span className="absolute top-3 right-3 rounded-full bg-amber-600 text-white text-xs font-bold px-3 py-1 shadow">
          מנוי שבועי
        </span>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <h3 className="text-lg font-bold text-gray-900 mb-1">{basket.title}</h3>
        {basket.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-3">{basket.description}</p>
        )}

        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm text-amber-900">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">בערך לכל משלוח</span>
            <span className="text-xl font-black">{formatMoney(basket.componentSubtotal)}</span>
          </div>
          <p className="text-xs mt-1">
            משלמים רק על מה שנשאר בסל, לפי שקילה. אפשר להסיר פריטים, לדלג על שבוע או לבטל מתי שרוצים.
          </p>
        </div>

        <div className="text-xs text-gray-600 mb-4 flex-1">
          <p className="font-semibold text-gray-700 mb-1">{componentCount} פריטים מחקלאים שונים:</p>
          {componentNames.length > 0 && (
            <p className="line-clamp-2">
              {componentNames.join(', ')}
              {componentCount > componentNames.length ? ' ועוד...' : ''}
            </p>
          )}
        </div>

        <Link
          to={signupPath}
          className="w-full text-center bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-lg text-sm font-bold transition-colors"
        >
          להירשם למנוי
        </Link>
      </div>
    </div>
  );
};

export default SubscriptionBasketCard;
