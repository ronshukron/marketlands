import React from 'react';
import { useSaleMode } from '../../contexts/SaleModeContext';

const ModeToggle = ({ className = '' }) => {
  const { saleMode, setSaleMode } = useSaleMode();

  const isWeekly = saleMode === 'weekly';
  const isIndependent = saleMode === 'independent';

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
          className={`basis-1/2 inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 text-xs sm:text-sm rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
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
          aria-selected={isIndependent}
          onClick={() => setSaleMode('independent')}
          className={`basis-1/2 inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 text-xs sm:text-sm rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
            isIndependent
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
          </svg>
          <span className="whitespace-nowrap">חקלאים עצמאיים</span>
        </button>
      </div>
      <div className="mt-2 text-center text-[11px] sm:text-xs text-white/90">
        {isWeekly ? 'מציג את המכירות השבועיות' : 'מציג מודעות של חקלאים עצמאיים'}
      </div>
    </div>
  );
};

export default ModeToggle; 