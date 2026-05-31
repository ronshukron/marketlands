import React from 'react';
import { Link } from 'react-router-dom';
import { MARKETPLACE_FEATURED_STORES } from '../../data/marketplaceFeaturedStores';
import BastaStoreCard from './BastaStoreCard';
import './marketplace.css';

const BusinessCardGrid = ({ stores = [], loading = false }) => {
  const featuredStores = MARKETPLACE_FEATURED_STORES;
  const hasCommunityStores = stores.length > 0;
  const showEmptyOnly = !loading && !hasCommunityStores && featuredStores.length === 0;

  if (loading) {
    return (
      <div className="mp-grid-bastot">
        {featuredStores.map((store) => (
          <BastaStoreCard key={store.id} store={store} featured />
        ))}
        {[1, 2, 3].map((item) => (
          <div key={item} className="mp-skeleton" />
        ))}
      </div>
    );
  }

  if (showEmptyOnly) {
    return (
      <div className="mp-empty">
        <h3 className="mp-empty-title">עדיין אין בסטות בשוק</h3>
        <p className="mp-empty-text">
          כשחקלאים ויצרנים מקומיים יפתחו בסטה — היא תופיע כאן.
        </p>
        <Link to="/local-business-register" className="mp-btn mp-btn-wood" style={{ marginTop: '1rem' }}>
          רוצה לפתוח בסטה בשוק?
        </Link>
      </div>
    );
  }

  return (
    <div className="mp-grid-bastot">
      {featuredStores.map((store) => (
        <BastaStoreCard key={store.id} store={store} featured />
      ))}
      {stores.map((store) => (
        <BastaStoreCard key={store.id} store={store} />
      ))}
    </div>
  );
};

export default BusinessCardGrid;
