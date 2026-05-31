import {
  completeMarketplaceOrder,
  getBusinessProfile,
  getMarketplaceStore,
} from './marketplaceService';
import { notifyMarketplaceOrderCompleted } from './marketplaceOrderNotifications';
import {
  buildOrderReadyWhatsAppMessage,
  buildOrderReadyWhatsAppUrl,
} from '../utils/marketplaceOrderWhatsApp';

const getSiteOrigin = () =>
  typeof window !== 'undefined' ? window.location.origin : '';

/**
 * Mark order completed in Firestore, email buyer, return WhatsApp link for seller.
 */
export const finishMarketplaceOrderForSeller = async ({ order, businessId }) => {
  const completedOrder = await completeMarketplaceOrder({
    orderId: order.id,
    businessId,
  });

  const [store, business] = await Promise.all([
    getMarketplaceStore(businessId),
    getBusinessProfile(businessId),
  ]);

  const businessName =
    store?.title || store?.businessName || business?.businessName || order.businessName || 'בסטה';

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

  return {
    order: { ...completedOrder, id: order.id },
    businessName,
    emailResult,
    whatsappUrl,
    whatsappMessage,
  };
};
