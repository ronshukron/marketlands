import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';

const MobileNav = () => {
  const { cartItems, getTotalQuantity } = useCart();

  const totalItems = getTotalQuantity();

  const closeMenu = () => {
    // Implement the logic to close the menu
  };

  return (
    <div className="flex items-center justify-center">
      <Link 
        to="/cart" 
        className="flex items-center justify-center flex-col text-center p-2"
        onClick={closeMenu}
      >
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          {totalItems > 0 && (
            <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
              {totalItems}
            </span>
          )}
        </div>
        <span className="text-xs mt-1">עגלה</span>
      </Link>
    </div>
  );
};

export default MobileNav; 