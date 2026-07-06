import React from 'react';

const formatMoney = (value) => `₪${Number(value || 0).toFixed(2)}`;

const IntroductionBasketCard = ({ basket, onAdd }) => {
  const componentCount = basket.componentLines?.length || 0;
  const componentNames = (basket.componentLines || [])
    .slice(0, 4)
    .map((line) => line.productName)
    .filter(Boolean);

  return (
    <div className="bg-white rounded-xl shadow-sm border-2 border-emerald-200 overflow-hidden flex flex-col h-full">
      <div className="relative h-44 bg-gradient-to-br from-emerald-50 to-blue-50">
        {basket.image ? (
          <img
            src={basket.image}
            alt={basket.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="h-full flex items-center justify-center text-emerald-700 font-bold text-lg px-4 text-center">
            סל היכרות
          </div>
        )}
        <span className="absolute top-3 right-3 rounded-full bg-emerald-600 text-white text-xs font-bold px-3 py-1 shadow">
          סל היכרות
        </span>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <h3 className="text-lg font-bold text-gray-900 mb-1">{basket.title}</h3>
        {basket.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-3">{basket.description}</p>
        )}

        <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-100 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-emerald-800 font-medium">מחיר לכל הסל</span>
            <span className="text-2xl font-black text-emerald-700">{formatMoney(basket.displayPrice)}</span>
          </div>
          {basket.componentSubtotal > basket.displayPrice && (
            <p className="text-xs text-emerald-700 mt-1">
              במקום {formatMoney(basket.componentSubtotal)}
            </p>
          )}
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

        <button
          type="button"
          onClick={() => onAdd(basket)}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-bold transition-colors"
        >
          הוסף סל היכרות
        </button>
      </div>
    </div>
  );
};

export default IntroductionBasketCard;
