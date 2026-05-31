/**
 * Marketplace order emails — sent via Cloud Function only in production.
 * EmailJS template IDs + private key live on the backend (Firebase secrets).
 *
 * Optional local dev: REACT_APP_MARKETPLACE_EMAIL_BROWSER_FALLBACK=true
 * @see docs/Marketplace-Email-Notifications-BACKEND.md
 */

/** Default: POST notifyMarketplaceNewOrder (no frontend EmailJS secrets). */
export const MARKETPLACE_USE_BROWSER_EMAIL_FALLBACK =
  process.env.REACT_APP_MARKETPLACE_EMAIL_BROWSER_FALLBACK === 'true';

export const MARKETPLACE_EMAIL_REQUIRE_AUTH =
  process.env.REACT_APP_MARKETPLACE_EMAIL_REQUIRE_AUTH === 'true';

/** Only used when browser fallback is enabled (dev). */
export const getMarketplaceSellerTemplateId = () =>
  String(process.env.REACT_APP_EMAILJS_MP_SELLER_TEMPLATE || '').trim();

export const MARKETPLACE_EMAILJS_BROWSER = {
  serviceId: process.env.REACT_APP_EMAILJS_SERVICE_ID || 'service_ao0jk0r',
  publicKey: process.env.REACT_APP_EMAILJS_PUBLIC_KEY || '',
  customerTemplateId:
    process.env.REACT_APP_EMAILJS_MP_CUSTOMER_TEMPLATE || 'template_0kpi8qn',
};
