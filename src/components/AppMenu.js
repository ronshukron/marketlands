import React, { Suspense, lazy } from 'react';
import { useLocation } from 'react-router-dom';
import { isMarketplacePath } from '../utils/marketplaceRoutes';
import Menu from './Menu';

const MarketplaceMenu = lazy(() => import('./marketplace/MarketplaceMenu'));

/** Renders the site menu or the dedicated marketplace menu based on the current URL. */
const AppMenu = () => {
  const { pathname } = useLocation();
  if (isMarketplacePath(pathname)) {
    return (
      <Suspense fallback={null}>
        <MarketplaceMenu />
      </Suspense>
    );
  }
  return <Menu />;
};

export default AppMenu;
