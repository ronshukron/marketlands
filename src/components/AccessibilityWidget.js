import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const AccessibilityWidget = ({ isOpen, onClose }) => {
  const [fontSize, setFontSize] = useState(0); // 0 = normal, 1 = large, 2 = extra large
  const [highContrast, setHighContrast] = useState(false);
  const [grayscale, setGrayscale] = useState(false);

  // Load saved settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('accessibilitySettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setFontSize(settings.fontSize || 0);
      setHighContrast(settings.highContrast || false);
      setGrayscale(settings.grayscale || false);

      // Apply saved settings immediately
      applyAccessibilitySettings(settings);
    }
  }, []);

  // Save settings to localStorage and apply them
  const saveSettings = (newSettings) => {
    const settings = {
      fontSize: newSettings.fontSize !== undefined ? newSettings.fontSize : fontSize,
      highContrast: newSettings.highContrast !== undefined ? newSettings.highContrast : highContrast,
      grayscale: newSettings.grayscale !== undefined ? newSettings.grayscale : grayscale
    };

    localStorage.setItem('accessibilitySettings', JSON.stringify(settings));
    applyAccessibilitySettings(settings);
  };

  // Apply the actual accessibility changes to the document
  const applyAccessibilitySettings = (settings) => {
    const htmlElement = document.documentElement;
    
    // Apply font size
    if (settings.fontSize === 1) {
      htmlElement.style.fontSize = '110%';
    } else if (settings.fontSize === 2) {
      htmlElement.style.fontSize = '120%';
    } else {
      htmlElement.style.fontSize = '100%';
    }
    
    // Apply high contrast
    if (settings.highContrast) {
      htmlElement.classList.add('high-contrast');
    } else {
      htmlElement.classList.remove('high-contrast');
    }
    
    // Apply grayscale
    if (settings.grayscale) {
      htmlElement.classList.add('grayscale');
    } else {
      htmlElement.classList.remove('grayscale');
    }
  };

  // Handle font size change
  const handleFontSizeChange = (size) => {
    setFontSize(size);
    saveSettings({ fontSize: size });
  };

  // Handle high contrast toggle
  const handleHighContrastToggle = () => {
    const newValue = !highContrast;
    setHighContrast(newValue);
    saveSettings({ highContrast: newValue });
  };

  // Handle grayscale toggle
  const handleGrayscaleToggle = () => {
    const newValue = !grayscale;
    setGrayscale(newValue);
    saveSettings({ grayscale: newValue });
  };

  // Reset all settings
  const handleResetSettings = () => {
    const defaultSettings = { fontSize: 0, highContrast: false, grayscale: false };
    setFontSize(0);
    setHighContrast(false);
    setGrayscale(false);
    saveSettings(defaultSettings);
  };

  // If the widget is not open, don't render anything
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="accessibility-widget-title" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>
      
      {/* Widget panel */}
      <div dir="rtl" className="fixed inset-y-0 left-0 max-w-xs w-full bg-white shadow-xl transform transition-all">
        <div className="h-full flex flex-col py-6 bg-white shadow-xl overflow-y-scroll">
          <div className="px-4 sm:px-6">
            <div className="flex items-start justify-between">
              <h2 id="accessibility-widget-title" className="text-lg font-medium text-gray-900">
                הגדרות נגישות
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className="sr-only">סגור</span>
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          <div className="mt-6 flex-1 px-4 sm:px-6">
            {/* Font Size Settings */}
            <div className="mb-8">
              <h3 className="text-md font-medium text-gray-900 mb-3">גודל טקסט</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleFontSizeChange(0)}
                  className={`px-4 py-2 border rounded-md ${
                    fontSize === 0 ? 'bg-blue-100 border-blue-500 text-blue-800' : 'bg-white border-gray-300 text-gray-700'
                  }`}
                >
                  רגיל
                </button>
                <button
                  onClick={() => handleFontSizeChange(1)}
                  className={`px-4 py-2 border rounded-md ${
                    fontSize === 1 ? 'bg-blue-100 border-blue-500 text-blue-800' : 'bg-white border-gray-300 text-gray-700'
                  }`}
                >
                  גדול
                </button>
                <button
                  onClick={() => handleFontSizeChange(2)}
                  className={`px-4 py-2 border rounded-md ${
                    fontSize === 2 ? 'bg-blue-100 border-blue-500 text-blue-800' : 'bg-white border-gray-300 text-gray-700'
                  }`}
                >
                  גדול מאוד
                </button>
              </div>
            </div>
            
            {/* Contrast Settings */}
            <div className="mb-8">
              <h3 className="text-md font-medium text-gray-900 mb-3">ניגודיות</h3>
              <div className="flex items-center">
                <button
                  onClick={handleHighContrastToggle}
                  className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    highContrast ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  role="switch"
                  aria-checked={highContrast ? 'true' : 'false'}
                >
                  <span className="sr-only">הפעל מצב ניגודיות גבוהה</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${
                      highContrast ? 'translate-x-3 rtl:-translate-x-3' : 'translate-x-3'
                    }`}
                  ></span>
                </button>
                <span className="mr-3 text-sm text-gray-700">ניגודיות גבוהה</span>
              </div>
            </div>
            
            {/* Grayscale Settings */}
            <div className="mb-8">
              <h3 className="text-md font-medium text-gray-900 mb-3">צבעים</h3>
              <div className="flex items-center">
                <button
                  onClick={handleGrayscaleToggle}
                  className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    grayscale ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  role="switch"
                  aria-checked={grayscale ? 'true' : 'false'}
                >
                  <span className="sr-only">הפעל מצב גווני אפור</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${
                      grayscale ? 'translate-x-3 rtl:-translate-x-3' : 'translate-x-3'
                    }`}
                  ></span>
                </button>
                <span className="mr-3 text-sm text-gray-700">מצב גווני אפור</span>
              </div>
            </div>
            
            {/* Link to accessibility statement */}
            <div className="mb-8">
              <Link 
                to="/accessibility" 
                className="text-blue-600 hover:text-blue-800 hover:underline"
                onClick={onClose}
              >
                צפה בהצהרת הנגישות המלאה
              </Link>
            </div>
            
            {/* Reset settings */}
            <div className="py-4 border-t border-gray-200">
              <button
                onClick={handleResetSettings}
                className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                איפוס הגדרות נגישות
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccessibilityWidget; 