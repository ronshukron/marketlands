import emailjs from '@emailjs/browser';
import { auth } from '../firebase/firebase';
import {
  MARKETPLACE_EMAILJS_BROWSER,
  MARKETPLACE_EMAIL_REQUIRE_AUTH,
  MARKETPLACE_USE_BROWSER_EMAIL_FALLBACK,
  getMarketplaceSellerTemplateId,
} from '../constants/marketplaceEmailNotifications';
import {
  MARKETPLACE_FUNCTIONS,
  PAYMENT_METHOD_LABELS,
  getBusinessProfile,
  getMarketplaceStore,
} from './marketplaceService';
import {
  BASTA_BASKET_FROM_NAME,
  buildCustomerCombinedCheckoutEmailHtml,
  buildCustomerOrderCompletedEmailHtml,
  buildCustomerOrderEmailHtml,
  buildOrderLinesPlainSummary,
  buildOrderLinesTableHtml,
  buildSellerOrderEmailHtml,
} from '../utils/marketplaceOrderEmailHtml';

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

export const resolveSellerNotificationEmail = (store, business) => {
  const candidates = [
    store?.ownerEmail,
    store?.notificationEmail,
    business?.email,
    business?.contactEmail,
    business?.ownerEmail,
  ];
  for (const candidate of candidates) {
    const trimmed = String(candidate || '').trim();
    if (isValidEmail(trimmed)) return trimmed;
  }
  return '';
};

const getSiteOrigin = () =>
  typeof window !== 'undefined' ? window.location.origin : 'https://your-site.example';

/**
 * Payload for Cloud Function `notifyMarketplaceNewOrder`.
 */
export const buildMarketplaceOrderNotificationPayload = ({
  order,
  businessName,
  ownerEmail,
  customer,
  paymentMethod,
  fulfillmentLabel = '',
}) => {
  const lines = order?.lines || [];
  const paymentLabel = PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod || '';

  return {
    orderId: order?.id || '',
    businessId: order?.businessId || '',
    businessName: businessName || '',
    sellerEmail: isValidEmail(ownerEmail) ? ownerEmail.trim() : '',
    customerEmail: isValidEmail(customer?.email) ? customer.email.trim() : '',
    customerName: customer?.name || '',
    customerPhone: customer?.phone || '',
    customerCommunity: customer?.community || '',
    customerNotes: customer?.notes || '',
    paymentMethod,
    paymentLabel,
    fulfillmentLabel: fulfillmentLabel || order?.fulfillmentLabel || order?.selectedDeliveryOption || '',
    lines: lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      price: line.price,
      total: line.total,
    })),
    linesSummary: buildOrderLinesPlainSummary(lines),
    subtotal: Number(order?.subtotal ?? 0),
    deliveryFee: Number(order?.deliveryFee ?? 0),
    total: Number(order?.total ?? order?.subtotal ?? 0),
    myOrdersUrl: `${getSiteOrigin()}/community-marketplace/my-orders`,
  };
};

const enrichPayloadForEmail = (payload) => {
  const linesHtml = buildOrderLinesTableHtml(payload.lines);
  const enriched = { ...payload, linesHtml };
  const sellerMessageHtml = buildSellerOrderEmailHtml(enriched);
  const customerMessageHtml = buildCustomerOrderEmailHtml(enriched);

  return {
    ...enriched,
    sellerMessageHtml,
    customerMessageHtml,
    /** Pass these objects straight to EmailJS from the Cloud Function (no rebuild). */
    sellerEmailJsParams: buildSellerEmailParamsFromEnriched({
      ...enriched,
      sellerMessageHtml,
      customerMessageHtml,
    }),
    customerEmailJsParams: buildCustomerEmailParamsFromEnriched({
      ...enriched,
      sellerMessageHtml,
      customerMessageHtml,
    }),
  };
};

