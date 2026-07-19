import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import { usePickupSpot } from '../../contexts/PickupSpotContext';
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

const MarketBasketIcon = () => (
  <svg
    className="mp-menu-cart-icon"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 10h15l-1.5 9H7.5L6 10z" />
    <path d="M6 10L5 4H2" />
    <path d="M9 14h6" />
    <path d="M10 6h4" />
  </svg>
);

const CommunityPinIcon = () => (
  <svg
    className="mp-menu-community-icon"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 21s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

const MarketplaceMenu = () => {
  const { userLoggedIn, userRole } = useAuth();
  const { selectedPickupSpot } = usePickupSpot();
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

  const communityLabel = selectedPickupSpot || 'בחרו קהילה';

  const renderCommunityChip = () => {
    if (!isCommunityShop) return null;
    return (
      <Link
        to="/community-marketplace#community-filter"
        className={`mp-menu-community${selectedPickupSpot ? '' : ' is-empty'}`}
        title="שינוי קהילה"
      >
        <CommunityPinIcon />
        <span className="mp-menu-community-label">אתם בשוק: {communityLabel}</span>
      </Link>
    );
  };

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
    const openCartFromShop = () => setIsCartOpen(true);
    window.addEventListener('marketplace-open-cart', openCartFromShop);
    return () => window.removeEventListener('marketplace-open-cart', openCartFromShop);
  }, []);

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
            <span className="mp-menu-brand-title">שוק הבסטות</span>
            <span className="mp-menu-brand-sub">מהשכונה לשכונה</span>
          </Link>

          {renderCommunityChip()}

          <nav className="mp-menu-nav" aria-label="תפריט שוק הבסטות">
            {renderNavLinks()}
          </nav>

          <div className="mp-menu-actions">
            {showMarketplaceCart && (
              <button
                type="button"
                className="mp-menu-cart-btn"
                onClick={() => setIsCartOpen((open) => !open)}
                aria-label={`סל השוק${marketplaceTotalItems > 0 ? `, ${marketplaceTotalItems} פריטים` : ''}`}
                aria-expanded={isCartOpen}
              >
                <MarketBasketIcon />
                <span className="mp-menu-cart-btn-label">סל השוק</span>
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
          {isCommunityShop && (
            <div className="mp-menu-drawer-community">{renderCommunityChip()}</div>
          )}
          {renderNavLinks()}
          <div className="mp-menu-mobile-divider mp-menu-mobile-only">
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
