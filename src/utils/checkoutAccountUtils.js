export const CHECKOUT_ACCOUNT_ACTIONS = Object.freeze({
  USE_CURRENT: 'use_current',
  REQUEST_AUTH: 'request_auth',
  GUEST: 'guest',
});

export function resolveCheckoutAccountAction({ currentUser, createAccount = true } = {}) {
  if (currentUser?.uid) {
    return { action: CHECKOUT_ACCOUNT_ACTIONS.USE_CURRENT, uid: currentUser.uid };
  }
  if (createAccount) {
    return { action: CHECKOUT_ACCOUNT_ACTIONS.REQUEST_AUTH, uid: null };
  }
  return { action: CHECKOUT_ACCOUNT_ACTIONS.GUEST, uid: null };
}

export function buildCheckoutAccountProfile({
  email = '',
  name = '',
  phone = '',
  community = '',
} = {}) {
  return {
    email: String(email).trim().toLowerCase(),
    name: String(name).trim(),
    phone: String(phone).trim(),
    community: String(community).trim(),
    role: 'user',
  };
}

export function buildOrderAccountPayload(uid) {
  return { userId: uid || null };
}