const buildSellerEmailParamsFromEnriched = (emailPayload) => {
  const params = {
    to_email: emailPayload.sellerEmail,
    to_name: emailPayload.businessName || 'בסטה',
    from_name: BASTA_BASKET_FROM_NAME,
    from_email: emailPayload.customerEmail || 'no-reply@marketplace.local',
    subject: `${BASTA_BASKET_FROM_NAME} — הזמנה חדשה · ${emailPayload.businessName}`,
    order_id: emailPayload.orderId,
    business_name: emailPayload.businessName,
    lines_html: emailPayload.linesHtml,
    message: emailPayload.sellerMessageHtml,
    message_html: emailPayload.sellerMessageHtml,
  };
  if (emailPayload.customerEmail) {
    params.reply_to = emailPayload.customerEmail;
  }
  return params;
};

const buildCustomerEmailParamsFromEnriched = (emailPayload) => ({
  to_email: emailPayload.customerEmail,
  to_name: emailPayload.customerName || 'לקוח',
  from_name: BASTA_BASKET_FROM_NAME,
  subject: `${BASTA_BASKET_FROM_NAME} — אישור הזמנה · ${emailPayload.businessName}`,
  order_id: emailPayload.orderId,
  business_name: emailPayload.businessName,
  payment_method: emailPayload.paymentLabel,
  my_orders_url: emailPayload.myOrdersUrl,
  lines_html: emailPayload.linesHtml,
  message: emailPayload.customerMessageHtml,
  message_html: emailPayload.customerMessageHtml,
});

const normalizePartyResult = (raw, defaultSkipped) => {
  if (!raw || typeof raw !== 'object') {
    return { attempted: false, sent: false, skippedReason: defaultSkipped };
  }
  return {
    attempted: Boolean(raw.attempted),
    sent: Boolean(raw.sent),
    skippedReason: raw.skippedReason ?? (raw.sent ? null : defaultSkipped),
  };
};

/** Seller template keys only — "marketplace seller new order" (not template_ivj0o9k). */
const buildSellerEmailParams = (payload) =>
  buildSellerEmailParamsFromEnriched(enrichPayloadForEmail(payload));

/** Customer template keys only — aligned with template_0kpi8qn / backend. */
const buildCustomerEmailParams = (payload) =>
  buildCustomerEmailParamsFromEnriched(enrichPayloadForEmail(payload));

const sendViaEmailJs = async (templateId, params) => {
  const { serviceId, publicKey } = MARKETPLACE_EMAILJS_BROWSER;
  if (!publicKey) {
    throw new Error('REACT_APP_EMAILJS_PUBLIC_KEY required for browser email fallback');
  }
  await emailjs.send(serviceId, templateId, params, publicKey);
};

const getAuthHeaders = async () => {
  const headers = { 'Content-Type': 'application/json' };
  if (!MARKETPLACE_EMAIL_REQUIRE_AUTH) return headers;

  const user = auth.currentUser;
  if (!user) throw new Error('נדרשת התחברות לשליחת אימיילי הזמנה');
  const token = await user.getIdToken();
  headers.Authorization = `Bearer ${token}`;
  return headers;
};

const postNotifyNewOrder = async (emailPayload) => {
  const headers = await getAuthHeaders();
  const response = await fetch(MARKETPLACE_FUNCTIONS.notifyNewOrder, {
    method: 'POST',
    headers,
    body: JSON.stringify(emailPayload),
  });
  if (!response.ok) {
    throw new Error(`notifyMarketplaceNewOrder HTTP ${response.status}`);
  }
  return response.json().catch(() => ({}));
};

const notifyViaCloudFunction = async (payload) => {
  const emailPayload = enrichPayloadForEmail(payload);
  const data = await postNotifyNewOrder(emailPayload);
  return {
    seller: normalizePartyResult(data.seller, 'no_seller_email'),
    customer: normalizePartyResult(data.customer, 'no_customer_email'),
  };
};

