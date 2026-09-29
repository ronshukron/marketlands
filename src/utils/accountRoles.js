export function isTruthyAccountFlag(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function isIndependentBusinessAccount(data = {}) {
  return isTruthyAccountFlag(data?.isIndependent)
    || isTruthyAccountFlag(data?.IsIndependent)
    || isTruthyAccountFlag(data?.IsIndepent);
}

export function isDriverBusinessAccount(data = {}) {
  return isTruthyAccountFlag(data?.isDriver)
    || isTruthyAccountFlag(data?.IsDriver);
}

export function isDeliveryDriverAccount(data = {}) {
  return isDriverBusinessAccount(data) && !isIndependentBusinessAccount(data);
}

/** Set businesses/{uid}.canCreateOrderForms to false to hide sale-listing creation. */
export function isOrderFormCreationDisabled(data = {}) {
  return data?.canCreateOrderForms === false;
}

const ADMIN_ACCOUNT_UIDS = [
  'rfHOLhNoJOW8ByNypCtm3hlSNKs2',
  'Q0bohhVCdmeMhgBbDknvLxbEzW53',
];

export function isAdminAccount(user, userRole) {
  if (!user?.uid) return false;
  return userRole === 'admin' || ADMIN_ACCOUNT_UIDS.includes(user.uid);
}

function emailsMatch(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

export function canEditBusinessOrder(user, userRole, order) {
  if (!user || !order) return false;
  if (isAdminAccount(user, userRole)) return true;
  if (order.businessId && order.businessId === user.uid) return true;
  if (order.businessEmail && emailsMatch(order.businessEmail, user.email)) return true;
  if (order.Coordinator_Email && emailsMatch(order.Coordinator_Email, user.email)) return true;
  return false;
}
