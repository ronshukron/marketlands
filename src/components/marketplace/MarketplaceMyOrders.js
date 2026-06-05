import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import {
  MARKETPLACE_LOGIN_PATH,
  marketplaceLoginLinkState,
} from '../../utils/marketplaceRoutes';
import { isMarketplaceOrderFulfilled } from '../../utils/marketplaceOrderStatus';
import { getCustomerMarketplaceOrders } from '../../services/marketplaceService';
import LoadingSpinner from '../LoadingSpinner';
import MarketplaceOrderCard from './MarketplaceOrderCard';
import './marketplace.css';

const ORDER_FILTERS = [
  { id: 'active', label: 'פעילות' },
  { id: 'completed', label: 'הושלמו' },
];

const MarketplaceMyOrders = () => {
  const { currentUser, userLoggedIn } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('active');

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

  const filteredOrders = useMemo(() => {
    if (filter === 'completed') {
      return orders.filter(
        (order) =>
          isMarketplaceOrderFulfilled(order) || order.fulfillmentStatus === 'cancelled'
      );
    }
    return orders.filter(
      (order) =>
        !isMarketplaceOrderFulfilled(order) && order.fulfillmentStatus !== 'cancelled'
    );
  }, [orders, filter]);

  const activeCount = useMemo(
    () =>
      orders.filter(
        (order) =>
          !isMarketplaceOrderFulfilled(order) && order.fulfillmentStatus !== 'cancelled'
      ).length,
    [orders]
  );

  const completedCount = useMemo(
    () =>
      orders.filter(
        (order) =>
          isMarketplaceOrderFulfilled(order) || order.fulfillmentStatus === 'cancelled'
      ).length,
    [orders]
  );

  if (!userLoggedIn) {
    return (
      <div className="mp-page mp-my-orders-page" dir="rtl">
        <div className="mp-main mp-empty text-center">
          <span className="mp-weekly-board-label">שוק הבסטות</span>
          <h1 className="mp-section-title mp-section-title-chalk mt-2 mb-3">
            ההזמנות שלי
          </h1>
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
    <div className="mp-page mp-my-orders-page" dir="rtl">
      <div className="mp-main mp-stack">
        <header className="mp-order-panel mp-my-orders-hero">
          <Link to="/community-marketplace" className="mp-link">
            ← חזרה לשוק הבסטות
          </Link>
          <span className="mp-weekly-board-label mt-3">מהשדה לשכונה</span>
          <h1 className="mp-section-title mp-section-title-chalk mt-2">
            ההזמנות שלי בשוק
          </h1>
          <p className="mp-section-note mt-1">
            כרטיסי הזמנה מהדוכנים — מעקב מנשלח ועד נאסף.
          </p>
          <p className="mp-my-orders-account text-sm mt-2">
            חשבון: <strong>{currentUser.email}</strong>
          </p>

          {orders.length > 0 && (
            <div className="mp-my-orders-toolbar mt-4">
              <div className="mp-toggle-group" role="tablist" aria-label="סינון הזמנות">
                {ORDER_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === item.id}
                    className={`mp-toggle-btn${filter === item.id ? ' is-active' : ''}`}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label}
                    <span className="mp-my-orders-filter-count">
                      {item.id === 'active' ? activeCount : completedCount}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </header>

        {loading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {error && (
          <div className="mp-order-panel mp-alert mp-alert-warn">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="mp-order-panel mp-empty mp-my-orders-empty text-center">
            <h2 className="mp-empty-title mp-section-title-chalk">
              עדיין לא קניתם בשוק השבוע
            </h2>
            <p className="mp-empty-text mp-section-note mt-2">
              כשתזמינו מהדוכנים — כרטיס ההזמנה יופיע כאן עם מעקב מלא.
            </p>
            <Link to="/community-marketplace" className="mp-btn mp-btn-wood mt-5">
              לשוק הבסטות
            </Link>
          </div>
        )}

        {!loading && !error && orders.length > 0 && filteredOrders.length === 0 && (
          <div className="mp-order-panel mp-empty mp-my-orders-empty text-center">
            <h2 className="mp-empty-title mp-section-title-chalk">
              {filter === 'active' ? 'אין הזמנות פעילות' : 'אין הזמנות שהושלמו'}
            </h2>
            <p className="mp-empty-text mp-section-note mt-2">
              {filter === 'active'
                ? 'כל ההזמנות שלכם כבר הושלמו — עברו ללשונית «הושלמו».'
                : 'הזמנות שעדיין בתהליך מופיעות בלשונית «פעילות».'}
            </p>
            <button
              type="button"
              className="mp-btn mp-btn-outline mt-4"
              onClick={() => setFilter(filter === 'active' ? 'completed' : 'active')}
            >
              {filter === 'active' ? 'הצג הושלמו' : 'הצג פעילות'}
            </button>
          </div>
        )}

        {!loading && filteredOrders.length > 0 && (
          <div className="mp-order-list mp-my-orders-list">
            {filteredOrders.map((order) => (
              <MarketplaceOrderCard key={order.id} order={order} view="customer" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketplaceMyOrders;
