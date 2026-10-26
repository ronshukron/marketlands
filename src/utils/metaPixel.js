/**
 * Meta Pixel for the storefront.
 * The base snippet is injected once. Standard events fire from the action
 * that actually happened (search, add to cart, paid order), because this
 * app is a single-page React site — pasting every event under <head> would
 * send Purchase on every page load.
 *
 * Set REACT_APP_META_PIXEL_ID to the numeric id from Events Manager
 * (the value inside fbq('init', '...')) and rebuild.
 */

export const META_CURRENCY = 'ILS';
export const PENDING_PURCHASE_KEY = 'bb_meta_pending_purchase';
export const FIRED_PURCHASE_KEY = 'bb_meta_fired_purchases';
const PENDING_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const CONTENT_LIMIT = 20;

const BLOCKED_PATH_PREFIXES = [
  '/admin',
  '/driver',
  '/business-dashboard',
  '/business-products',
  '/business-promotions',
  '/business/',
  '/add-product',
  '/edit-product',
  '/edit-order',
  '/bulk-',
  '/create-order-for-business',
  '/order-form-business',
  '/business-order-summary',
  '/independent-orders',
  '/farmer-orders',
];

let lastPageKey = '';

export const normalizePixelId = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 5 ? digits : '';
};

export const getMetaPixelId = () => normalizePixelId(process.env.REACT_APP_META_PIXEL_ID);

export const isCustomerTrackingPath = (pathname = '/') => {
  const path = String(pathname || '/').split('?')[0].toLowerCase() || '/';
  return !BLOCKED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const roundQuantity = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

export const contentIdFor = (item = {}) => {
  const id = item.id ?? item.productId;
  if (id !== undefined && id !== null && String(id).trim()) return String(id).trim();
  if (item.catalogNumber !== undefined && item.catalogNumber !== null && String(item.catalogNumber).trim()) {
    return String(item.catalogNumber).trim();
  }
  return '';
};

export const commerceContents = (items = []) => {
  const merged = new Map();
  items.forEach((item) => {
    if (!item || item.isShipping || item.isBasketAdjustment) return;
    const id = contentIdFor(item);
    if (!id) return;
    const quantity = Number(item.quantity);
    const safeQty = Number.isFinite(quantity) && quantity > 0 ? roundQuantity(quantity) : 1;
    const unitPrice = Number(item.item_price ?? item.price);
    const existing = merged.get(id);
    if (existing) {
      existing.quantity = roundQuantity(existing.quantity + safeQty);
      return;
    }
    const entry = { id, quantity: safeQty };
    if (Number.isFinite(unitPrice) && unitPrice >= 0) entry.item_price = roundMoney(unitPrice);
    merged.set(id, entry);
  });
  return [...merged.values()].slice(0, CONTENT_LIMIT);
};

export const buildEventParams = ({
  value,
  items,
  contentName,
  contentCategory,
  searchString,
} = {}) => {
  const params = {};
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue >= 0) {
    params.value = roundMoney(numericValue);
    params.currency = META_CURRENCY;
  }

  const contents = commerceContents(items);
  if (contents.length) {
    params.contents = contents;
    params.content_ids = contents.map((entry) => entry.id);
    params.content_type = 'product';
    params.num_items = roundQuantity(contents.reduce((sum, entry) => sum + entry.quantity, 0));
  }

  const name = String(contentName || '').trim();
  if (name) params.content_name = name.slice(0, 100);
  const category = String(contentCategory || '').trim();
  if (category) params.content_category = category.slice(0, 100);
  const search = String(searchString || '').trim();
  if (search) params.search_string = search.slice(0, 200);
  return params;
};

const safeSession = () => {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch (error) {
    return null;
  }
};

export const readPendingPurchase = (storage = safeSession()) => {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PENDING_PURCHASE_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw);
    if (!pending || typeof pending !== 'object') return null;
    const savedAt = Number(pending.savedAt) || 0;
    if (!savedAt || Date.now() - savedAt > PENDING_MAX_AGE_MS) {
      storage.removeItem(PENDING_PURCHASE_KEY);
      return null;
    }
    return pending;
  } catch (error) {
    return null;
  }
};

export const rememberPendingPurchase = (payload = {}, storage = safeSession()) => {
  if (!storage) return false;
  try {
    storage.setItem(PENDING_PURCHASE_KEY, JSON.stringify({
      orderId: String(payload.orderId || ''),
      value: Number(payload.value),
      contentName: payload.contentName || '',
      items: commerceContents(payload.items).map((entry) => ({
        id: entry.id,
        quantity: entry.quantity,
        price: entry.item_price,
      })),
      savedAt: Date.now(),
    }));
    return true;
  } catch (error) {
    return false;
  }
};

