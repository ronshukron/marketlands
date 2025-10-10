import React from 'react';

const CategoryNav = ({ categories, selectedCategory, onSelectCategory, categoryCounts }) => {
  return (
    <div className="category-nav bg-white rounded-xl shadow-sm p-4 mb-6" dir="rtl">
      <div className="flex flex-wrap gap-2 justify-center">
        {categories.map((category) => {
          const count = categoryCounts[category] || 0;
          const isSelected = selectedCategory === category;
          
          return (
            <button
              key={category}
              onClick={() => onSelectCategory(category)}
              className={`
                px-4 py-2 rounded-lg font-medium transition-all duration-200
                ${isSelected 
                  ? 'bg-blue-600 text-white shadow-md transform scale-105' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
                ${count === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              disabled={count === 0}
            >
              {category}
              {count > 0 && (
                <span className={`mr-1 text-xs ${isSelected ? 'text-blue-100' : 'text-gray-500'}`}>
                  ({count})
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryNav;

