import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import {
  getBusinessProfile,
  getSellerMarketplacePromotion,
  getSellerPromotionOrders,
  toDate,
} from '../../services/marketplaceService';
import { useMarketplaceSellerOrderActions } from '../../hooks/useMarketplaceSellerOrderActions';
import { aggregatePromotionOrders, PROMOTION_STATUS_LABELS } from '../../utils/marketplacePromotionAggregation';
import { formatPromotionClosingDateTime } from '../../utils/marketplacePromotionSchedule';
import { isMarketplaceSellerRole } from '../../utils/marketplaceSellerRole';
import LoadingSpinner from '../LoadingSpinner';
import MarketplaceOrderCard from './MarketplaceOrderCard';
import './marketplace.css';

const ORDER_BOARD_COLUMNS = [
  { id: 'new', label: 'חדשות' },
  { id: 'confirmed', label: 'אושרו' },
  { id: 'ready', label: 'מוכנות' },
  { id: 'completed', label: 'הושלמו' },
  { id: 'cancelled', label: 'בוטלו' },
];

const formatDate = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleDateString('he-IL') : '—';
};

const getOrderBoardStatus = (order) => order.fulfillmentStatus || 'new';

const MarketplacePromotionOrders = () => {
  const { promotionId } = useParams();
  const { currentUser, userRole, userLoggedIn } = useAuth();
  const [promotion, setPromotion] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasSellerProfile, setHasSellerProfile] = useState(false);
  const [filter, setFilter] = useState('all');

  const businessId = currentUser?.uid;

  const {
    statusUpdatingOrderId,
    readyNoticeByOrderId,
    handoffNoticeByOrderId,
    handleMarkReady,
    handleUnmarkReady,
    handleMarkPaid,
    handleUnmarkPaid,
    handleMarkHandoff,
    handleUnmarkHandoff,
  } = useMarketplaceSellerOrderActions({ businessId, setOrders });

  useEffect(() => {
    const load = async () => {
      if (!businessId || !promotionId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [profile, promo, promoOrders] = await Promise.all([
          getBusinessProfile(businessId),
          getSellerMarketplacePromotion(businessId, promotionId),
          getSellerPromotionOrders(businessId, promotionId),
        ]);
        setHasSellerProfile(Boolean(profile));
        setPromotion(promo);
        setOrders(promoOrders);
      } catch (error) {
        console.error('Failed to load promotion orders', error);
        setHasSellerProfile(false);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [businessId, promotionId]);

  const summary = useMemo(() => aggregatePromotionOrders(orders), [orders]);

  const filteredOrders = orders.filter((order) => {
    if (filter === 'all') return true;
    return getOrderBoardStatus(order) === filter;
  });

  const isSeller = isMarketplaceSellerRole(userRole) || hasSellerProfile;

  const renderOrderCard = (order) => (
    <MarketplaceOrderCard
      key={order.id}
      order={order}
      view="business"
      onMarkReady={handleMarkReady}
      onUnmarkReady={handleUnmarkReady}
      onMarkPaid={handleMarkPaid}
      onUnmarkPaid={handleUnmarkPaid}
      onMarkHandoff={handleMarkHandoff}
      onUnmarkHandoff={handleUnmarkHandoff}
      statusUpdating={statusUpdatingOrderId === order.id}
      readyNotice={readyNoticeByOrderId[order.id]}
      handoffNotice={handoffNoticeByOrderId[order.id]}
    />
  );

  if (!userLoggedIn) {
    return (
      <div className="mp-page mp-bench-page" dir="rtl">
        <div className="mp-main mp-bench mp-empty text-center">
          <h1 className="mp-section-title mp-section-title-chalk mb-3">הזמנות קידום שבועי</h1>
          <Link to="/login" className="mp-btn mp-btn-wood">
            התחברות
          </Link>
        </div>
      </div>
    );
  }

  if (!loading && !isSeller) {
    return (
      <div className="mp-page mp-bench-page" dir="rtl">
        <div className="mp-main mp-bench mp-empty text-center">
          <h1 className="mp-section-title mp-section-title-chalk mb-3">גישה לבעלי דוכן בלבד</h1>
          <Link to="/community-marketplace" className="mp-btn mp-btn-wood mt-4">
            לשוק הבסטות
          </Link>
        </div>
      </div>
    );
  }

  if (!loading && !promotion) {
    return (
      <div className="mp-page mp-bench-page" dir="rtl">
        <div className="mp-main mp-bench mp-empty text-center">
          <h1 className="mp-section-title mp-section-title-chalk mb-3">הקידום לא נמצא</h1>
          <Link to="/marketplace/dashboard" className="mp-link">
            חזרה ללוח הדוכן
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-page mp-bench-page" dir="rtl">
      <div className="mp-main mp-bench mp-stack">
        <header className="mp-bench-header">
          <div className="mp-bench-header-main">
            <Link to="/marketplace/dashboard?section=promotions" className="mp-link">
              ← השבוע בשוק
            </Link>
            <span className="mp-weekly-board-label mt-2">מהשדה השבוע</span>
            <h1 className="mp-bench-title mp-section-title-chalk mt-1">{promotion?.title}</h1>
            <p className="mp-bench-subtitle">
              {formatDate(promotion?.startsAt)} — {formatPromotionClosingDateTime(promotion?.endsAt)}
              {promotion?.deliveryDate && ` · משלוח ${promotion.deliveryDate}`}
            </p>
            <p className="mp-bench-promo-status">
              סטטוס קידום:{' '}
              <strong>
                {PROMOTION_STATUS_LABELS[promotion?.status] || promotion?.status || 'פעיל'}
              </strong>
            </p>
          </div>
          <div className="mp-bench-header-actions">
            <Link
              to={`/community-marketplace/order/${promotionId}`}
              className="mp-btn mp-btn-outline mp-bench-btn-sm"
              target="_blank"
              rel="noreferrer"
            >
              דף הזמנה ללקוחות
            </Link>
            <Link
              to={`/marketplace/dashboard?section=promotions&edit=${promotionId}`}
              className="mp-btn mp-btn-wood mp-bench-btn-sm"
            >
              עריכת קידום
            </Link>
          </div>
        </header>

        <section className="mp-bench-panel">
          <h2 className="mp-bench-panel-title mp-section-title-chalk mb-4">
            סיכום מצטבר לפי מוצר
          </h2>
          {summary.items.length === 0 ? (
            <p className="mp-section-note">עדיין אין הזמנות בקידום זה.</p>
          ) : (
            <>
              <div className="mp-promotion-aggregate-table-wrap">
                <table className="mp-promotion-aggregate-table">
                  <thead>
                    <tr>
                      <th>מוצר</th>
                      <th>כמות כוללת</th>
                      <th>מחיר יח׳</th>
                      <th>סה״כ</th>
                      <th>הזמנות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.items.map((item) => (
                      <tr key={item.productId}>
                        <td>{item.name}</td>
                        <td>
                          <strong>{item.quantity}</strong>
                        </td>
                        <td>{summary.formatCurrency(item.unitPrice)}</td>
                        <td>{summary.formatCurrency(item.total)}</td>
                        <td>{item.orderCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mp-promotion-aggregate-totals">
                <div className="mp-receipt-totals-row">
                  <span>מספר הזמנות</span>
                  <strong>{summary.orderCount}</strong>
                </div>
                <div className="mp-receipt-totals-row">
                  <span>סכום מוצרים</span>
                  <strong>{summary.formatCurrency(summary.subtotal)}</strong>
                </div>
                {summary.deliveryFees > 0 && (
                  <div className="mp-receipt-totals-row">
                    <span>דמי משלוח (מצטבר)</span>
                    <strong>{summary.formatCurrency(summary.deliveryFees)}</strong>
                  </div>
                )}
                <div className="mp-receipt-totals-row is-total mp-promotion-aggregate-grand">
                  <span>סה״כ כולל</span>
                  <span>{summary.formatCurrency(summary.grandTotal)}</span>
                </div>
              </div>
            </>
          )}
        </section>

        <section className="mp-bench-panel">
          <div className="mp-bench-panel-head">
            <h2 className="mp-bench-panel-title mp-section-title-chalk">הזמנות לפי לקוח</h2>
            <span className="mp-badge">{orders.length} הזמנות</span>
          </div>

          <div className="mp-bench-tabs mp-order-board-filters mt-3" role="tablist" aria-label="סינון הזמנות">
            {[
              { id: 'all', label: 'לוח מלא' },
              { id: 'new', label: 'חדשות' },
              { id: 'ready', label: 'מוכנות' },
              { id: 'completed', label: 'הושלמו' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                className={`mp-bench-tab${filter === item.id ? ' is-active' : ''}`}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex justify-center py-10">
              <LoadingSpinner />
            </div>
          )}

          {!loading && filteredOrders.length === 0 && (
            <p className="mp-section-note mt-4 text-center">
              {orders.length === 0
                ? 'כשלקוחות יזמינו — ההזמנות יופיעו כאן עם סיכום מצטבר למעלה.'
                : 'אין הזמנות בסינון שנבחר.'}
            </p>
          )}

          {!loading && filter === 'all' && filteredOrders.length > 0 && (
            <div className="mp-orders-board mt-4" role="region" aria-label="לוח הזמנות לפי סטטוס">
              {ORDER_BOARD_COLUMNS.map((column) => {
                const columnOrders = orders.filter(
                  (order) => getOrderBoardStatus(order) === column.id
                );
                return (
                  <section
                    key={column.id}
                    className={`mp-orders-board-column mp-orders-board-column--${column.id}`}
                    aria-label={`${column.label}, ${columnOrders.length} הזמנות`}
                  >
                    <header className="mp-orders-board-column-head">
                      <h3 className="mp-orders-board-column-title">{column.label}</h3>
                      <span className="mp-orders-board-count">{columnOrders.length}</span>
                    </header>
                    <div className="mp-orders-board-cards">
                      {columnOrders.length === 0 ? (
                        <p className="mp-orders-board-empty">אין הזמנות</p>
                      ) : (
                        columnOrders.map((order) => renderOrderCard(order))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {!loading && filter !== 'all' && filteredOrders.length > 0 && (
            <div className="mp-order-list mp-orders-board-list mt-4">
              {filteredOrders.map((order) => renderOrderCard(order))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default MarketplacePromotionOrders;
