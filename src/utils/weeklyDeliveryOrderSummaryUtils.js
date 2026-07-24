import { getEstimatedLineTotal } from './pricing';
import { toLocalDateKey } from './deliveryScheduleUtils';

const SHIPPING_PRODUCT_ID = 'Mdean61FIezxRcMUZjVn';

const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const normalizePhone = (phone) => String(phone || '')
  .replace(/\D/g, '')
  .replace(/^972/, '0')
  .slice(-10);

const normalizeOption = (option) => {
  const value = String(option || '').trim();
  return value === 'ללא אופציות' || value === 'None' ? '' : value;
};

const normalizeStatus = (status) => String(status || '').trim().toLowerCase();

export function shouldIncludeOrderInDeliverySummary(orderData = {}, source = '') {
  if (source !== 'customerOrdersDelayed') {
    return normalizeStatus(orderData.paymentStatus) === 'completed';
  }

  const delayedStatus = normalizeStatus(orderData.delayedOrderStatus);
  const paymentStatus = normalizeStatus(orderData.paymentStatus);
  const isPendingAuthorization = [delayedStatus, paymentStatus]
    .some((status) => status.replace(/[\s-]+/g, '_') === 'pending_authorization');
  if (isPendingAuthorization) return false;

  if (delayedStatus === 'pending_weighing') {
    return paymentStatus === 'held';
  }

  const completedStatuses = new Set(['settled', 'completed', 'charged']);
  return completedStatuses.has(delayedStatus) || completedStatuses.has(paymentStatus);
}

function getOrderIdentity(order = {}) {
  const phone = normalizePhone(order.customerDetails?.phone);
  const email = normalizeText(order.customerDetails?.email);
  return phone || email || normalizeText(order.userId) || normalizeText(order.customerDetails?.name) || order.id;
}

function getDeliveryDateIdentity(order = {}) {
  const dateKey = toLocalDateKey(order.deliveryDate)
    || toLocalDateKey(order.fulfillment?.deliveryDate);
  if (dateKey) return dateKey;

  const label = String(order.deliveryDateLabel || '').trim();
  const match = label.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : label;
}

function shouldExcludeLine(item = {}, excluded = {}) {
  const productId = item.productId || item.id;
  return item.isShipping === true
    || productId === SHIPPING_PRODUCT_ID
    || Boolean(item.lineId && excluded[item.lineId]);
}

export function getOrderContentSignature(order = {}) {
  const excluded = order.customerExcludedLineIds || {};
  const lines = [];

  Object.entries(order.orderBreakdown || {}).forEach(([businessKey, businessOrder = {}]) => {
    const businessId = normalizeText(businessOrder.businessId || businessOrder.businessName || businessKey);
    (businessOrder.items || []).forEach((item = {}) => {
      if (shouldExcludeLine(item, excluded)) return;
      const productId = normalizeText(item.productId || item.id || item.productName || item.name || 'unknown');
      lines.push([
        businessId,
        productId,
        normalizeText(normalizeOption(item.selectedOption)),
        Number(item.quantity) || 0,
      ].join('::'));
    });
  });

  return lines.sort().join('|');
}

export function getDuplicateOrderKey(order = {}) {
  return [
    getOrderIdentity(order),
    getDeliveryDateIdentity(order),
    normalizeText(order.community),
    getOrderContentSignature(order),
  ].join('|');
}

export function aggregateDeliveryBusinessSummary(orders = []) {
  const summary = {};

  orders.forEach((order = {}) => {
    const excluded = order.customerExcludedLineIds || {};
    Object.entries(order.orderBreakdown || {}).forEach(([businessKey, businessOrder = {}]) => {
      const businessId = businessOrder.businessId || businessOrder.businessName || businessKey || 'unknown';
      const businessName = businessOrder.businessName || 'עסק לא ידוע';
      if (!summary[businessId]) {
        summary[businessId] = { businessName, products: {}, totalRevenue: 0 };
      }

      (businessOrder.items || []).forEach((item = {}) => {
        if (shouldExcludeLine(item, excluded)) return;
        const productId = item.productId || item.id || item.productName || 'unknown';
        const selectedOption = normalizeOption(item.selectedOption);
        const productKey = `${normalizeText(productId)}_${normalizeText(selectedOption)}`;
        if (!summary[businessId].products[productKey]) {
          summary[businessId].products[productKey] = {
            productName: item.productName || item.name || 'פריט',
            selectedOption,
            quantity: 0,
            totalRevenue: 0,
            unitSize: item.unitSize || 1,
            measurementType: item.measurementType || 'kg',
          };
        }

        const quantity = Number(item.quantity) || 0;
        const totalPrice = item.estimatedLineTotal != null
          ? Number(item.estimatedLineTotal)
          : getEstimatedLineTotal(item);
        summary[businessId].products[productKey].quantity += quantity;
        summary[businessId].products[productKey].totalRevenue += Number(totalPrice) || 0;
        summary[businessId].totalRevenue += Number(totalPrice) || 0;
      });
    });
  });

  return summary;
}
