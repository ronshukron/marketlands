import React from 'react';
import { useLocation } from 'react-router-dom';
import { isMarketplacePath } from '../utils/marketplaceRoutes';
import Menu from './Menu';
import MarketplaceMenu from './marketplace/MarketplaceMenu';

/** Renders the site menu or the dedicated marketplace menu based on the current URL. */
const AppMenu = () => {
  const { pathname } = useLocation();
  return isMarketplacePath(pathname) ? <MarketplaceMenu /> : <Menu />;
};

export default AppMenu;