/** Seller email only (customerEmail cleared so existing backend skips buyer mail). */
export const notifyMarketplaceSellerNewOrder = async ({
  order,
  businessName,
  ownerEmail,
  customer,
  paymentMethod,
  fulfillmentLabel = '',
}) => {
  const payload = buildMarketplaceOrderNotificationPayload({
    order,
    businessName,
    ownerEmail,
    customer,
    paymentMethod,
    fulfillmentLabel,
  });
  const enriched = enrichPayloadForEmail(payload);
  const sellerOnlyBody = {
    ...enriched,
    customerEmail: '',
    customerMessageHtml: '',
    customerEmailJsParams: undefined,
  };

  if (!MARKETPLACE_USE_BROWSER_EMAIL_FALLBACK) {
    try {
      const data = await postNotifyNewOrder(sellerOnlyBody);
      return {
        seller: normalizePartyResult(data.seller, 'no_seller_email'),
        customer: normalizePartyResult(null, 'no_customer_email'),
      };
    } catch (error) {
      console.warn('notifyMarketplaceSellerNewOrder cloud failed', error);
      return {
        seller: { attempted: true, sent: false, skippedReason: 'cloud_function_failed' },
        customer: normalizePartyResult(null, 'no_customer_email'),
      };
    }
  }

  let seller = normalizePartyResult(null, 'no_seller_email');
  if (payload.sellerEmail) {
    const sellerTemplateId = getMarketplaceSellerTemplateId();
    if (!sellerTemplateId) {
      seller = { attempted: true, sent: false, skippedReason: 'missing_seller_template_id' };
    } else {
      try {
        await sendViaEmailJs(sellerTemplateId, buildSellerEmailParams(payload));
        seller = { attempted: true, sent: true, skippedReason: null };
      } catch (error) {
        seller = { attempted: true, sent: false, skippedReason: error?.message || 'send_failed' };
      }
    }
  }
  return { seller, customer: normalizePartyResult(null, 'no_customer_email') };
};

export const buildCombinedCustomerNotificationPayload = ({ orders = [], customer = {}, paymentMethod = '' }) => {
  const paymentLabel = PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod || '';
  const myOrdersUrl = `${getSiteOrigin()}/community-marketplace/my-orders`;
  const customerEmail = isValidEmail(customer?.email) ? customer.email.trim() : '';

  const orderSections = orders.map((order) => ({
    businessName: order.businessName,
    orderId: order.id,
    fulfillmentLabel: order.fulfillmentLabel || order.selectedDeliveryOption || '',
    lines: order.lines || [],
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    customerNotes: order.customerNotes || '',
  }));

  const grandSubtotal = orders.reduce((sum, order) => sum + Number(order.subtotal || 0), 0);
  const grandDeliveryFee = orders.reduce((sum, order) => sum + Number(order.deliveryFee || 0), 0);
  const grandTotal = orders.reduce(
    (sum, order) => sum + Number(order.total ?? order.subtotal ?? 0),
    0
  );

  const customerMessageHtml = buildCustomerCombinedCheckoutEmailHtml({
    customerName: customer?.name || '',
    paymentLabel,
    myOrdersUrl,
    orderSections,
    grandSubtotal,
    grandDeliveryFee,
    grandTotal,
  });

  const storeCount = orders.length;
  const subject =
    storeCount > 1
      ? `${BASTA_BASKET_FROM_NAME} — אישור ${storeCount} הזמנות · שוק הבסטות`
      : `${BASTA_BASKET_FROM_NAME} — אישור הזמנה · ${orderSections[0]?.businessName || 'הבסטה'}`;

  return {
    orderId: orders.map((order) => order.id).filter(Boolean).join(','),
    businessId: '',
    businessName: storeCount > 1 ? `${storeCount} בסטות` : orderSections[0]?.businessName || '',
    sellerEmail: '',
    customerEmail,
    customerName: customer?.name || '',
    customerPhone: customer?.phone || '',
    customerCommunity: customer?.community || '',
    paymentMethod,
    paymentLabel,
    fulfillmentLabel: '',
    lines: [],
    linesSummary: '',
    subtotal: grandSubtotal,
    deliveryFee: grandDeliveryFee,
    total: grandTotal,
    myOrdersUrl,
    sellerMessageHtml: '',
    customerMessageHtml,
    linesHtml: '',
    customerEmailJsParams: {
      to_email: customerEmail,
      to_name: customer?.name || 'לקוח',
      from_name: BASTA_BASKET_FROM_NAME,
      subject,
      order_id: orders[0]?.id || '',
      business_name: storeCount > 1 ? `${storeCount} בסטות` : orderSections[0]?.businessName || '',
      payment_method: paymentLabel,
      my_orders_url: myOrdersUrl,
      message: customerMessageHtml,
      message_html: customerMessageHtml,
    },
  };
};

