const DELAYED_ORDER_STORAGE_KEY = 'lastDelayedCustomerOrderId';

const readStoredDelayedOrderId = () => {
  try {
    return window.sessionStorage.getItem(DELAYED_ORDER_STORAGE_KEY)
      || window.sessionStorage.getItem('debugDelayedCustomerOrderId');
  } catch (error) {
    return null;
  }
};

export const storeDelayedCustomerOrderId = (customerOrderId) => {
  if (!customerOrderId) return;
  try {
    window.sessionStorage.setItem(DELAYED_ORDER_STORAGE_KEY, customerOrderId);
    window.sessionStorage.setItem('debugDelayedCustomerOrderId', customerOrderId);
  } catch (error) {
    // ignore
  }
};

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Origin Grow sends the customer back to after paying or cancelling.
 * Grow needs a full https URL, so "relative" means: the exact site the customer
 * is on right now (www.bastabasket.com or bastabasket.com). That keeps the cart
 * and the stored order id, which the browser keeps per origin.
 * REACT_APP_GROW_RETURN_ORIGIN is only for local development, where Grow
 * rejects localhost. It is ignored on a real host even if it got into the build.
 */
export const getGrowReturnOrigin = (
  location = window.location,
  devOverride = process.env.REACT_APP_GROW_RETURN_ORIGIN,
) => {
  const override = String(devOverride || '').trim().replace(/\/$/, '');
  if (override && LOCAL_HOSTNAMES.includes(location.hostname)) return override;
  return location.origin;
};

export const buildGrowSuccessUrl = (origin, customerOrderId) => {
  const base = `${String(origin || '').replace(/\/$/, '')}/payment-success/`;
  if (!customerOrderId) return base;
  return `${base}?customerOrderId=${encodeURIComponent(customerOrderId)}`;
};

/**
 * Grow appends `&response=success` (and cFields) even when the successUrl has no query.
 * That can land in pathname instead of location.search.
 */
export const parseGrowReturnParams = (location = {}) => {
  const params = new URLSearchParams(location.search || '');
  const fromPath = String(location.pathname || '').split('&').slice(1);
  fromPath.forEach((part) => {
    if (!part) return;
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    const value = eq === -1 ? '' : part.slice(eq + 1);
    if (key && !params.has(key)) {
      try {
        params.set(key, decodeURIComponent(value.replace(/\+/g, ' ')));
      } catch (error) {
        params.set(key, value);
      }
    }
  });
  const hash = String(location.hash || '');
  if (hash.includes('=')) {
    const hashQuery = hash.startsWith('#') ? hash.slice(1) : hash;
    const hashParams = new URLSearchParams(hashQuery.startsWith('?') ? hashQuery.slice(1) : hashQuery);
    hashParams.forEach((value, key) => {
      if (key && !params.has(key)) params.set(key, value);
    });
  }
  return params;
};

export const resolveReturnedCustomerOrderId = (location) => {
  const params = parseGrowReturnParams(location);
  return params.get('cField2')
    || params.get('customerOrderId')
    || params.get('orderId')
    || readStoredDelayedOrderId();
};
