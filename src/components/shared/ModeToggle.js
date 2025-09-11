import React from 'react';
import { useSaleMode } from '../../contexts/SaleModeContext';

const ModeToggle = ({ className = '' }) => {
  const { saleMode, setSaleMode } = useSaleMode();

  return (
    <div className={`inline-flex items-center gap-2 ${className}`} dir="rtl">
      <span className={`text-sm ${saleMode === 'weekly' ? 'font-bold' : 'text-gray-500'}`}>מכירה שבועית</span>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={saleMode === 'independent'}
          onChange={(e) => setSaleMode(e.target.checked ? 'independent' : 'weekly')}
        />
        <div className="w-14 h-8 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-600"></div>
      </label>
      <span className={`text-sm ${saleMode === 'independent' ? 'font-bold' : 'text-gray-500'}`}>חקלאים עצמאיים</span>
    </div>
  );
};

export default ModeToggle; 