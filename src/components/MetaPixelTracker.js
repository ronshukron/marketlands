import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../utils/metaPixel';

const MetaPixelTracker = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    trackPageView(`${pathname}${search || ''}`);
  }, [pathname, search]);

  return null;
};

export default MetaPixelTracker;
