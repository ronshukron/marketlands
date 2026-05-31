import {
  getDeliveryFeeForMethod,
  normalizeStoreFulfillment,
} from '../../constants/marketplaceFulfillment';
import {
  getBusinessProfile,
  getMarketplaceStore,
  placeMarketplaceStoreCartOrder,
} from '../../services/marketplaceService';
import {
  notifyMarketplaceOrderParties,
  notifyMarketplaceSellerNewOrder,
  resolveSellerNotificationEmail,
} from '../../services/marketplaceOrderNotifications';

export { resolveSellerNotificationEmail };

/**
 * Creates a marketplace order for one business (store cart) and notifies seller + customer.
 */
export const createMarketplaceOrderForBusiness = async ({
  businessId,
  storeTitle = '',
  lines = [],
  customer = {},
  paymentMethod = 'bit',
  skipCustomerEmail = false,
}) => {
  if (!businessId) {
    throw new Error('Missing businessId');
  }

  const [business, store] = await Promise.all([
    getBusinessProfile(businessId),
    getMarketplaceStore(businessId),
  ]);

  const businessName =
    storeTitle || store?.title || store?.businessName || business?.businessName || 'בסטה';
  const ownerEmail = resolveSellerNotificationEmail(store, business);
  const fulfillment = normalizeStoreFulfillment(store);
  const deliveryFee =
    customer.deliveryFee != null
      ? Math.max(0, Number(customer.deliveryFee) || 0)
      : getDeliveryFeeForMethod(fulfillment, customer.fulfillmentMethod);

  const order = await placeMarketplaceStoreCartOrder({
    businessId,
    businessName,
    ownerEmail,
    customer: { ...customer, deliveryFee },
    lines: lines.map((line) => ({
      productId: line.id || line.productId,
      name: line.name,
      quantity: line.quantity,
      price: line.price,
      imageUrl: line.images?.[0] || line.imageUrl || '',
    })),
    paymentMethod,
    customerNotes: customer.notes || '',
  });

  const notifications = skipCustomerEmail
    ? await notifyMarketplaceSellerNewOrder({
        order,
        businessName,
        ownerEmail,
        customer,
        paymentMethod,
        fulfillmentLabel: customer.fulfillmentLabel || '',
      })
    : await notifyMarketplaceOrderParties({
        order,
        businessName,
        ownerEmail,
        customer,
        paymentMethod,
        fulfillmentLabel: customer.fulfillmentLabel || '',
      });

  return {
    ...order,
    businessName,
    notifications,
    fulfillmentLabel: customer.fulfillmentLabel,
    customerNotes: customer.notes || '',
  };
};

export default createMarketplaceOrderForBusiness;
