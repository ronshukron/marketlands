import React, { useState, useEffect } from 'react';
import {
  parseShoppingListTerms,
  searchProducts,
  findBestProductForTerm,
} from '../../utils/productSearchUtils';

const noop = () => {};

const SearchBar = ({
  products,
  onSearchResults,
  setSearchActive,
  onMultiSearch = noop,
  onBulkAddToCart = noop,
  onClearMultiSearch = noop,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (searchTerm.trim() === '') {
      onSearchResults([]);
      setSearchActive(false);
      onClearMultiSearch();
      return;
    }

    const listTerms = parseShoppingListTerms(searchTerm);
    if (listTerms.length >= 2) {
      const combined = listTerms.flatMap((term) => searchProducts(products, term));
      const seen = new Set();
      const deduped = combined.filter((p) => {
        const key = p.uid || `${p.id}_${p.orderId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      onSearchResults(deduped);
      setSearchActive(true);
      return;
    }

    const filtered = searchProducts(products, searchTerm);
    onSearchResults(filtered);
    setSearchActive(true);
    onClearMultiSearch();
  }, [searchTerm, products, onSearchResults, setSearchActive, onClearMultiSearch]);

  const handleClear = () => {
    setSearchTerm('');
  };

  const listTerms = parseShoppingListTerms(searchTerm);
  const showListActions = listTerms.length >= 2;

  const handleShowList = () => {
    onMultiSearch(listTerms);
  };

  const handleBulkAdd = () => {
    const matches = listTerms.map((term) => ({
      term,
      product: findBestProductForTerm(products, term),
    }));
    onBulkAddToCart(matches);
  };

  return (
    <div className="relative mb-6" dir="rtl">
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="חפש מוצרים לפי שם, תיאור או חקלאי..."
          className="w-full px-4 py-3 pr-12 pl-12 text-right border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
        />

        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {searchTerm && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
            <button
              onClick={handleClear}
              type="button"
              className="pointer-events-auto w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="נקה חיפוש"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {showListActions && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleBulkAdd}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
          >
            הוסף הכל לסל
          </button>
          <button
            type="button"
            onClick={handleShowList}
            className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
          >
            הצג ברשימה
          </button>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
