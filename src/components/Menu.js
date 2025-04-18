// src/components/Menu.js

import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/authContext';
import { doSignOut } from '../firebase/auth';
import { useCart } from '../contexts/CartContext';
import Cart from './Cart';
import './Menu.css';

const Menu = () => {
  const { userLoggedIn, userRole, currentUser } = useAuth();
  const { totalItems } = useCart();
  const [isOpen, setIsOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);

  // Handle scrolling effect
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setIsScrolled(scrollPosition > 20);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const toggleCart = () => {
    setIsCartOpen(!isCartOpen);
  };

  const handleLogout = async () => {
    try {
      await doSignOut();
      navigate('/');
      console.log("Successfully logged out");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const isActive = (path) => {
    return location.pathname === path;
  };

  const businessId = currentUser && userRole === 'business' ? currentUser.uid : null;

  return (
    <>
      <header 
        className={`fixed top-0 left-0 right-0 z-30 transition-all duration-300 ${
          isScrolled ? 'bg-white shadow-md py-2' : 'bg-white/90 py-3'
        }`}
        dir="rtl"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            {/* Logo and brand */}
            <div className="flex items-center">
              <Link to="/" className="flex items-center gap-2">
                <span className="logo-text font-rubik">בסטה בסקט</span>
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex space-x-6 space-x-reverse">
              <Link to="/" className={`text-sm font-medium transition-colors py-1 px-1 ${isActive('/') ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                דף הבית
              </Link>
              <Link to="/contact" className={`text-sm font-medium transition-colors py-1 px-1 ${isActive('/contact') ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                צור קשר
              </Link>
              
              {userLoggedIn && userRole === 'coordinator' && (
                <>
                  <Link to="/producers" className={`text-sm font-medium transition-colors py-1 px-1 ${isActive('/producers') ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                    ספקים
                  </Link>
                  <Link to="/create-order" className={`text-sm font-medium transition-colors py-1 px-1 ${isActive('/create-order') ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                    יצירת הזמנה
                  </Link>
                  <Link to="/dashboard" className={`text-sm font-medium transition-colors py-1 px-1 ${isActive('/dashboard') ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                    לוח הזמנות
                  </Link>
                  <Link to="/ongoing-order-coordinators" className={`text-sm font-medium transition-colors py-1 px-1 ${isActive('/ongoing-order-coordinators') ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                    מכירות חיות
                  </Link>
                </>
              )}
              
              {userLoggedIn && userRole === 'user' && (
                <Link to="/my-orders" className={`text-sm font-medium transition-colors py-1 px-1 ${isActive('/my-orders') ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                  ההזמנות שלי
                </Link>
              )}
              
              {userLoggedIn && userRole === 'business' && (
                <>
                  <Link to="/Business-DashBoard" className={`text-sm font-medium transition-colors py-1 px-1 ${isActive('/Business-DashBoard') ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                    מודעות מכירה שלי
                  </Link>
                  <Link to="/Business-Products" className={`text-sm font-medium transition-colors py-1 px-1 ${isActive('/Business-Products') ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                    המוצרים שלי
                  </Link>
                  <Link to="/dashboard" className={`text-sm font-medium transition-colors py-1 px-1 ${isActive('/dashboard') ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                    לוח מודעות
                  </Link>
                  <Link to="/landing" className={`text-sm font-medium transition-colors py-1 px-1 ${isActive('/landing') ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                    הדרכה
                  </Link>
                  {businessId && (
                    <Link to={`/store/${businessId}`} className={`text-sm font-medium transition-colors py-1 px-1 ${isActive(`/store/${businessId}`) ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                      החנות שלי
                    </Link>
                  )}
                </>
              )}
              
              {!userLoggedIn && (
                <Link to="/coordinator-landing" className={`text-sm font-medium transition-colors py-1 px-1 ${isActive('/coordinator-landing') ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                  לרכזי קהילות
                </Link>
              )}
            </nav>

            {/* Right side items - cart, auth, mobile menu */}
            <div className="flex items-center space-x-3 space-x-reverse">
              {/* Cart button with market basket icon */}
              <button 
                type="button" 
                onClick={toggleCart}
                className="relative inline-flex items-center p-2 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </button>

              {/* Auth buttons - hidden on mobile */}
              <div className="hidden md:block">
                {userLoggedIn ? (
                  <button
                    onClick={handleLogout}
                    className="bg-red-100 text-red-700 hover:bg-red-200 text-sm font-medium py-2 px-3 rounded-md transition-colors"
                  >
                    התנתק
                  </button>
                ) : (
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <Link to="/login" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded-md transition-colors">
                      התחברות
                    </Link>
                    <Link to="/user-register" className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium py-2 px-3 rounded-md transition-colors">
                      הרשמה
                    </Link>
                  </div>
                )}
              </div>

              {/* Mobile menu button */}
              <button
                type="button"
                className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 focus:outline-none"
                onClick={toggleMenu}
              >
                <span className="sr-only">פתח תפריט</span>
                {isOpen ? (
                  <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          <div
            ref={menuRef}
            className={`md:hidden transition-all duration-300 ease-in-out ${
              isOpen 
                ? 'max-h-[80vh] opacity-100 mt-3 pb-3 overflow-y-auto' 
                : 'max-h-0 opacity-0 overflow-hidden mt-0 pb-0'
            }`}
          >
            <div className="pt-2 space-y-1 border-t border-gray-200">
              <Link to="/" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                דף הבית
              </Link>
              <Link to="/landing" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/landing') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                הדרכה
              </Link>
              <Link to="/contact" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/contact') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                צור קשר
              </Link>
              
              {userLoggedIn && userRole === 'coordinator' && (
                <>
                  <Link to="/producers" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/producers') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    ספקים
                  </Link>
                  <Link to="/create-order" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/create-order') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    יצירת הזמנה
                  </Link>
                  <Link to="/dashboard" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/dashboard') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    לוח הזמנות
                  </Link>
                  <Link to="/ongoing-order-coordinators" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/ongoing-order-coordinators') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    מכירות חיות
                  </Link>
                </>
              )}
              
              {userLoggedIn && userRole === 'user' && (
                <Link to="/my-orders" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/my-orders') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                  ההזמנות שלי
                </Link>
              )}
              
              {userLoggedIn && userRole === 'business' && (
                <>
                  <Link to="/Business-DashBoard" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/Business-DashBoard') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    מודעות מכירה שלי
                  </Link>
                  <Link to="/Business-Products" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/Business-Products') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    המוצרים שלי
                  </Link>
                  <Link to="/dashboard" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/dashboard') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    לוח מודעות
                  </Link>
                  {businessId && (
                    <Link to={`/store/${businessId}`} className={`block px-3 py-2 rounded-md text-base font-medium ${isActive(`/store/${businessId}`) ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                      החנות שלי
                    </Link>
                  )}
                </>
              )}
              
              {/* {!userLoggedIn && (
                <>
                  <Link to="/user-register" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/user-register') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    הירשמו כמשתמש
                  </Link>
                  <Link to="/business-register" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/business-register') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    הירשמו כעסק
                  </Link>
                  <Link to="/coordinator-landing" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/coordinator-landing') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    לרכזי קהילות
                  </Link>
                </>
              )} */}
              
              {/* {userLoggedIn && (
                <button 
                  onClick={handleLogout}
                  className="block w-full text-right px-3 py-2 rounded-md text-base font-medium text-red-700 hover:bg-red-50 hover:text-red-800"
                >
                  התנתק
                </button>
              )} */}
            </div>

            {/* Mobile menu authentication section */}
            {!userLoggedIn ? (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-2 px-3 mb-2">
                  <Link 
                    to="/login" 
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded-md transition-colors text-center"
                  >
                    התחברות
                  </Link>
                  <Link 
                    to="/user-register" 
                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium py-2 px-3 rounded-md transition-colors text-center"
                  >
                    הרשמה
                  </Link>
                </div>
                {/* <Link 
                  to="/business-register" 
                  className="block px-3 py-2 mt-2 text-center text-blue-600 hover:text-blue-800 text-sm"
                >
                  הירשמו כעסק
                </Link>
                <Link 
                  to="/coordinator-landing" 
                  className="block px-3 py-2 text-center text-blue-600 hover:text-blue-800 text-sm"
                >
                  לרכזי קהילות
                </Link> */}
              </div>
            ) : (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <button 
                  onClick={handleLogout}
                  className="w-full bg-red-100 text-red-700 hover:bg-red-200 text-sm font-medium py-2 px-3 rounded-md transition-colors mx-3"
                >
                  התנתק
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      
      {/* Spacer to prevent content from being hidden under fixed header */}
      <div className="h-16 md:h-20"></div>
      
      {/* Cart component */}
      <Cart isOpen={isCartOpen} onClose={toggleCart} />
    </>
  );
};

export default Menu;
