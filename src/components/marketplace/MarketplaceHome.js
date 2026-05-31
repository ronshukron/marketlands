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
import './marketplace.css';

const MarketplaceHome = () => {
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
    if (communityMode === 'all') return 'כל הקהילות';
    return communityName || 'הקהילה שלי';
  }, [communityMode, communityName]);

  const handleCommunityChange = (nextCommunity) => {
    setCommunityName(nextCommunity);
    updatePickupSpot(nextCommunity);
  };

  return (
    <div className="mp-page" dir="rtl">
      <section className="mp-hero">
        <div className="mp-hero-inner">
          <p className="mp-eyebrow">שוק הבסטות</p>
          <h1 className="mp-hero-title">
            בסטות מקומיות והזמנות שבועיות מהשדה אליכם
          </h1>
          <p className="mp-hero-subtitle">
            התחילו מהקהילה שלכם, גלו בסטות מקהילות אחרות, והזמינו ישירות בתשלום ידני — ביט, מזומן ועוד.
          </p>
          <div className="mp-hero-actions">
            <a href="#weekly-promotions" className="mp-btn mp-btn-primary">
              הזמנות שבועיות
            </a>
            <a href="#bastot" className="mp-btn mp-btn-secondary">
              הבסטות בשוק
            </a>
          </div>
        </div>
      </section>

      <main className="mp-main mp-stack">
        <CommunityFilterToggle
          communityName={communityName}
          communityMode={communityMode}
          onCommunityChange={handleCommunityChange}
          onModeChange={setCommunityMode}
        />

        {settings?.enabled === false && (
          <div className="mp-alert mp-alert-warn">
            השוק כבוי כרגע בהגדרות המערכת.
          </div>
        )}

        {error && (
          <div className="mp-alert mp-alert-error">{error}</div>
        )}

        <section id="weekly-promotions">
          <div className="mp-section-head">
            <div>
              <p className="mp-section-kicker">{scopeLabel}</p>
              <h2 className="mp-section-title">הזמנות שבועיות מודגשות</h2>
            </div>
            <Link to="/local-business-register" className="mp-link">
              רוצה לפתוח בסטה בשוק?
            </Link>
          </div>
          <PromotionHighlights promotions={promotions} loading={loading} />
        </section>

        <section id="bastot">
          <div className="mp-section-head">
            <div>
              <p className="mp-section-kicker">{scopeLabel}</p>
              <h2 className="mp-section-title">הבסטות בשוק</h2>
              <p className="mp-section-note">
                הבסקט הראשית מובילה למכירה השבועית בדף הבית. שאר הבסטות נפתחות בדף החנות שלהן.
              </p>
            </div>
          </div>
          <BusinessCardGrid stores={stores} loading={loading} />
        </section>

        <div className="mp-cta-banner">
          <p className="mp-cta-banner-title">חקלאי או יצרן מקומי?</p>
          <p className="mp-cta-banner-text">
            פתחו בסטה משלכם בשוק הקהילתי והציעו מוצרים והזמנות שבועיות לשכנים.
          </p>
          <Link to="/local-business-register" className="mp-btn mp-btn-wood" style={{ marginTop: '1rem' }}>
            רוצה לפתוח בסטה בשוק
          </Link>
        </div>
      </main>
    </div>
  );
};

export default MarketplaceHome;
