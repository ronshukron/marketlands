import React, { useEffect, useState } from 'react';
import { useSaleMode } from '../../contexts/SaleModeContext';
import { getMarketplaceStores } from '../../services/marketplaceService';
import {
  MARKETPLACE_LAST_VISIT_KEY,
  MARKETPLACE_VISIT_EVENT,
  hasNewApprovedMarketplaceBusinesses,
} from '../../utils/marketplaceVisitUtils';

const ModeToggle = ({ className = '' }) => {
  const { saleMode, setSaleMode } = useSaleMode();
  const [hasNewMarketplaceBusinesses, setHasNewMarketplaceBusinesses] = useState(false);

  const isWeekly = saleMode === 'weekly';
  const isBusiness = saleMode === 'business';

  useEffect(() => {
    let active = true;

    const refreshIndicator = async () => {
      try {
        const businesses = await getMarketplaceStores({ communityMode: 'all' });
        const lastVisit = window.localStorage.getItem(MARKETPLACE_LAST_VISIT_KEY);
        if (active) {
          setHasNewMarketplaceBusinesses(
            hasNewApprovedMarketplaceBusinesses(businesses, lastVisit),
          );
        }
      } catch (error) {
        console.warn('Could not check for new marketplace businesses', error);
      }
    };

    const clearIndicator = () => setHasNewMarketplaceBusinesses(false);
    refreshIndicator();
    window.addEventListener(MARKETPLACE_VISIT_EVENT, clearIndicator);
    window.addEventListener('storage', refreshIndicator);
    return () => {
      active = false;
      window.removeEventListener(MARKETPLACE_VISIT_EVENT, clearIndicator);
      window.removeEventListener('storage', refreshIndicator);
    };
  }, []);

  return (
    <div className={`w-full max-w-sm mx-auto px-0.5 ${className}`} dir="rtl">
      <div
        role="tablist"
        aria-label="בחר מצב מכירה"
        className="flex w-full bg-white rounded-full p-1 shadow-lg border border-white/70 overflow-hidden"
      >
        <button
          type="button"
          role="tab"
          aria-selected={isWeekly}
          onClick={() => setSaleMode('weekly')}
          className={`basis-1/2 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 text-xs sm:text-sm rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
            isWeekly
              ? 'bg-blue-600 text-white shadow focus-visible:ring-blue-600'
              : 'bg-white text-blue-700 border border-blue-600 hover:bg-blue-50 focus-visible:ring-blue-600'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="whitespace-nowrap">מכירה שבועית</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={isBusiness}
          onClick={() => setSaleMode('business')}
          className={`relative basis-1/2 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 text-xs sm:text-sm rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
            isBusiness
              ? 'bg-green-600 text-white shadow focus-visible:ring-green-600'
              : 'bg-white text-green-700 border border-green-600 hover:bg-green-50 focus-visible:ring-green-600'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 21V10l8-6 8 6v11M9 21v-6h6v6" />
          </svg>
          <span className="whitespace-nowrap">עסקים מקומיים</span>
          {hasNewMarketplaceBusinesses && (
            <>
              <span
                aria-hidden="true"
                className="absolute top-1.5 left-2 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white"
              />
              <span className="sr-only">יש עסקים חדשים בשוק</span>
            </>
          )}
        </button>
      </div>
      <div className="mt-2 text-center text-[11px] sm:text-xs text-white/90">
        {isWeekly ? 'מציג את המכירות השבועיות' : 'מציג את שוק העסקים המקומיים'}
      </div>
    </div>
  );
};

export default ModeToggle; 