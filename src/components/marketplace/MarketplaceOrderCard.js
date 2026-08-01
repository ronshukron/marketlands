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

const CUSTOMER_TIMELINE_LABELS = [
  { key: 'sent', label: 'נשלח' },
  { key: 'confirmed', label: 'אושר' },
  { key: 'ready', label: 'מוכן' },
  { key: 'handoff', label: 'נאסף' },
];

const getCustomerOrderTimeline = (order) => {
  const cancelled = order.fulfillmentStatus === 'cancelled';
  const confirmed = ['confirmed', 'ready', 'completed'].includes(order.fulfillmentStatus);
  const ready =
    isMarketplaceOrderReady(order) || isMarketplaceOrderFulfilled(order);
  const handoff =
    isMarketplaceOrderHandoffDone(order) || isMarketplaceOrderFulfilled(order);

  const completion = {
    sent: Boolean(order.createdAt),
    confirmed,
    ready,
    handoff,
  };

  if (cancelled) {
    return CUSTOMER_TIMELINE_LABELS.map((step) => ({
      ...step,
      complete: step.key === 'sent',
      isActive: false,
      cancelled: true,
    }));
  }

  const firstIncompleteIndex = CUSTOMER_TIMELINE_LABELS.findIndex(
    (step) => !completion[step.key]
  );
  const activeIndex =
    firstIncompleteIndex === -1
      ? CUSTOMER_TIMELINE_LABELS.length - 1
      : firstIncompleteIndex;

  return CUSTOMER_TIMELINE_LABELS.map((step, index) => ({
    ...step,
    complete: completion[step.key],
    isActive: !completion[step.key] && index === activeIndex,
    cancelled: false,
  }));
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
  const isCustomer = view === 'customer';
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

  const customerTimeline = useMemo(
    () => (isCustomer ? getCustomerOrderTimeline(order) : []),
    [isCustomer, order]
  );

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
      className={`mp-ticket mp-order-card${
        isCustomer ? ' mp-ticket--customer' : ' mp-ticket--business'
      }${isCompleted ? ' mp-order-card--completed' : ''}${
        isReady && !isCompleted ? ' mp-order-card--ready' : ''
      }${isCancelled ? ' mp-order-card--cancelled' : ''}`}
    >
      {isCustomer && isCompleted && (
        <div className="mp-ticket-ribbon mp-ticket-ribbon--done" role="status">
          ההזמנה הושלמה
          {order.completedAt && (
            <span className="mp-ticket-ribbon-date"> · {formatDateTime(order.completedAt)}</span>
          )}
        </div>
      )}

      {isCustomer && isReady && !isCompleted && (
        <div className="mp-ticket-ribbon mp-ticket-ribbon--ready" role="status">
          מוכנה לאיסוף / משלוח
          {order.readyAt && (
            <span className="mp-ticket-ribbon-date"> · {formatDateTime(order.readyAt)}</span>
          )}
        </div>
      )}

      {isCustomer && isCancelled && (
        <div className="mp-ticket-ribbon mp-ticket-ribbon--cancelled" role="status">
          ההזמנה בוטלה
        </div>
      )}

      <div className="mp-ticket-notch mp-ticket-notch--start" aria-hidden="true" />
      <div className="mp-ticket-notch mp-ticket-notch--end" aria-hidden="true" />

      <button
        type="button"
        className="mp-ticket-head mp-order-card-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="mp-order-card-head-main">
          {isCustomer && (
            <span className="mp-ticket-kicker">כרטיס הזמנה</span>
          )}
          <h3 className="mp-order-card-title mp-section-title-chalk">
            {view === 'business'
              ? order.customerName || 'לקוח'
              : order.businessName || 'דוכן'}
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
          <span className="mp-order-card-chevron" aria-hidden="true">
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {isCustomer && customerTimeline.length > 0 && (
        <div
          className="mp-ticket-timeline"
          role="list"
          aria-label="מעקב הזמנה: נשלח, אושר, מוכן, נאסף"
        >
          {customerTimeline.map((step, index) => (
            <div
              key={step.key}
              role="listitem"
              className={`mp-ticket-timeline-step${
                step.complete ? ' is-done' : ''
              }${step.isActive ? ' is-active' : ''}${
                step.cancelled ? ' is-cancelled' : ''
              }${index === customerTimeline.length - 1 ? ' is-last' : ''}`}
            >
              <span className="mp-ticket-timeline-dot" aria-hidden="true" />
              <span className="mp-ticket-timeline-label">{step.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mp-ticket-meta mp-order-card-tags">
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
            'תשלום בשוק'}
        </span>
        {(isCompleted || handoffDone) && (
          <span className={`mp-tag${handoffDone ? ' mp-tag-handoff-done' : ''}`}>
            {MARKETPLACE_HANDOFF_STATUS_LABELS[handoffStatus] || handoffStatus}
          </span>
        )}
        {order.fulfillmentLabel && <span className="mp-badge">{order.fulfillmentLabel}</span>}
      </div>

      {view === 'business' && showBusinessActions && (
        <div className="mp-ticket-business-actions mp-order-card-actions">
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
                    <p className="mp-order-card-notice">
                      אין מספר טלפון ללקוח — שלחו וואטסאפ ידנית
                    </p>
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
        <div className="mp-ticket-body mp-order-card-body">
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
              {(order.fulfillmentLabel || order.selectedDeliveryOption || order.fulfillmentMethod) && (
                <p>
                  <strong>אופן אספקה:</strong>{' '}
                  {order.fulfillmentLabel ||
                    order.selectedDeliveryOption ||
                    (order.fulfillmentMethod === 'volunteer_pickup'
                      ? 'איסוף מנקודת מתנדב'
                      : order.fulfillmentMethod === 'pickup'
                        ? 'איסוף עצמי מהבסטה'
                        : order.fulfillmentMethod === 'delivery'
                          ? 'משלוח לקהילה'
                          : order.fulfillmentMethod)}
                  {order.fulfillmentSubtype === 'volunteer' ||
                  order.fulfillmentMethod === 'volunteer_pickup'
                    ? ' (מתנדב)'
                    : order.fulfillmentSubtype === 'business' || order.fulfillmentMethod === 'pickup'
                      ? ' (מהבסטה)'
                      : ''}
                </p>
              )}
              {order.volunteerId && (
                <p className="mp-section-note text-sm">
                  מזהה נקודת מתנדב: {order.volunteerId}
                </p>
              )}
            </div>
          )}

          {isCustomer && order.businessId && (
            <p className="mp-ticket-store-link">
              <Link to={`/community-marketplace/store/${order.businessId}`} className="mp-link">
                לדוכן
              </Link>
            </p>
          )}

          <ul className="mp-order-lines mp-ticket-lines">
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

          <div className="mp-order-card-totals mp-receipt-totals">
            <div className="mp-receipt-totals-row">
              <span>מוצרים</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {deliveryFee > 0 && (
              <div className="mp-receipt-totals-row">
                <span>משלוח</span>
                <span>{formatCurrency(deliveryFee)}</span>
              </div>
            )}
            <div className="mp-receipt-totals-row is-total">
              <span>סה״כ</span>
              <span>{formatCurrency(total)}</span>
            </div>
            {order.paymentMethod && (
              <p className="mp-ticket-payment-note">
                תשלום בשוק:{' '}
                {PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}
              </p>
            )}
            {order.customerNotes && (
              <p className="mp-ticket-notes">
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
