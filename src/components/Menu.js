// src/components/Menu.js

import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/authContext';
import { doSignOut } from '../firebase/auth';
import { useCart } from '../contexts/CartContext';
import { useSaleMode } from '../contexts/SaleModeContext';
import Cart from './Cart';
import './Menu.css';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const Menu = () => {
  const { userLoggedIn, userRole, currentUser } = useAuth();
  const { totalItems } = useCart();
  const { setSaleMode } = useSaleMode();
  const [isOpen, setIsOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);
  const [isIndependent, setIsIndependent] = useState(false);

  const navigateToCategory = (cat) => {
    // Close mobile menu if open
    setIsOpen(false);
    
    // Switch to weekly mode (in case user is in independent mode)
    setSaleMode('weekly');
    
    // Navigate to home with category
    navigate({ pathname: '/', search: `?category=${encodeURIComponent(cat)}` });
    
    // Scroll to store section after navigation
    setTimeout(() => {
      const storeSection = document.getElementById('store-section');
      if (storeSection) {
        storeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

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
      if (isOpen && menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Detect independent business
  useEffect(() => {
    const checkIndependent = async () => {
      if (currentUser?.uid && userRole === 'business') {
        try {
          const ref = doc(db, 'businesses', currentUser.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const data = snap.data();
            setIsIndependent(Boolean(data?.isIndependent));
          } else {
            setIsIndependent(false);
          }
        } catch (e) {
          console.error('Error checking isIndependent:', e);
          setIsIndependent(false);
        }
      } else {
        setIsIndependent(false);
      }
    };
    checkIndependent();
  }, [currentUser?.uid, userRole]);

  const toggleMenu = (event) => {
    event.stopPropagation();
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
  const categories = ['הכל', 'ירקות', 'פירות', 'ירוקים', 'אחר'];

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
            <nav className="hidden md:flex items-center space-x-4 space-x-reverse">
              {/* <Link to="/" className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive('/') ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                דף הבית
              </Link> */}
              <Link to="/contact" className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive('/contact') ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                צור קשר
              </Link>
              {/* <Link to="/business-register" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/business-register') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    הירשמו כעסק
              </Link> */}
              
              {userLoggedIn && userRole === 'coordinator' && (
                <>
                  <Link to="/producers" className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive('/producers') ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    ספקים
                  </Link>
                  <Link to="/create-order" className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive('/create-order') ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    יצירת הזמנה
                  </Link>
                  <Link to="/dashboard" className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive('/dashboard') ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    לוח הזמנות
                  </Link>
                  <Link to="/ongoing-order-coordinators" className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive('/ongoing-order-coordinators') ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    מכירות חיות
                  </Link>
                </>
              )}
              
              {userLoggedIn && userRole === 'user' && (
                <>
                  <Link to="/my-orders" className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive('/my-orders') ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                    ההזמנות שלי
                  </Link>
                  <Link to="/my-volunteer-spots" className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive('/my-volunteer-spots') ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    נקודות האיסוף שלי
                  </Link>
                </>
              )}
              
              {userLoggedIn && userRole === 'business' && (
                <>
                  {isIndependent && (
                    <Link to="/independent-orders" className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive('/independent-orders') ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      הזמנות עצמאיות
                    </Link>
                  )}
                  {!isIndependent && (
                    <Link to="/Business-DashBoard" className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive('/Business-DashBoard') ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                      </svg>
                      מודעות מכירה שלי
                    </Link>
                  )}
                  <Link to="/Business-Products" className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive('/Business-Products') ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    המוצרים שלי
                  </Link>
                  {!isIndependent && (
                    <Link to="/dashboard" className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive('/dashboard') ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                      </svg>
                      לוח מודעות
                    </Link>
                  )}
                  {!isIndependent && (
                    <Link to="/business/always-on-cutoffs" className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive('/business/always-on-cutoffs') ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      זמני חיתוך
                    </Link>
                  )}
                  {businessId && (
                    <Link to={`/store/${businessId}`} className={`flex items-center gap-2 text-sm font-medium transition-colors py-2 px-3 rounded-lg ${isActive(`/store/${businessId}`) ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      החנות שלי
                    </Link>
                  )}
                </>
              )}
              
              {/* {!userLoggedIn && (
                <Link to="/coordinator-landing" className={`text-sm font-medium transition-colors py-1 px-1 ${isActive('/coordinator-landing') ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-700 hover:text-blue-600'}`}>
                  לרכזי קהילות
                </Link>
              )} */}
            </nav>

            {/* Category tabs - desktop (now with icons) - Hidden for business accounts */}
            {userRole !== 'business' && (
              <div className="hidden md:flex items-center gap-2 mr-4">
                <button
                  onClick={() => navigateToCategory('הכל')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-sm transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  הכל
                </button>
                <button
                  onClick={() => navigateToCategory('ירקות')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-green-50 hover:bg-green-100 text-green-700 hover:text-green-800 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  ירקות
                </button>
                <button
                  onClick={() => navigateToCategory('פירות')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-orange-50 hover:bg-orange-100 text-orange-700 hover:text-orange-800 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  פירות
                </button>
                <button
                  onClick={() => navigateToCategory('ירוקים')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  ירוקים
                </button>
                <button
                  onClick={() => navigateToCategory('אחר')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-800 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  אחר
                </button>
              </div>
            )}

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
            className={`md:hidden transition-all duration-300 ease-in-out ${
              isOpen 
                ? 'max-h-[80vh] opacity-100 mt-3 pb-3 overflow-y-auto' 
                : 'max-h-0 opacity-0 overflow-hidden mt-0 pb-0'
            }`}
          >
            <div className="pt-2 space-y-1 border-t border-gray-200">
              {/* Category tabs - mobile (top with icons) - Hidden for business accounts */}
              {userRole !== 'business' && (
                <div className="px-3 pb-3 mb-2 border-b border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase">קטגוריות</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => navigateToCategory('הכל')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-sm transition-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                      הכל
                    </button>
                    <button
                      onClick={() => navigateToCategory('ירקות')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-green-50 hover:bg-green-100 text-green-700 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                      ירקות
                    </button>
                    <button
                      onClick={() => navigateToCategory('פירות')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-orange-50 hover:bg-orange-100 text-orange-700 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      פירות
                    </button>
                    <button
                      onClick={() => navigateToCategory('ירוקים')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      ירוקים
                    </button>
                    <button
                      onClick={() => navigateToCategory('אחר')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors col-span-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      אחר
                    </button>
                  </div>
                </div>
              )}

              <Link to="/" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                דף הבית
              </Link>
              {/* <Link to="/landing" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/landing') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                הדרכה
              </Link> */}
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
                <>
                  <Link to="/my-orders" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/my-orders') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    ההזמנות שלי
                  </Link>
                  <Link to="/my-volunteer-spots" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/my-volunteer-spots') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    נקודות האיסוף שלי
                  </Link>
                </>
              )}
              
              {userLoggedIn && userRole === 'business' && (
                <>
                  {isIndependent && (
                    <Link to="/independent-orders" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/independent-orders') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                      הזמנות עצמאיות
                    </Link>
                  )}
                  {!isIndependent && (
                    <Link to="/Business-DashBoard" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/Business-DashBoard') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                      מודעות מכירה שלי
                    </Link>
                  )}
                  <Link to="/Business-Products" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/Business-Products') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                    המוצרים שלי
                  </Link>
                  {!isIndependent && (
                    <Link to="/dashboard" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/dashboard') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                      לוח מודעות
                    </Link>
                  )}
                  {!isIndependent && (
                    <Link to="/business/always-on-cutoffs" className={`block px-3 py-2 rounded-md text-base font-medium ${isActive('/business/always-on-cutoffs') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-blue-600'}`}>
                      זמני חיתוך
                    </Link>
                  )}
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
