import React from 'react';

const SharedBarChart = ({ 
  data, 
  labelKey, 
  valueKey, 
  topLabelKey, 
  height = 240, 
  color = "bg-blue-500", 
  formatValue = (v) => v, 
  title, 
  subtitle 
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow h-full flex flex-col justify-center items-center">
        <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
        <div className="text-gray-400">אין נתונים להצגה בטווח הנבחר</div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => Number(d[valueKey])));
  const ticks = [maxValue, maxValue * 0.66, maxValue * 0.33, 0].map(Math.round);

  return (
    <div className="bg-white p-6 rounded-lg shadow h-full flex flex-col">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      
      <div className="flex-grow flex">
        {/* Y-Axis Labels */}
        <div className="flex flex-col justify-between text-xs text-gray-400 pr-2 pb-8 h-full min-h-[200px] pt-6 border-l border-gray-100">
          {ticks.map((tick, i) => (
            <span key={i} className="relative -top-1">{formatValue(tick)}</span>
          ))}
        </div>

        {/* Chart Area */}
        <div className="flex-grow flex items-end space-x-4 space-x-reverse overflow-x-auto pb-8 pt-6 px-2 min-h-[200px]">
          {data.map((item, i) => {
            const val = Number(item[valueKey]);
            const percent = maxValue > 0 ? (val / maxValue) * 100 : 0;
            
            // Determine label text
            const labelText = topLabelKey ? item[topLabelKey] : formatValue(val);
            
            // Special styling if it's a Price Label (custom topLabelKey present)
            // We make it always visible, dark text, slightly larger
            const isPriceLabel = !!topLabelKey;

            return (
              <div key={i} className="flex flex-col items-center justify-end flex-shrink-0 group relative" style={{ width: '40px', height: '100%' }}>
                <div className="w-full relative flex items-end h-full">
                   <div 
                      className={`w-full rounded-t ${color} transition-all duration-500 relative`}
                      style={{ height: `${Math.max(percent, 1)}%` }}
                   >
                     <span 
                        className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap z-10 pointer-events-none px-1 rounded
                        ${isPriceLabel 
                            ? 'text-xs font-bold text-gray-800 bg-white border border-gray-200 shadow-sm opacity-100' // Always visible for Price
                            : 'bg-gray-800 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity' // Hover only for regular values
                        }`}
                     >
                       {labelText}
                     </span>
                   </div>
                </div>
                <span className="text-[10px] text-gray-600 mt-2 rotate-45 origin-top-left translate-y-1 w-max font-medium">
                  {item[labelKey]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SharedBarChart;