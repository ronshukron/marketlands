// Flyer / QR campaigns: a visitor who arrives through bastabasket.com/q/{code}
// is credited to that campaign for 30 days in this browser (the last campaign
// scanned wins). The code goes on every funnel event (services/funnelService.js),
// on orders created at checkout, and on weekly-basket signups, so the admin
// report (/admin/campaigns) can follow scans to paid orders.

const STORAGE_KEY = 'bastaCampaign';
export const CAMPAIGN_WINDOW_DAYS = 30;
const WINDOW_MS = CAMPAIGN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const browserStorage = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch (error) {
    return null;
  }
};

/** A campaign code: lowercase English letters, digits and dashes (2–40). */
export const normalizeCampaignCode = (value) => {
  const code = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(code) ? code : '';
};

/** Remember the campaign this visitor came from (replaces an older one). */
export const rememberCampaign = (code, { now = Date.now(), storage = browserStorage() } = {}) => {
  const normalized = normalizeCampaignCode(code);
  if (!normalized || !storage) return null;
  const attribution = { code: normalized, at: new Date(now).toISOString() };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch (error) {
    return null;
  }
  return attribution;
};

/** The campaign this visitor came from in the last 30 days, or null. */
export const getActiveCampaign = ({ now = Date.now(), storage = browserStorage() } = {}) => {
  if (!storage) return null;
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    const code = normalizeCampaignCode(saved?.code);
    const at = Date.parse(saved?.at || '');
    if (!code || !Number.isFinite(at)) return null;
    if (now - at > WINDOW_MS) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return { code, at: new Date(at).toISOString() };
  } catch (error) {
    return null;
  }
};

/**
 * Where a campaign link may send people: a path on this site only (never
 * another site), default the home page.
 */
export const safeCampaignTarget = (target) => {
  const value = String(target || '').trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.length > 300) return '/';
  return value;
};

/** The page as a short label for the paths report: "/", "/?category=ירקות", "/my-subscriptions". */
export const campaignPathLabel = (pathname, search = '') => {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search || '');
  const category = params.get('category');
  const label = path === '/' && category ? `/?category=${category}` : path;
  return label.slice(0, 120);
};
