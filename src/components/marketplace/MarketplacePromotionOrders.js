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
import { isMarketplaceSellerRole } from '../../utils/marketplaceSellerRole';
import LoadingSpinner from '../LoadingSpinner';
import MarketplaceOrderCard from './MarketplaceOrderCard';
import './marketplace.css';

const formatDate = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleDateString('he-IL') : '—';
};

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
    return order.fulfillmentStatus === filter;
  });

  const isSeller = isMarketplaceSellerRole(userRole) || hasSellerProfile;

  if (!userLoggedIn) {
    return (
      <div className="mp-page py-12" dir="rtl">
        <div className="mp-main mp-empty text-center">
          <h1 className="mp-section-title mb-3">הזמנות קידום שבועי</h1>
          <Link to="/login" className="mp-btn mp-btn-wood">
            התחברות
          </Link>
        </div>
      </div>
    );
  }

  if (!loading && !isSeller) {
    return (
      <div className="mp-page py-12" dir="rtl">
        <div className="mp-main mp-empty text-center">
          <h1 className="mp-section-title mb-3">גישה לבעלי בסטה בלבד</h1>
          <Link to="/community-marketplace" className="mp-btn mp-btn-wood mt-4">
            לשוק הבסטות
          </Link>
        </div>
      </div>
    );
  }

  if (!loading && !promotion) {
    return (
      <div className="mp-page py-12" dir="rtl">
        <div className="mp-main mp-empty text-center">
          <h1 className="mp-section-title mb-3">הקידום לא נמצא</h1>
          <Link to="/marketplace/dashboard" className="mp-link">
            חזרה ללוח הבסטה
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-page py-8" dir="rtl">
      <div className="mp-main mp-stack">
        <div className="mp-panel">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <Link to="/marketplace/dashboard?section=promotions" className="mp-link">
                ← ניהול קידומים
              </Link>
              <span className="mp-promo-label" style={{ display: 'inline-block', marginTop: '0.5rem' }}>
                הזמנה מצטברת
              </span>
              <h1 className="mp-section-title mt-2">{promotion?.title}</h1>
              <p className="mp-section-note mt-1">
                {formatDate(promotion?.startsAt)} — {formatDate(promotion?.endsAt)}
                {promotion?.deliveryDate && ` · משלוח ${promotion.deliveryDate}`}
              </p>
              <p className="text-sm mt-2" style={{ color: '#6b5a45' }}>
                סטטוס:{' '}
                <strong>
                  {PROMOTION_STATUS_LABELS[promotion?.status] || promotion?.status || 'פעיל'}
                </strong>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/community-marketplace/order/${promotionId}`}
                className="mp-btn mp-btn-primary text-sm"
                target="_blank"
                rel="noreferrer"
              >
                דף הזמנה ללקוחות
              </Link>
              <Link
                to={`/marketplace/dashboard?section=promotions&edit=${promotionId}`}
                className="mp-btn mp-btn-wood text-sm"
              >
                עריכת קידום
              </Link>
            </div>
          </div>
        </div>

        <div className="mp-panel">
          <h2 className="mp-section-title mb-4">סיכום מצטבר לפי מוצר</h2>
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
                <div className="flex justify-between text-sm">
                  <span>מספר הזמנות</span>
                  <strong>{summary.orderCount}</strong>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span>סכום מוצרים</span>
                  <strong>{summary.formatCurrency(summary.subtotal)}</strong>
                </div>
                {summary.deliveryFees > 0 && (
                  <div className="flex justify-between text-sm mt-1">
                    <span>דמי משלוח (מצטבר)</span>
                    <strong>{summary.formatCurrency(summary.deliveryFees)}</strong>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold mt-2 mp-promotion-aggregate-grand">
                  <span>סה״כ כולל</span>
                  <span>{summary.formatCurrency(summary.grandTotal)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="mp-panel">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="mp-section-title">הזמנות לפי לקוח</h2>
            <span className="mp-badge">{orders.length} הזמנות</span>
          </div>

          <div className="mp-order-filters">
            {[
              { id: 'all', label: 'הכל' },
              { id: 'new', label: 'חדשות' },
              { id: 'ready', label: 'מוכנות' },
              { id: 'completed', label: 'הושלמו' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={`mp-toggle-btn ${filter === item.id ? 'is-active' : ''}`}
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

          {!loading && filteredOrders.length > 0 && (
            <div className="mp-order-list mt-4">
              {filteredOrders.map((order) => (
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketplacePromotionOrders;
