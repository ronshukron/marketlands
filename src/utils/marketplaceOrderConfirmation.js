const STORAGE_KEY = 'marketplaceOrderConfirmation';

export const saveOrderConfirmationSession = (payload) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to save order confirmation session', error);
  }
};

export const loadOrderConfirmationSession = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Failed to load order confirmation session', error);
    return null;
  }
};

export const clearOrderConfirmationSession = () => {
  sessionStorage.removeItem(STORAGE_KEY);
};