/** One buyer email for entire multi-store checkout (uses same notifyMarketplaceNewOrder endpoint). */
export const notifyMarketplaceCustomerCombinedCheckout = async ({ orders, customer, paymentMethod }) => {
  const payload = buildCombinedCustomerNotificationPayload({ orders, customer, paymentMethod });

  if (!payload.customerEmail) {
    return { attempted: false, sent: false, skippedReason: 'no_customer_email' };
  }

  if (!MARKETPLACE_USE_BROWSER_EMAIL_FALLBACK) {
    try {
      const data = await postNotifyNewOrder(payload);
      return normalizePartyResult(data.customer, 'no_customer_email');
    } catch (error) {
      console.warn('notifyMarketplaceCustomerCombinedCheckout cloud failed', error);
      try {
        await sendViaEmailJs(
          MARKETPLACE_EMAILJS_BROWSER.customerTemplateId,
          payload.customerEmailJsParams
        );
        return { attempted: true, sent: true, skippedReason: null };
      } catch (fallbackError) {
        return {
          attempted: true,
          sent: false,
          skippedReason: fallbackError?.message || 'send_failed',
        };
      }
    }
  }

  try {
    await sendViaEmailJs(
      MARKETPLACE_EMAILJS_BROWSER.customerTemplateId,
      payload.customerEmailJsParams
    );
    return { attempted: true, sent: true, skippedReason: null };
  } catch (error) {
    return { attempted: true, sent: false, skippedReason: error?.message || 'send_failed' };
  }
};

const notifyViaBrowserEmailJs = async (payload) => {
  let seller = normalizePartyResult(null, 'no_seller_email');
  let customer = normalizePartyResult(null, 'no_customer_email');

  if (payload.sellerEmail) {
    const sellerTemplateId = getMarketplaceSellerTemplateId();
    if (!sellerTemplateId) {
      console.warn(
        'Marketplace seller email skipped: set REACT_APP_EMAILJS_MP_SELLER_TEMPLATE to the new "marketplace seller new order" template ID (not template_ivj0o9k).'
      );
      seller = {
        attempted: true,
        sent: false,
        skippedReason: 'missing_seller_template_id',
      };
    } else {
      try {
        await sendViaEmailJs(sellerTemplateId, buildSellerEmailParams(payload));
        seller = { attempted: true, sent: true, skippedReason: null };
      } catch (error) {
        console.warn('Marketplace seller email (EmailJS) failed', error);
        seller = {
          attempted: true,
          sent: false,
          skippedReason: error?.message || 'send_failed',
        };
      }
    }
  }

  if (payload.customerEmail) {
    try {
      await sendViaEmailJs(
        MARKETPLACE_EMAILJS_BROWSER.customerTemplateId,
        buildCustomerEmailParams(payload)
      );
      customer = { attempted: true, sent: true, skippedReason: null };
    } catch (error) {
      console.warn('Marketplace customer email (EmailJS) failed', error);
      customer = {
        attempted: true,
        sent: false,
        skippedReason: error?.message || 'send_failed',
      };
    }
  }

  return { seller, customer };
};

/**
 * Sends order notification emails to seller and customer.
 * @returns {Promise<{ seller, customer, payload }>}
 */
export const notifyMarketplaceOrderParties = async ({
  order,
  businessName,
  ownerEmail,
  customer,
  paymentMethod,
  fulfillmentLabel = '',
}) => {
  const payload = buildMarketplaceOrderNotificationPayload({
    order,
    businessName,
    ownerEmail,
    customer,
    paymentMethod,
    fulfillmentLabel,
  });

  if (!MARKETPLACE_USE_BROWSER_EMAIL_FALLBACK) {
    try {
      const result = await notifyViaCloudFunction(payload);
      return { ...result, payload: enrichPayloadForEmail(payload) };
    } catch (error) {
      console.error('notifyMarketplaceNewOrder failed', error);
      return {
        seller: { attempted: true, sent: false, skippedReason: 'cloud_function_failed' },
        customer: { attempted: true, sent: false, skippedReason: 'cloud_function_failed' },
        payload: enrichPayloadForEmail(payload),
      };
    }
  }

  const result = await notifyViaBrowserEmailJs(payload);
  return { ...result, payload: enrichPayloadForEmail(payload) };
};

