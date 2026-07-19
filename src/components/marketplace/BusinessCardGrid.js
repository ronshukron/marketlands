import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MARKETPLACE_FEATURED_STORES } from '../../data/marketplaceFeaturedStores';
import BastaStoreCard from './BastaStoreCard';
import './marketplace.css';

const matchesPinnedStore = (store, pinned) => {
  const keys = [store.id, store.businessId, store.title, store.businessName].filter(Boolean);
  const pinnedKeys = [pinned.id, pinned.businessId, pinned.title, pinned.businessName].filter(Boolean);
  return keys.some((key) => pinnedKeys.includes(key));
};

const BusinessCardGrid = ({ stores = [], loading = false, hidePinned = false }) => {
  const pinnedStores = hidePinned ? [] : MARKETPLACE_FEATURED_STORES;

  const communityStores = useMemo(() => {
    if (pinnedStores.length === 0) return stores;
    return stores.filter(
      (store) => !pinnedStores.some((pinned) => matchesPinnedStore(store, pinned))
    );
  }, [stores, pinnedStores]);

  const hasAnyStores = pinnedStores.length > 0 || communityStores.length > 0;
  const showEmptyOnly = !loading && !hasAnyStores;

  if (loading) {
    return (
      <div className="mp-stall-mosaic">
        {pinnedStores.map((store) => (
          <BastaStoreCard key={store.id} store={store} />
        ))}
        {[1, 2, 3].map((item) => (
          <div key={`sk-${item}`} className="mp-skeleton mp-skeleton-stall" />
        ))}
      </div>
    );
  }

  if (showEmptyOnly) {
    return (
      <div className="mp-market-empty">
        <h3 className="mp-market-empty-title">עדיין אין בסטות בשוק</h3>
        <p className="mp-market-empty-text">
          כשחקלאים ויצרנים מקומיים יפתחו בסטה — היא תופיע כאן בשכונה שלכם.
        </p>
        <Link to="/local-business-register" className="mp-btn mp-btn-wood mp-mt-4">
          פתחו בסטה בשוק
        </Link>
      </div>
    );
  }

  return (
    <div className="mp-stall-mosaic">
      {pinnedStores.map((store) => (
        <BastaStoreCard key={store.id} store={store} />
      ))}
      {communityStores.map((store) => (
        <BastaStoreCard key={store.id} store={store} />
      ))}
    </div>
  );
};

export default BusinessCardGrid;
