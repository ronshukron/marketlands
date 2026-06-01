import {
  getBusinessProfile,
  getMarketplaceStore,
  markMarketplaceOrderHandoff,
  markMarketplaceOrderReady,
} from './marketplaceService';
import { notifyMarketplaceOrderCompleted } from './marketplaceOrderNotifications';
import { getMarketplaceHandoffTargetStatus } from '../utils/marketplaceOrderStatus';
import {
  buildOrderReadyWhatsAppMessage,
  buildOrderReadyWhatsAppUrl,
} from '../utils/marketplaceOrderWhatsApp';

const getSiteOrigin = () =>
  typeof window !== 'undefined' ? window.location.origin : '';

const buildWhatsAppForOrder = async ({ order, businessId }) => {
  const [store, business] = await Promise.all([
    getMarketplaceStore(businessId),
    getBusinessProfile(businessId),
  ]);

  const businessName =
    store?.title || store?.businessName || business?.businessName || order.businessName || 'בסטה';

  const myOrdersUrl = `${getSiteOrigin()}/community-marketplace/my-orders`;
  const whatsappMessage = buildOrderReadyWhatsAppMessage({
    customerName: order.customerName,
    businessName,
    orderId: order.id,
    fulfillmentLabel: order.fulfillmentLabel || order.selectedDeliveryOption,
    total: order.total ?? order.subtotal,
    myOrdersUrl,
  });

  const whatsappUrl = buildOrderReadyWhatsAppUrl({
    phone: order.customerPhone,
    message: whatsappMessage,
  });

  return { businessName, whatsappUrl, whatsappMessage };
};

/** Step 1: מוכנה — moves to מוכנות, returns WhatsApp link (no email). */
export const markOrderReadyForSeller = async ({ order, businessId }) => {
  const readyOrder = await markMarketplaceOrderReady({
    orderId: order.id,
    businessId,
  });

  const { businessName, whatsappUrl, whatsappMessage } = await buildWhatsAppForOrder({
    order: { ...order, ...readyOrder },
    businessId,
  });

  return {
    order: { ...readyOrder, id: order.id },
    businessName,
    whatsappUrl,
    whatsappMessage,
  };
};

/** Step 3: נאסף/נמסר — completes order (הושלמו), optional buyer email. */
export const finishMarketplaceOrderForSeller = async ({ order, businessId }) => {
  const handoffStatus = getMarketplaceHandoffTargetStatus(order);

  const completedOrder = await markMarketplaceOrderHandoff({
    orderId: order.id,
    businessId,
    handoffStatus,
  });

  const { businessName, whatsappUrl, whatsappMessage } = await buildWhatsAppForOrder({
    order: { ...order, ...completedOrder },
    businessId,
  });

  const customer = {
    name: order.customerName,
    phone: order.customerPhone,
    email: order.customerEmail,
    community: order.customerCommunity,
    notes: order.customerNotes,
  };

  const emailResult = await notifyMarketplaceOrderCompleted({
    order: { ...completedOrder, id: order.id },
    businessName,
    customer,
    paymentMethod: order.paymentMethod,
    fulfillmentLabel: order.fulfillmentLabel || order.selectedDeliveryOption || '',
  });

  return {
    order: { ...completedOrder, id: order.id },
    businessName,
    emailResult,
    whatsappUrl,
    whatsappMessage,
  };
};
