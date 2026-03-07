import React, { useState } from 'react';

const SharedBarChart = ({ 
  data, 
  labelKey, 
  valueKey, 
  topLabelKey, 
  height = 350, 
  color = "bg-blue-500", 
  formatValue = (v) => v, 
  title, 
  subtitle 
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow h-full flex flex-col justify-center items-center">
        <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
        <div className="text-gray-400">אין נתונים להצגה בטווח הנבחר</div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => Number(d[valueKey])));
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) => 
    Math.round(maxValue * (1 - i / (tickCount - 1)))
  );

  const barColorClass = color.replace('bg-', '');
  const hoverColorMap = {
    'green-500': 'bg-green-600',
    'blue-500': 'bg-blue-600',
    'indigo-500': 'bg-indigo-600',
    'purple-500': 'bg-purple-600',
    'red-500': 'bg-red-600',
    'yellow-500': 'bg-yellow-600',
  };
  const hoverColor = hoverColorMap[barColorClass] || color;

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      
      <div className="flex-grow flex" style={{ minHeight: `${height}px` }}>
        {/* Y-Axis Labels */}
        <div className="flex flex-col justify-between text-sm text-gray-500 pl-3 pb-10 pt-2 min-w-[70px] text-left font-medium">
          {ticks.map((tick, i) => (
            <span key={i}>{formatValue(tick)}</span>
          ))}
        </div>

        {/* Chart Area */}
        <div className="flex-grow flex items-end gap-1 overflow-x-auto pb-10 pt-2 px-1 relative border-r border-gray-200">
          {/* Horizontal grid lines */}
          {ticks.map((_, i) => (
            <div 
              key={`grid-${i}`} 
              className="absolute left-0 right-0 border-t border-gray-100"
              style={{ bottom: `calc(40px + ${(1 - i / (tickCount - 1)) * 100}%)` }}
            />
          ))}

          {data.map((item, i) => {
            const val = Number(item[valueKey]);
            const percent = maxValue > 0 ? (val / maxValue) * 100 : 0;
            const isHovered = hoveredIndex === i;
            const labelText = topLabelKey ? item[topLabelKey] : formatValue(val);
            const isPriceLabel = !!topLabelKey;

            return (
              <div 
                key={i} 
                className="flex flex-col items-center justify-end flex-1 min-w-[32px] max-w-[80px] relative cursor-pointer"
                style={{ height: '100%' }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div className="w-full relative flex items-end h-full px-[2px]">
                  <div 
                    className={`w-full rounded-t-md transition-all duration-300 relative ${isHovered ? hoverColor : color}`}
                    style={{ 
                      height: `${Math.max(percent, 2)}%`,
                      opacity: hoveredIndex !== null && !isHovered ? 0.5 : 1,
                    }}
                  >
                    {/* Hover tooltip */}
                    {isHovered && !isPriceLabel && (
                      <div className="absolute -top-14 left-1/2 -translate-x-1/2 whitespace-nowrap z-20 pointer-events-none
                        bg-gray-900 text-white text-base font-bold px-3 py-2 rounded-lg shadow-lg
                        after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2
                        after:border-[6px] after:border-transparent after:border-t-gray-900">
                        {labelText}
                      </div>
                    )}

                    {/* Always-visible price label */}
                    {isPriceLabel && (
                      <span className={`absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap z-10 pointer-events-none
                        font-bold bg-white border border-gray-200 shadow-sm rounded px-1.5 py-0.5
                        ${isHovered ? 'text-sm text-gray-900' : 'text-xs text-gray-700'}`}>
                        {labelText}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`mt-2 text-center w-full truncate font-medium transition-all duration-200 
                  ${isHovered ? 'text-sm text-gray-900 font-bold' : 'text-xs text-gray-500'}`}>
                  {item[labelKey]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary row */}
      {hoveredIndex !== null && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-center">
          <span className="text-lg font-bold text-gray-800">
            {data[hoveredIndex][labelKey]}: {formatValue(Number(data[hoveredIndex][valueKey]))}
          </span>
        </div>
      )}
    </div>
  );
};

export default SharedBarChart;
