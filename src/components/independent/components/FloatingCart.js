import React, { useState } from 'react';

const FloatingCart = ({ items, onUpdateQuantity, onRemoveItem, onGoToPayment }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  if (items.length === 0) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-3 z-50" dir="rtl">
        <div className="max-w-7xl mx-auto text-center text-gray-500 text-sm">
          העגלה ריקה
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50" dir="rtl">
      {/* Collapsed view */}
      <div 
        className="p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
              {itemCount}
            </div>
            <div className="text-sm font-medium text-gray-900">
              {itemCount} פריטים · ₪{total.toFixed(2)}
            </div>
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className={`h-4 w-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onGoToPayment();
            }}
            className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded text-sm font-medium"
          >
            מעבר לתשלום
          </button>
        </div>
      </div>

      {/* Expanded view */}
      {isExpanded && (
        <div className="border-t bg-gray-50 max-h-80 overflow-y-auto">
          <div className="p-3 space-y-3">
            {items.map((item, index) => (
              <div key={`${item.id}_${item.selectedOption || 'default'}_${index}`} className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  {/* Product image */}
                  <div className="w-12 h-12 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
                    {item.images && item.images.length > 0 ? (
                      <img 
                        src={item.images[0]} 
                        alt={item.name} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Product details */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 truncate">{item.name}</h4>
                    {item.selectedOption && (
                      <p className="text-xs text-gray-500 mt-1">{item.selectedOption}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-medium text-blue-600">₪{item.price}</span>
                      <div className="flex items-center gap-2">
                        {/* Quantity controls */}
                        <div className="flex items-center border border-gray-300 rounded overflow-hidden">
                          <button 
                            onClick={() => onUpdateQuantity(item, item.quantity - 1)}
                            className="w-7 h-7 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm"
                          >
                            -
                          </button>
                          <span className="w-8 h-7 flex items-center justify-center text-sm bg-white">
                            {item.quantity}
                          </span>
                          <button 
                            onClick={() => onUpdateQuantity(item, item.quantity + 1)}
                            className="w-7 h-7 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm"
                          >
                            +
                          </button>
                        </div>
                        {/* Remove button */}
                        <button 
                          onClick={() => onRemoveItem(item)}
                          className="w-7 h-7 flex items-center justify-center text-red-500 hover:bg-red-50 rounded"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {/* Item total */}
                    <div className="text-xs text-gray-500 mt-1">
                      סה"כ פריט: ₪{(item.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Expanded footer */}
          <div className="border-t bg-white p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-gray-900">סה"כ:</span>
              <span className="font-bold text-lg text-blue-600">₪{total.toFixed(2)}</span>
            </div>
            <button 
              onClick={onGoToPayment}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded font-medium"
            >
              מעבר לתשלום ({itemCount} פריטים)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FloatingCart; 