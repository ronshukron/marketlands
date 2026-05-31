import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import {
  MARKETPLACE_LOGIN_PATH,
  marketplaceLoginLinkState,
} from '../../utils/marketplaceRoutes';
import { getCustomerMarketplaceOrders } from '../../services/marketplaceService';
import LoadingSpinner from '../LoadingSpinner';
import MarketplaceOrderCard from './MarketplaceOrderCard';
import './marketplace.css';

const MarketplaceMyOrders = () => {
  const { currentUser, userLoggedIn } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!userLoggedIn || !currentUser?.email) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await getCustomerMarketplaceOrders({
          email: currentUser.email,
          userId: currentUser.uid,
        });
        setOrders(data);
      } catch (err) {
        console.error('Failed to load marketplace orders', err);
        setError(
          'לא ניתן לטעון הזמנות. ודאו שאתם מחוברים לחשבון שבו ביצעתם את ההזמנה, ושכללי Firestore כוללים קריאה לפי customerUserId ו-request.auth.token.email.'
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentUser, userLoggedIn]);

  if (!userLoggedIn) {
    return (
      <div className="mp-page py-12" dir="rtl">
        <div className="mp-main mp-empty text-center">
          <h1 className="mp-section-title mb-3">ההזמנות שלי בשוק הבסטות</h1>
          <p className="mp-section-note mb-4">יש להתחבר כדי לראות הזמנות מהשוק.</p>
          <Link
            to={MARKETPLACE_LOGIN_PATH}
            state={marketplaceLoginLinkState('/community-marketplace/my-orders')}
            className="mp-btn mp-btn-wood"
          >
            התחברות לשוק הבסטות
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-page py-8" dir="rtl">
      <div className="mp-main mp-stack">
        <div className="mp-panel">
          <Link to="/community-marketplace" className="mp-link">
            ← חזרה לשוק הבסטות
          </Link>
          <h1 className="mp-section-title mt-3">ההזמנות שלי בשוק הבסטות</h1>
          <p className="mp-section-note mt-1">
            הזמנות שביצעתם מבסטות בשוק תחת החשבון שלכם (לא כולל הזמנות שבועיות רגילות של האתר).
          </p>
          <p className="text-sm text-gray-600 mt-2">
            מוצגות הזמנות המשויכות לחשבון: <strong>{currentUser.email}</strong>
          </p>
          <Link to="/my-orders" className="mp-link text-sm mt-2 inline-block">
            הזמנות שבועיות / עצמאיות באתר
          </Link>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {error && (
          <div className="mp-panel mp-alert mp-alert-warn">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="mp-panel mp-empty text-center">
            <h2 className="mp-empty-title">עדיין אין הזמנות</h2>
            <p className="mp-empty-text">כשתזמינו מבסטה בשוק — ההזמנות יופיעו כאן.</p>
            <Link to="/community-marketplace" className="mp-btn mp-btn-wood mt-4">
              לשוק הבסטות
            </Link>
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="mp-order-list">
            {orders.map((order) => (
              <MarketplaceOrderCard key={order.id} order={order} view="customer" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketplaceMyOrders;
