/**
 * Marketplace order emails — sent via Cloud Function only in production.
 * EmailJS template IDs + private key live on the backend (Firebase secrets).
 *
 * Optional local dev: REACT_APP_MARKETPLACE_EMAIL_BROWSER_FALLBACK=true
 * @see docs/Marketplace-Email-Notifications-BACKEND.md
 */

/**
 * Master switch for all marketplace order emails (checkout, seller alerts, order completed).
 * Disabled by default — set REACT_APP_MARKETPLACE_EMAILS_ENABLED=true in .env when EmailJS quota is restored.
 */
export const MARKETPLACE_EMAILS_ENABLED =
  process.env.REACT_APP_MARKETPLACE_EMAILS_ENABLED === 'true';

/** Default: POST notifyMarketplaceNewOrder (no frontend EmailJS secrets). */
export const MARKETPLACE_USE_BROWSER_EMAIL_FALLBACK =
  process.env.REACT_APP_MARKETPLACE_EMAIL_BROWSER_FALLBACK === 'true';

export const MARKETPLACE_EMAIL_REQUIRE_AUTH =
  process.env.REACT_APP_MARKETPLACE_EMAIL_REQUIRE_AUTH === 'true';

/**
 * Marketplace EmailJS template (renders {{{message_html}}} / {{{message}}} as raw HTML).
 * Used for both seller + customer marketplace emails so browser sending works in dev.
 */
const MARKETPLACE_TEMPLATE_ID = 'template_0kpi8qn';

/** Public key used by the regular store browser EmailJS calls. */
const SHARED_EMAILJS_PUBLIC_KEY = 'U0OVJdWDI7Q-Pl9uT';

/** Only used when browser fallback is enabled (dev). */
export const getMarketplaceSellerTemplateId = () =>
  String(process.env.REACT_APP_EMAILJS_MP_SELLER_TEMPLATE || MARKETPLACE_TEMPLATE_ID).trim();

export const MARKETPLACE_EMAILJS_BROWSER = {
  serviceId: process.env.REACT_APP_EMAILJS_SERVICE_ID || 'service_ao0jk0r',
  publicKey: process.env.REACT_APP_EMAILJS_PUBLIC_KEY || SHARED_EMAILJS_PUBLIC_KEY,
  customerTemplateId:
    process.env.REACT_APP_EMAILJS_MP_CUSTOMER_TEMPLATE || MARKETPLACE_TEMPLATE_ID,
};
