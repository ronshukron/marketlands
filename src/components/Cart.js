import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import Swal from 'sweetalert2';

const Cart = ({ isOpen, onClose }) => {
  const { cartItems, removeItem, updateQuantity, cartTotal } = useCart();
  const navigate = useNavigate();

  const handleCheckout = () => {
    if (cartItems.length === 0) {
      Swal.fire('הסל ריק', 'אנא הוסף פריטים לסל לפני המעבר לתשלום.', 'warning');
      return;
    }

    // Navigate to order confirmation page
    navigate('/order-confirmation', {
      state: {
        cartProducts: cartItems,
      },
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-xl z-50 transform transition-all duration-300 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header with improved close button */}
        <div className="flex justify-between items-center p-3 border-b border-gray-100">
          <h2 className="text-base font-medium text-gray-800">סל הקניות</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-white-600 hover:bg-gray-100 transition-colors"
            aria-label="סגור סל"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="2 2 20 20" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Cart Items - More compact and elegant */}
        <div className="flex-grow overflow-y-auto">
          {cartItems.length === 0 ? (
            <div className="text-center text-gray-500 py-8 px-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm">הסל שלך ריק</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {cartItems.map((item) => (
                <div key={item.uid} className="flex items-center py-3 px-3 hover:bg-gray-50 transition-colors">
                  {/* Smaller product image */}
                  <div className="flex-shrink-0 ml-3">
                    {item.images && item.images.length > 0 ? (
                      <img 
                        src={item.images[0]} 
                        alt={item.name} 
                        className="w-12 h-12 object-cover rounded-md border border-gray-100 shadow-sm" 
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center">
                        <span className="text-gray-400 text-xs">אין תמונה</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Product details - More compact layout */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-800 truncate">{item.name}</h4>
                    {item.selectedOption && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {item.selectedOption}
                      </p>
                    )}
                    <p className="text-xs font-medium text-blue-600 mt-1">₪{item.price.toFixed(2)}</p>
                  </div>
                  
                  {/* Improved quantity controls with more visible icons */}
                  <div className="flex items-center space-x-1 space-x-reverse mr-2">
                    <button 
                      onClick={() => updateQuantity(item.uid, item.quantity - 1)} 
                      className="text-white-100 hover:bg-gray-100 transition-colors w-9 h-7 rounded-full flex items-center justify-center border border-gray-200"
                      aria-label="הפחת כמות"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="5 0 10 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <span className="text-xs font-medium text-gray-700 w-5 text-center">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.uid, item.quantity + 1)} 
                      className="text-white-600 hover:bg-gray-100 transition-colors w-9 h-7 rounded-full flex items-center justify-center border border-gray-200"
                      aria-label="הוסף כמות"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="5 0 10 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Improved delete button with more visible icon */}
                  <button
                    onClick={() => removeItem(item.uid)}
                    className="flex-shrink-0 w-12 h-10 flex items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition-colors ml-1 mr-4"
                    title="הסר פריט"
                    aria-label="הסר פריט"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="5 0 10 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer - Cleaner and more elegant */}
        {cartItems.length > 0 && (
          <div className="p-3 border-t border-gray-100 bg-white shadow-inner">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-gray-800">סה"כ לתשלום:</span>
              <span className="text-sm font-semibold text-blue-600">₪{cartTotal.toFixed(2)}</span>
            </div>
            <button
              onClick={handleCheckout}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-md text-sm font-medium transition-colors shadow-sm"
            >
              לסיכום הזמנה
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Cart; 