const enrichCompletedPayloadForEmail = (payload) => {
  const linesHtml = buildOrderLinesTableHtml(payload.lines);
  const enriched = { ...payload, linesHtml };
  const customerMessageHtml = buildCustomerOrderCompletedEmailHtml(enriched);
  return {
    ...enriched,
    customerMessageHtml,
    customerEmailJsParams: {
      to_email: enriched.customerEmail,
      to_name: enriched.customerName || 'לקוח',
      from_name: BASTA_BASKET_FROM_NAME,
      subject: `${BASTA_BASKET_FROM_NAME} — ההזמנה מוכנה · ${enriched.businessName}`,
      order_id: enriched.orderId,
      business_name: enriched.businessName,
      payment_method: enriched.paymentLabel,
      my_orders_url: enriched.myOrdersUrl,
      lines_html: linesHtml,
      message: customerMessageHtml,
      message_html: customerMessageHtml,
    },
  };
};

const notifyOrderCompletedViaCloudFunction = async (payload) => {
  const headers = await getAuthHeaders();
  const emailPayload = enrichCompletedPayloadForEmail(payload);
  const response = await fetch(MARKETPLACE_FUNCTIONS.notifyOrderCompleted, {
    method: 'POST',
    headers,
    body: JSON.stringify(emailPayload),
  });
  if (!response.ok) {
    throw new Error(`notifyMarketplaceOrderCompleted HTTP ${response.status}`);
  }
  const data = await response.json().catch(() => ({}));
  return normalizePartyResult(data.customer, 'no_customer_email');
};

const notifyOrderCompletedViaBrowserEmailJs = async (payload) => {
  if (!payload.customerEmail) {
    return { attempted: false, sent: false, skippedReason: 'no_customer_email' };
  }
  try {
    const emailPayload = enrichCompletedPayloadForEmail(payload);
    await sendViaEmailJs(
      MARKETPLACE_EMAILJS_BROWSER.customerTemplateId,
      emailPayload.customerEmailJsParams
    );
    return { attempted: true, sent: true, skippedReason: null };
  } catch (error) {
    console.warn('Marketplace order-completed email (EmailJS) failed', error);
    return {
      attempted: true,
      sent: false,
      skippedReason: error?.message || 'send_failed',
    };
  }
};

/**
 * Email buyer that their order is ready / completed.
 */
export const notifyMarketplaceOrderCompleted = async ({
  order,
  businessName,
  customer,
  paymentMethod,
  fulfillmentLabel = '',
}) => {
  const base = buildMarketplaceOrderNotificationPayload({
    order,
    businessName,
    ownerEmail: '',
    customer,
    paymentMethod,
    fulfillmentLabel,
  });

  if (!MARKETPLACE_USE_BROWSER_EMAIL_FALLBACK) {
    try {
      return await notifyOrderCompletedViaCloudFunction(base);
    } catch (error) {
      console.warn('notifyMarketplaceOrderCompleted cloud failed, trying browser fallback', error);
      return notifyOrderCompletedViaBrowserEmailJs(base);
    }
  }

  return notifyOrderCompletedViaBrowserEmailJs(base);
};

export const notifyMarketplaceOrderForBusinessId = async ({
  businessId,
  order,
  customer,
  paymentMethod,
  fulfillmentLabel = '',
  storeTitle = '',
}) => {
  const [business, store] = await Promise.all([
    getBusinessProfile(businessId),
    getMarketplaceStore(businessId),
  ]);
  const businessName =
    storeTitle || store?.title || store?.businessName || business?.businessName || 'בסטה';
  const ownerEmail = resolveSellerNotificationEmail(store, business);

  return notifyMarketplaceOrderParties({
    order,
    businessName,
    ownerEmail,
    customer,
    paymentMethod,
    fulfillmentLabel,
  });
};
