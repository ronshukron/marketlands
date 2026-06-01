import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import { doSignOut } from '../../firebase/auth';
import { useMarketplaceCart } from '../../contexts/MarketplaceCartContext';
import {
  MARKETPLACE_LOGIN_PATH,
  MARKETPLACE_REGISTER_PATH,
  isCommunityMarketplacePath,
  isSellerMarketplacePath,
} from '../../utils/marketplaceRoutes';
import { isMarketplaceSellerRole } from '../../utils/marketplaceSellerRole';
import MarketplaceCart from './MarketplaceCart';
import './MarketplaceMenu.css';

const navLinkClass = (active) => `mp-menu-link${active ? ' is-active' : ''}`;

const MarketplaceMenu = () => {
  const { userLoggedIn, userRole } = useAuth();
  const { totalItems: marketplaceTotalItems } = useMarketplaceCart();
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const isCommunityShop = isCommunityMarketplacePath(location.pathname);
  const isSellerArea = isSellerMarketplacePath(location.pathname);
  const isSeller = userLoggedIn && isMarketplaceSellerRole(userRole);

  const isActive = (path, { prefix = false } = {}) =>
    prefix ? location.pathname.startsWith(path) : location.pathname === path;

  const isCommunityBrowseActive =
    location.pathname === '/community-marketplace' ||
    /^\/community-marketplace\/store\/[^/]+/.test(location.pathname);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleLogout = async () => {
    try {
      await doSignOut();
      navigate('/community-marketplace');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const showMarketplaceCart = isCommunityShop;

  const shopperLinks = (
    <>
      <Link
        to="/community-marketplace"
        className={navLinkClass(isCommunityBrowseActive)}
      >
        שוק הבסטות
      </Link>
      {userLoggedIn && (
        <Link
          to="/community-marketplace/my-orders"
          className={navLinkClass(isActive('/community-marketplace/my-orders'))}
        >
          ההזמנות שלי
        </Link>
      )}
    </>
  );

  /** Seller browsing the public shop — marketplace routes only (no legacy /my-orders). */
  const sellerBrowsingShopLinks = (
    <>
      <Link
        to="/community-marketplace"
        className={navLinkClass(isCommunityBrowseActive)}
      >
        שוק הבסטות
      </Link>
      <Link
        to="/marketplace/orders"
        className={navLinkClass(isActive('/marketplace/orders'))}
      >
        הזמנות מהשוק
      </Link>
      <Link
        to="/marketplace/dashboard"
        className={navLinkClass(isActive('/marketplace', { prefix: true }) && isSellerArea)}
      >
        ניהול הבסטה
      </Link>
    </>
  );

  const sellerLinks = (
    <>
      <Link
        to="/marketplace/dashboard"
        className={navLinkClass(isActive('/marketplace/dashboard'))}
      >
        לוח הבסטה
      </Link>
      <Link
        to="/marketplace/dashboard?section=promotions"
        className={navLinkClass(
          isActive('/marketplace/dashboard') && location.search.includes('section=promotions')
        )}
      >
        קידומים שבועיים
      </Link>
      <Link
        to="/marketplace/my-store"
        className={navLinkClass(isActive('/marketplace/my-store'))}
      >
        דף הבסטה
      </Link>
      <Link
        to="/marketplace/products"
        className={navLinkClass(isActive('/marketplace/products', { prefix: true }))}
      >
        מוצרים
      </Link>
      <Link
        to="/marketplace/orders"
        className={navLinkClass(isActive('/marketplace/orders'))}
      >
        הזמנות מהשוק
      </Link>
      <Link
        to="/community-marketplace"
        className={navLinkClass(isActive('/community-marketplace', { prefix: true }) && isCommunityShop)}
      >
        צפייה בשוק
      </Link>
    </>
  );

  const renderNavLinks = () => {
    if (isSeller) {
      return isSellerArea ? sellerLinks : sellerBrowsingShopLinks;
    }
    return shopperLinks;
  };

  const authBlockDesktop = userLoggedIn ? (
    <button type="button" className="mp-menu-btn mp-menu-btn-logout" onClick={handleLogout}>
      התנתק
    </button>
  ) : (
    <>
      <Link to={MARKETPLACE_LOGIN_PATH} className="mp-menu-btn mp-menu-btn-ghost">
        התחברות
      </Link>
      <Link to={MARKETPLACE_REGISTER_PATH} className="mp-menu-btn mp-menu-btn-wood">
        הרשמה
      </Link>
    </>
  );

  return (
    <>
      <header
        ref={menuRef}
        className={`mp-menu-header${isScrolled ? ' is-scrolled' : ''}`}
        dir="rtl"
      >
        <div className="mp-menu-inner">
          <Link to="/community-marketplace" className="mp-menu-brand">
            <span className="mp-menu-brand-title">Basta Basket</span>
            <span className="mp-menu-brand-sub">שוק הבסטות</span>
          </Link>

          <nav className="mp-menu-nav" aria-label="תפריט שוק הבסטות">
            {renderNavLinks()}
          </nav>

          <div className="mp-menu-actions">
            {showMarketplaceCart && (
              <button
                type="button"
                className="mp-menu-cart-btn"
                onClick={() => setIsCartOpen((open) => !open)}
                aria-label="סל הבסטה"
              >
                <span aria-hidden="true">🧺</span>
                {marketplaceTotalItems > 0 && (
                  <span className="mp-menu-cart-badge">{marketplaceTotalItems}</span>
                )}
              </button>
            )}

            <div className="hidden md:flex items-center gap-2">{authBlockDesktop}</div>

            <button
              type="button"
              className="mp-menu-hamburger"
              onClick={() => setIsOpen((open) => !open)}
              aria-expanded={isOpen}
              aria-label="תפריט"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        <div className={`mp-menu-drawer${isOpen ? ' is-open' : ''}`}>
          {renderNavLinks()}
          <div className="mp-menu-mobile-only mt-3 pt-3 border-t border-[#e0d4c0] flex flex-col gap-2">
            {userLoggedIn ? (
              <button type="button" className="mp-menu-btn mp-menu-btn-logout w-full" onClick={handleLogout}>
                התנתק
              </button>
            ) : (
              <>
                <Link to={MARKETPLACE_LOGIN_PATH} className="mp-menu-btn mp-menu-btn-ghost w-full text-center">
                  התחברות לשוק
                </Link>
                <Link to={MARKETPLACE_REGISTER_PATH} className="mp-menu-btn mp-menu-btn-wood w-full text-center">
                  הרשמה לשוק
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mp-menu-spacer" aria-hidden="true" />

      {showMarketplaceCart && (
        <MarketplaceCart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      )}
    </>
  );
};

export default MarketplaceMenu;