export const discardPendingPurchase = (orderId, storage = safeSession()) => {
  if (!storage) return;
  const pending = readPendingPurchase(storage);
  if (!pending) return;
  if (orderId && pending.orderId && String(orderId) !== String(pending.orderId)) return;
  try {
    storage.removeItem(PENDING_PURCHASE_KEY);
  } catch (error) {
    // Ignore storage failures. Tracking must not block checkout.
  }
};

export const reservePurchaseEvent = (storage, orderId) => {
  const id = String(orderId || '').trim();
  if (!id) return true;
  if (!storage) return true;
  try {
    const raw = storage.getItem(FIRED_PURCHASE_KEY);
    const fired = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(fired) ? fired.map(String) : [];
    if (list.includes(id)) return false;
    storage.setItem(FIRED_PURCHASE_KEY, JSON.stringify([...list, id].slice(-40)));
    return true;
  } catch (error) {
    return true;
  }
};

export const installMetaPixel = (pixelId, win = typeof window !== 'undefined' ? window : undefined) => {
  const id = normalizePixelId(pixelId);
  if (!id || !win || win.fbq) return false;

  const fbq = function fbqStub() {
    if (fbq.callMethod) {
      fbq.callMethod.apply(fbq, arguments);
    } else {
      fbq.queue.push(arguments);
    }
  };
  if (!win._fbq) win._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  win.fbq = fbq;

  const documentRef = win.document;
  if (documentRef && typeof documentRef.createElement === 'function') {
    const script = documentRef.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const firstScript = documentRef.getElementsByTagName?.('script')?.[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else if (documentRef.head?.appendChild) {
      documentRef.head.appendChild(script);
    } else if (documentRef.documentElement?.appendChild) {
      documentRef.documentElement.appendChild(script);
    }
  }

  win.fbq('init', id);
  return true;
};

export const trackMetaEvent = (eventName, params) => {
  const pixelId = getMetaPixelId();
  if (!pixelId || typeof window === 'undefined') return false;
  if (!isCustomerTrackingPath(window.location?.pathname || '/')) return false;
  installMetaPixel(pixelId, window);
  if (typeof window.fbq !== 'function') return false;
  if (params && Object.keys(params).length > 0) {
    window.fbq('track', eventName, params);
  } else {
    window.fbq('track', eventName);
  }
  return true;
};

export const trackPageView = (pathname = '/') => {
  const path = String(pathname || '/');
  const bare = path.split('?')[0] || '/';
  if (!isCustomerTrackingPath(bare)) return false;
  if (lastPageKey === path) return false;
  lastPageKey = path;
  return trackMetaEvent('PageView');
};

export const trackViewContent = (payload = {}) => (
  trackMetaEvent('ViewContent', buildEventParams(payload))
);

export const trackSearch = ({ searchString, items } = {}) => {
  const term = String(searchString || '').trim();
  if (term.length < 2) return false;
  return trackMetaEvent('Search', buildEventParams({ searchString: term, items }));
};

export const trackAddToCart = (payload = {}) => (
  trackMetaEvent('AddToCart', buildEventParams(payload))
);

export const trackInitiateCheckout = (payload = {}) => (
  trackMetaEvent('InitiateCheckout', buildEventParams(payload))
);

export const trackAddPaymentInfo = (payload = {}) => (
  trackMetaEvent('AddPaymentInfo', buildEventParams(payload))
);

export const trackPurchase = (payload = {}, { includePaymentInfo = false, storage = safeSession() } = {}) => {
  if (!getMetaPixelId()) return false;
  const orderId = String(payload.orderId || '').trim();
  if (orderId && !reservePurchaseEvent(storage, orderId)) return false;
  const params = buildEventParams(payload);
  if (includePaymentInfo) trackMetaEvent('AddPaymentInfo', params);
  return trackMetaEvent('Purchase', params);
};

export const trackPendingPurchase = (orderId, storage = safeSession()) => {
  if (!getMetaPixelId()) return false;
  const pending = readPendingPurchase(storage);
  if (!pending) return false;
  if (orderId && pending.orderId && String(orderId) !== String(pending.orderId)) return false;
  try {
    storage?.removeItem(PENDING_PURCHASE_KEY);
  } catch (error) {
    // Continue. The fired-purchase key still prevents a second Purchase.
  }
  return trackPurchase({
    orderId: pending.orderId || orderId || '',
    value: pending.value,
    items: pending.items,
    contentName: pending.contentName,
  }, { includePaymentInfo: true, storage });
};

export const trackCompleteRegistration = () => trackMetaEvent('CompleteRegistration');

export const trackContact = () => trackMetaEvent('Contact');

export const resetMetaPixelForTests = () => {
  lastPageKey = '';
};
