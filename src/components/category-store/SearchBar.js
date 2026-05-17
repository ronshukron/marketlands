import React, { useState, useEffect, useRef } from 'react';

const SearchBar = ({ products, onSearchResults, setSearchActive }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [exactMode, setExactMode] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    // Close suggestions when clicking outside
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Function to calculate relevance score for sorting
  const calculateRelevance = (product, term) => {
    const lowerTerm = term.toLowerCase();
    const lowerName = product.name.toLowerCase();
    const lowerDesc = product.description?.toLowerCase() || '';
    const lowerBusiness = product.businessName.toLowerCase();

    // Exact match (highest priority)
    if (lowerName === lowerTerm) return 1000;
    
    // Starts with search term (very high priority)
    if (lowerName.startsWith(lowerTerm)) return 900;
    
    // Contains search term in name (high priority)
    if (lowerName.includes(lowerTerm)) {
      // Earlier in the string = higher score
      const position = lowerName.indexOf(lowerTerm);
      return 800 - position;
    }
    
    // Contains in description (medium priority)
    if (lowerDesc.includes(lowerTerm)) return 300;
    
    // Contains in business name (lower priority)
    if (lowerBusiness.includes(lowerTerm)) return 200;
    
    return 0;
  };

  useEffect(() => {
    if (searchTerm.trim() === '') {
      onSearchResults([]);
      setSearchActive(false);
      setShowSuggestions(false);
      return;
    }

    if (exactMode) {
      const exact = products.filter(p => p.name.toLowerCase() === searchTerm.toLowerCase());
      onSearchResults(exact);
      setSearchActive(true);
      setShowSuggestions(false);
      return;
    }

    // Filter and sort products by relevance
    const filtered = products
      .filter(product => 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.businessName.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        const scoreA = calculateRelevance(a, searchTerm);
        const scoreB = calculateRelevance(b, searchTerm);
        return scoreB - scoreA; // Higher score first
      });

    onSearchResults(filtered);
    setSearchActive(true);
    setShowSuggestions(true);
  }, [searchTerm, products, onSearchResults, setSearchActive, exactMode]);

  const handleClear = () => {
    setSearchTerm('');
    setShowSuggestions(false);
  };

  return (
    <div className="relative mb-6" ref={searchRef} dir="rtl">
      <div className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => { setExactMode(false); setSearchTerm(e.target.value); }}
          onFocus={() => searchTerm && setShowSuggestions(true)}
          placeholder="חפש מוצרים לפי שם, תיאור או חקלאי..."
          className="w-full px-4 py-3 pr-12 pl-12 text-right border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
        />
        
        {/* Search Icon */}
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Clear Button */}
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

      {/* Search Results Count */}
      {showSuggestions && searchTerm && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto search-suggestions">
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-600">
              {onSearchResults.length === 0 ? (
                <span className="text-red-600">לא נמצאו תוצאות</span>
              ) : (
                <span>נמצאו <span className="font-semibold text-blue-600">{products.filter(p => 
                  p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  p.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  p.businessName.toLowerCase().includes(searchTerm.toLowerCase())
                ).length}</span> מוצרים</span>
              )}
            </p>
          </div>
          
          {/* Product Suggestions */}
          <div className="divide-y divide-gray-100">
            {products
              .filter(p => 
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.businessName.toLowerCase().includes(searchTerm.toLowerCase())
              )
              .sort((a, b) => {
                const scoreA = calculateRelevance(a, searchTerm);
                const scoreB = calculateRelevance(b, searchTerm);
                return scoreB - scoreA;
              })
              .slice(0, 10) // Show max 10 suggestions
              .map((product) => (
                <div 
                  key={product.uid}
                  className="p-3 hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => {
                    // Select exact product name, close list, and show exact results
                    setExactMode(true);
                    setSearchTerm(product.name);
                    setShowSuggestions(false);
                    const exact = products.filter(p => p.name.toLowerCase() === product.name.toLowerCase());
                    onSearchResults(exact);
                    setSearchActive(true);
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* Product Image */}
                    {product.images && product.images.length > 0 ? (
                      <img 
                        src={product.images[0]} 
                        alt={product.name}
                        className="w-12 h-12 object-cover rounded-md border border-gray-200"
                        loading="lazy"
                        decoding="async"
                        width="48"
                        height="48"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    
                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {product.name}
                      </h4>
                      <p className="text-xs text-gray-500 truncate">
                        {product.businessName} - {product.businessKind}
                      </p>
                    </div>
                    
                    {/* Price */}
                    <div className="text-sm font-semibold text-blue-600">
                      ₪{product.price}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;

