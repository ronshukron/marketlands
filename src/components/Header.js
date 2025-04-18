import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/authContext';

const Header = () => {
  const { cartItems, getTotalQuantity } = useCart();
  const { userLoggedIn, currentUser, handleLogout } = useAuth();
  
  const totalItems = getTotalQuantity();

  return (
    <header className="bg-white shadow-md" dir="rtl">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          {/* Logo with Hebrew text */}
          <Link to="/" className="flex items-center">
            {/* Market basket icon */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-600 ml-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h20l-4 16H6L2 3z"></path>
              <path d="M4 3l2 4"></path>
              <path d="M22 3l-2 4"></path>
              <path d="M6 7h12"></path>
              <path d="M6 11V7"></path>
              <path d="M18 11V7"></path>
              <path d="M12 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path>
            </svg>
            <span className="text-2xl font-bold text-blue-600 font-rubik logo-text">בסטה בסקט</span>
          </Link>
          
          <div className="flex items-center space-x-4 space-x-reverse">
            {/* Navigation Links */}
            {userLoggedIn ? (
              <>
                <Link to="/my-orders" className="text-gray-700 hover:text-blue-600 transition-colors px-3">ההזמנות שלי</Link>
                <Link to="/profile" className="text-gray-700 hover:text-blue-600 transition-colors px-3">פרופיל</Link>
                <button onClick={handleLogout} className="text-gray-700 hover:text-blue-600 transition-colors px-3">התנתק</button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-gray-700 hover:text-blue-600 transition-colors px-3">התחברות</Link>
                <Link to="/user-register" className="text-gray-700 hover:text-blue-600 transition-colors px-3">הרשמה</Link>
              </>
            )}
            
            {/* Enhanced Cart Button */}
            <Link 
              to="/cart" 
              className="relative flex items-center bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-full transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="font-medium">העגלה שלי</span>
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                  {totalItems}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header; 