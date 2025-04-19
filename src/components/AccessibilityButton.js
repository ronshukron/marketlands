import React, { useState } from 'react';
import AccessibilityWidget from './AccessibilityWidget';

const AccessibilityButton = () => {
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);

  const openWidget = () => {
    setIsWidgetOpen(true);
  };

  const closeWidget = () => {
    setIsWidgetOpen(false);
  };

  return (
    <>
      <button
        onClick={openWidget}
        className="fixed bottom-4 left-4 z-40 w-11 h-11 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        aria-label="הגדרות נגישות"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </button>
      <AccessibilityWidget isOpen={isWidgetOpen} onClose={closeWidget} />
    </>
  );
};

export default AccessibilityButton; 