import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PAYMENT_METHOD_LABELS } from '../../services/marketplaceService';
import {
  MARKETPLACE_FULFILLMENT_STATUS_LABELS,
  MARKETPLACE_HANDOFF_STATUS,
  MARKETPLACE_HANDOFF_STATUS_LABELS,
  MARKETPLACE_PAYMENT_STATUS_LABELS,
} from '../../constants/marketplaceOrders';
import {
  canFinishMarketplaceOrderHandoff,
  canMarkMarketplaceOrderReady,
  getMarketplaceHandoffActionLabel,
  getMarketplaceHandoffUnmarkLabel,
  isMarketplaceOrderFulfilled,
  isMarketplaceOrderHandoffDone,
  isMarketplaceOrderPaid,
  isMarketplaceOrderReady,
} from '../../utils/marketplaceOrderStatus';
import { toDate } from '../../services/marketplaceService';
import {
  buildOrderReadyWhatsAppMessage,
  buildOrderReadyWhatsAppUrl,
} from '../../utils/marketplaceOrderWhatsApp';

const formatCurrency = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Number(value || 0));

const formatDateTime = (value) => {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const MarketplaceOrderCard = ({
  order,
  view = 'customer',
  onMarkReady,
  onUnmarkReady,
  onMarkPaid,
  onUnmarkPaid,
  onMarkHandoff,
  onUnmarkHandoff,
  statusUpdating = false,
  readyNotice = null,
  handoffNotice = null,
}) => {
  const [expanded, setExpanded] = useState(false);
  const lines = Array.isArray(order.lines) ? order.lines : [];
  const total = Number(order.total ?? order.subtotal ?? 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const isReady = isMarketplaceOrderReady(order);
  const isCompleted = isMarketplaceOrderFulfilled(order);
  const isCancelled = order.fulfillmentStatus === 'cancelled';
  const isPaid = isMarketplaceOrderPaid(order);
  const handoffStatus = order.handoffStatus || MARKETPLACE_HANDOFF_STATUS.pending;
  const handoffDone = isMarketplaceOrderHandoffDone(order);
  const canManage = view === 'business' && !isCancelled;
  const canMarkReady = canManage && canMarkMarketplaceOrderReady(order) && Boolean(onMarkReady);
  const canUnmarkReady = canManage && isReady && Boolean(onUnmarkReady);
  const canMarkPaid = canManage && !isPaid && Boolean(onMarkPaid);
  const canUnmarkPaid = canManage && isPaid && Boolean(onUnmarkPaid);
  const canMarkHandoff =
    canManage && canFinishMarketplaceOrderHandoff(order) && Boolean(onMarkHandoff);
  const canUnmarkHandoff = canManage && isCompleted && Boolean(onUnmarkHandoff);
  const handoffActionLabel = getMarketplaceHandoffActionLabel(order);
  const handoffUnmarkLabel = getMarketplaceHandoffUnmarkLabel(order);

  const whatsappUrl = useMemo(() => {
    if (view !== 'business' || !isReady || isCompleted) {
      return '';
    }
    if (readyNotice?.whatsappUrl) return readyNotice.whatsappUrl;

    if (!order.customerPhone) return '';

    const myOrdersUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/community-marketplace/my-orders`
        : '';

    const message = buildOrderReadyWhatsAppMessage({
      customerName: order.customerName,
      businessName: order.businessName,
      orderId: order.id,
      fulfillmentLabel: order.fulfillmentLabel || order.selectedDeliveryOption,
      total,
      myOrdersUrl,
    });

    return buildOrderReadyWhatsAppUrl({ phone: order.customerPhone, message });
  }, [view, isReady, isCompleted, order, total, readyNotice?.whatsappUrl]);

  const showBusinessActions =
    canMarkReady
    || canUnmarkReady
    || canMarkPaid
    || canUnmarkPaid
    || canMarkHandoff
    || canUnmarkHandoff
    || (isReady && whatsappUrl);

  return (
    <article
      className={`mp-order-card${isCompleted ? ' mp-order-card--completed' : ''}${
        isReady && !isCompleted ? ' mp-order-card--ready' : ''
      }${isCancelled ? ' mp-order-card--cancelled' : ''}`}
    >
      {isCompleted && view === 'customer' && (
        <div className="mp-order-card-completed-banner" role="status">
          ההזמנה הושלמה
          {order.completedAt && (
            <span className="mp-order-card-completed-date">
              {' '}
              · {formatDateTime(order.completedAt)}
            </span>
          )}
        </div>
      )}

      {isReady && !isCompleted && view === 'customer' && (
        <div className="mp-order-card-ready-banner" role="status">
          ההזמנה מוכנה לאיסוף / משלוח
          {order.readyAt && (
            <span className="mp-order-card-completed-date">
              {' '}
              · {formatDateTime(order.readyAt)}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        className="mp-order-card-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="mp-order-card-head-main">
          <h3 className="mp-order-card-title">
            {view === 'business'
              ? order.customerName || 'לקוח'
              : order.businessName || 'בסטה'}
          </h3>
          <p className="mp-order-card-meta">
            {formatDateTime(order.createdAt)}
            {order.id && (
              <span className="mp-order-card-id"> · #{order.id.slice(0, 8)}</span>
            )}
          </p>
        </div>
        <div className="mp-order-card-head-side">
          <span className="mp-order-card-total">{formatCurrency(total)}</span>
          <span className="mp-order-card-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      <div className="mp-order-card-tags">
        <span
          className={`mp-tag${isCompleted ? ' mp-tag-completed' : ''}${
            isReady && !isCompleted ? ' mp-tag-ready' : ''
          }${isCancelled ? ' mp-tag-cancelled' : ''}`}
        >
          {MARKETPLACE_FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus] ||
            order.fulfillmentStatus ||
            'חדשה'}
        </span>
        <span className={`mp-tag${isPaid ? ' mp-tag-paid' : ''}`}>
          {MARKETPLACE_PAYMENT_STATUS_LABELS[order.paymentStatus] ||
            order.paymentStatus ||
            'תשלום ידני'}
        </span>
        {isCompleted && (
          <span className={`mp-tag${handoffDone ? ' mp-tag-handoff-done' : ''}`}>
            {MARKETPLACE_HANDOFF_STATUS_LABELS[handoffStatus] || handoffStatus}
          </span>
        )}
        {order.fulfillmentLabel && <span className="mp-badge">{order.fulfillmentLabel}</span>}
      </div>

      {view === 'business' && showBusinessActions && (
        <div className="mp-order-card-actions">
          {(canMarkReady || canUnmarkReady) && (
            <div className="mp-order-card-step">
              <p className="mp-order-card-step-label">1. הזמנה מוכנה</p>
              <div className="mp-order-card-status-actions">
                {canMarkReady && (
                  <button
                    type="button"
                    className="mp-btn mp-btn-wood mp-order-status-btn"
                    disabled={statusUpdating}
                    onClick={() => onMarkReady(order)}
                  >
                    סמן הזמנה כמוכנה
                  </button>
                )}
                {canUnmarkReady && (
                  <button
                    type="button"
                    className="mp-btn mp-btn-ghost mp-order-status-btn"
                    disabled={statusUpdating}
                    onClick={() => onUnmarkReady(order)}
                  >
                    בטל סימון מוכנה
                  </button>
                )}
              </div>
              {isReady && !isCompleted && (
                <div className="mp-order-card-post-ready">
                  {whatsappUrl ? (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mp-btn mp-btn-wood mp-whatsapp-btn"
                    >
                      שליחת וואטסאפ ללקוח
                    </a>
                  ) : (
                    <p className="mp-order-card-notice">אין מספר טלפון ללקוח — שלחו וואטסאפ ידנית</p>
                  )}
                </div>
              )}
            </div>
          )}

          {(canMarkPaid || canUnmarkPaid) && (
            <div className="mp-order-card-step">
              <p className="mp-order-card-step-label">2. תשלום</p>
              <div className="mp-order-card-status-actions">
                {canMarkPaid && (
                  <button
                    type="button"
                    className="mp-btn mp-btn-outline mp-order-status-btn"
                    disabled={statusUpdating}
                    onClick={() => onMarkPaid(order)}
                  >
                    סמן כשולם
                  </button>
                )}
                {canUnmarkPaid && (
                  <button
                    type="button"
                    className="mp-btn mp-btn-ghost mp-order-status-btn"
                    disabled={statusUpdating}
                    onClick={() => onUnmarkPaid(order)}
                  >
                    בטל סימון שולם
                  </button>
                )}
              </div>
            </div>
          )}

          {(isReady || isCompleted) && (canMarkHandoff || canUnmarkHandoff) && (
            <div className="mp-order-card-step">
              <p className="mp-order-card-step-label">3. סיום — איסוף / משלוח</p>
              <div className="mp-order-card-status-actions">
                {canMarkHandoff && (
                  <button
                    type="button"
                    className="mp-btn mp-btn-outline mp-order-status-btn"
                    disabled={statusUpdating}
                    onClick={() => onMarkHandoff(order)}
                  >
                    {handoffActionLabel}
                  </button>
                )}
                {canUnmarkHandoff && (
                  <button
                    type="button"
                    className="mp-btn mp-btn-ghost mp-order-status-btn"
                    disabled={statusUpdating}
                    onClick={() => onUnmarkHandoff(order)}
                  >
                    {handoffUnmarkLabel}
                  </button>
                )}
              </div>
              {isCompleted && handoffNotice?.emailAttempted && (
                <p
                  className={`mp-order-card-notice ${
                    handoffNotice.emailSent
                      ? 'mp-order-card-notice-success'
                      : 'mp-order-card-notice-warn'
                  }`}
                >
                  {handoffNotice.emailSent
                    ? 'נשלח אימייל ללקוח על השלמת ההזמנה'
                    : 'לא ניתן היה לשלוח אימייל ללקוח'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div className="mp-order-card-body">
          {view === 'business' && (
            <div className="mp-order-card-contact">
              <p>
                <strong>טלפון:</strong>{' '}
                {order.customerPhone ? (
                  <a href={`tel:${order.customerPhone}`}>{order.customerPhone}</a>
                ) : (
                  '—'
                )}
              </p>
              {order.customerEmail && (
                <p>
                  <strong>אימייל:</strong> {order.customerEmail}
                </p>
              )}
              {order.customerCommunity && (
                <p>
                  <strong>קהילה:</strong> {order.customerCommunity}
                </p>
              )}
            </div>
          )}

          {view === 'customer' && order.businessId && (
            <p className="text-sm mb-2">
              <Link to={`/community-marketplace/store/${order.businessId}`} className="mp-link">
                לדף הבסטה
              </Link>
            </p>
          )}

          <ul className="mp-order-lines">
            {lines.map((line) => (
              <li key={`${line.productId}-${line.name}`} className="mp-order-line">
                {line.imageUrl && (
                  <img src={line.imageUrl} alt="" className="mp-order-line-thumb" />
                )}
                <span className="mp-order-line-name">{line.name}</span>
                <span className="mp-order-line-qty">× {line.quantity}</span>
                <span className="mp-order-line-price">{formatCurrency(line.total)}</span>
              </li>
            ))}
          </ul>

          <div className="mp-order-card-totals">
            <div className="flex justify-between text-sm">
              <span>מוצרים</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {deliveryFee > 0 && (
              <div className="flex justify-between text-sm">
                <span>משלוח</span>
                <span>{formatCurrency(deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold mt-1">
              <span>סה״כ</span>
              <span>{formatCurrency(total)}</span>
            </div>
            {order.paymentMethod && (
              <p className="text-sm text-gray-600 mt-2">
                תשלום: {PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}
              </p>
            )}
            {order.customerNotes && (
              <p className="text-sm mt-2 whitespace-pre-wrap">
                <strong>הערות:</strong> {order.customerNotes}
              </p>
            )}
          </div>
        </div>
      )}
    </article>
  );
};

export default MarketplaceOrderCard;
