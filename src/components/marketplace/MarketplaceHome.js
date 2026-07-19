import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePickupSpot } from '../../contexts/PickupSpotContext';
import {
  getMarketplacePromotions,
  getMarketplaceSettings,
  getMarketplaceStores,
} from '../../services/marketplaceService';
import BusinessCardGrid from './BusinessCardGrid';
import CommunityFilterToggle from './CommunityFilterToggle';
import PromotionHighlights from './PromotionHighlights';
import MarketplaceWaitlistSection from './MarketplaceWaitlistSection';
import './marketplace.css';

const GateBasketIcon = () => (
  <svg
    className="mp-gate-eyebrow-icon"
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
  </svg>
);

const StallCtaIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8 28 L32 12 L56 28 V52 H8 Z" />
    <path d="M20 52 V36 H44 V52" />
    <path d="M8 28 H56" />
    <path d="M26 20 L32 12 L38 20" />
  </svg>
);

const MarketplaceHome = ({ hideMainStore = false }) => {
  const { selectedPickupSpot, updatePickupSpot, hasLoadedFromStorage } = usePickupSpot();
  const [communityName, setCommunityName] = useState('');
  const [communityMode, setCommunityMode] = useState('own');
  const [stores, setStores] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (hasLoadedFromStorage) {
      setCommunityName(selectedPickupSpot || '');
    }
  }, [hasLoadedFromStorage, selectedPickupSpot]);

  useEffect(() => {
    const loadMarketplace = async () => {
      setLoading(true);
      setError('');

      try {
        const [config, nextStores, nextPromotions] = await Promise.all([
          getMarketplaceSettings(),
          getMarketplaceStores({ communityName, communityMode }),
          getMarketplacePromotions({ communityName, communityMode }),
        ]);

        setSettings(config);
        setStores(nextStores);
        setPromotions(nextPromotions.slice(0, config.highlightLimit || 8));
      } catch (err) {
        console.error('Failed to load marketplace', err);
        const isPermission = err?.code === 'permission-denied';
        setError(
          isPermission
            ? 'אין הרשאה לטעון את שוק הבסטות. יש לעדכן את חוקי Firestore (ראו docs/Marketplace-Firestore-Rules.snippet.txt).'
            : 'לא הצלחנו לטעון את השוק. נסו שוב בעוד רגע.'
        );
      } finally {
        setLoading(false);
      }
    };

    loadMarketplace();
  }, [communityName, communityMode]);

  const scopeLabel = useMemo(() => {
    if (communityMode === 'all') return 'כל השכונות';
    return communityName || 'השכונה שלי';
  }, [communityMode, communityName]);

  const handleCommunityChange = (nextCommunity) => {
    setCommunityName(nextCommunity);
    updatePickupSpot(nextCommunity);
  };

  return (
    <div className="mp-page" dir="rtl">
      <section className="mp-gate" aria-labelledby="mp-gate-title">
        <div className="mp-gate-topo" aria-hidden="true" />
        <div className="mp-gate-inner">
          <p className="mp-gate-eyebrow">
            <GateBasketIcon />
            שוק הבסטות · מהשכונה לשכונה
          </p>
          <h1 id="mp-gate-title" className="mp-gate-title">
            מרקטפלייס לעסקים מקומיים
          </h1>
          <p className="mp-gate-subtitle">
בחרו קהילה, גלו את הבסטות השבועיות והזמינו 
          </p>

          <CommunityFilterToggle
            variant="rail"
            communityName={communityName}
            communityMode={communityMode}
            onCommunityChange={handleCommunityChange}
            onModeChange={setCommunityMode}
          />

          <div className="mp-gate-actions">
            <a href="#weekly-promotions" className="mp-btn mp-btn-primary">
              הזמנות שבועיות
            </a>
            <a href="#stalls" className="mp-btn mp-btn-secondary">
              הבסטות
            </a>
          </div>
        </div>
      </section>

      <main className="mp-main mp-stack">
        {settings?.enabled === false && (
          <div className="mp-alert mp-alert-warn">
            השוק כבוי כרגע בהגדרות המערכת.
          </div>
        )}

        {error && (
          <div className="mp-alert mp-alert-error">{error}</div>
        )}

        {settings?.waitlistEnabled !== false && <MarketplaceWaitlistSection />}

        <section id="weekly-promotions" aria-labelledby="weekly-section-title">
          <div className="mp-section-head">
            <div>
              <p className="mp-section-kicker">{scopeLabel}</p>
              <h2 id="weekly-section-title" className="mp-section-title mp-section-title-chalk">
                הזמנות שבועיות
              </h2>
              <p className="mp-section-note">
                הזמנות מצטברות מבסטות בשכונה — גללו את לוח השוק
              </p>
            </div>
          </div>
          <PromotionHighlights promotions={promotions} loading={loading} />
        </section>

        <section id="stalls" aria-labelledby="stalls-section-title">
          <div className="mp-section-head">
            <div>
              <p className="mp-section-kicker">{scopeLabel}</p>
              <h2 id="stalls-section-title" className="mp-section-title mp-section-title-chalk">
                הבסטות
              </h2>
              <p className="mp-section-note">
                כרטיסי בסטה בשכונה — לחצו לדף החנות והזמנות שבועיות
              </p>
            </div>
          </div>
          <BusinessCardGrid stores={stores} loading={loading} hidePinned={hideMainStore} />
        </section>

        <aside className="mp-cta-stall" aria-labelledby="cta-stall-title">
          <div className="mp-cta-stall-art">
            <StallCtaIcon />
          </div>
          <div>
            <h2 id="cta-stall-title" className="mp-cta-stall-title">
              חקלאי, יצרן או משק משפחתי?
            </h2>
            <p className="mp-cta-stall-text">
              פתחו בסטה משלכם בשוק השכונתי — מכירה שבועית, מוצרים ושכנים שמכירים אתכם בשם.
            </p>
          </div>
          <div className="mp-cta-stall-action">
            <Link to="/local-business-register" className="mp-btn mp-btn-wood">
              פתחו בסטה בשוק
            </Link>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default MarketplaceHome;
