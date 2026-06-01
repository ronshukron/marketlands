import {
  FULFILLMENT_METHOD_DELIVERY,
  FULFILLMENT_METHOD_PICKUP,
} from '../constants/marketplaceFulfillment';
import { MARKETPLACE_HANDOFF_STATUS } from '../constants/marketplaceOrders';

/** Whether the customer chose delivery (vs pickup) for this order. */
export const isMarketplaceOrderDelivery = (order = {}) => {
  const method = String(order.fulfillmentMethod || '').trim();
  if (method === FULFILLMENT_METHOD_DELIVERY) return true;
  if (method === FULFILLMENT_METHOD_PICKUP) return false;

  const label = String(order.fulfillmentLabel || order.selectedDeliveryOption || '').toLowerCase();
  return label.includes('משלוח') || label.includes('delivery');
};

export const getMarketplaceHandoffTargetStatus = (order = {}) =>
  isMarketplaceOrderDelivery(order)
    ? MARKETPLACE_HANDOFF_STATUS.delivered
    : MARKETPLACE_HANDOFF_STATUS.picked_up;

export const getMarketplaceHandoffActionLabel = (order = {}) =>
  isMarketplaceOrderDelivery(order) ? 'סמן כנמסר' : 'סמן כנאסף';

export const getMarketplaceHandoffUnmarkLabel = (order = {}) =>
  isMarketplaceOrderDelivery(order) ? 'בטל סימון משלוח' : 'בטל סימון איסוף';

export const isMarketplaceOrderHandoffDone = (order = {}) => {
  const status = order.handoffStatus || MARKETPLACE_HANDOFF_STATUS.pending;
  return status === MARKETPLACE_HANDOFF_STATUS.picked_up
    || status === MARKETPLACE_HANDOFF_STATUS.delivered;
};

export const isMarketplaceOrderPaid = (order = {}) =>
  order.paymentStatus === 'paid';

export const isMarketplaceOrderReady = (order = {}) =>
  order.fulfillmentStatus === 'ready';

export const isMarketplaceOrderFulfilled = (order = {}) =>
  order.fulfillmentStatus === 'completed';

export const canMarkMarketplaceOrderReady = (order = {}) =>
  ['new', 'confirmed'].includes(order.fulfillmentStatus);

export const canFinishMarketplaceOrderHandoff = (order = {}) =>
  order.fulfillmentStatus === 'ready';
