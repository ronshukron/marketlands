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
