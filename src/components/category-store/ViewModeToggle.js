import React from 'react';

const ViewModeToggle = ({ viewMode, setViewMode }) => {
  return (
    <div className="flex items-center justify-center gap-2 bg-white rounded-lg p-1 shadow-sm" dir="rtl">
      <button
        onClick={() => setViewMode('traditional')}
        className={`
          px-4 py-2 rounded-md font-medium text-sm transition-all duration-200
          ${viewMode === 'traditional' 
            ? 'bg-blue-600 text-white shadow-md' 
            : 'bg-transparent text-gray-600 hover:bg-gray-100'
          }
        `}
      >
        תצוגה מסורתית
      </button>
      <button
        onClick={() => setViewMode('category')}
        className={`
          px-4 py-2 rounded-md font-medium text-sm transition-all duration-200
          ${viewMode === 'category' 
            ? 'bg-blue-600 text-white shadow-md' 
            : 'bg-transparent text-gray-600 hover:bg-gray-100'
          }
        `}
      >
        תצוגה לפי קטגוריות
      </button>
    </div>
  );
};

export default ViewModeToggle;

