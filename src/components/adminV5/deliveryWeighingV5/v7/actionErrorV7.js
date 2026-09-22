function readTrimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function getActionErrorDetail(error) {
  const data = error?.response?.data;
  const fromString = readTrimmedString(data);
  if (fromString) return fromString;
  if (data && typeof data === 'object') {
    const nested = data.error || data.err || data.message || data.details;
    const direct = readTrimmedString(nested);
    if (direct) return direct;
    if (nested && typeof nested === 'object') {
      const nestedMessage = readTrimmedString(nested.message) || readTrimmedString(nested.error);
      if (nestedMessage) return nestedMessage;
    }
  }
  return readTrimmedString(error?.message);
}

export function interpretHandleSuspendedPaymentError(error) {
  const data = error?.response?.data;
  const status = Number(error?.response?.status) || null;
  const code = String(data?.error?.code || data?.err?.code || '').toLowerCase();
  const missingGrowHold = status === 409 || code === 'missing_grow_hold';
  return {
    message: getActionErrorDetail(error),
    code,
    status,
    missingGrowHold,
    shouldRetry: !missingGrowHold,
    markCompleted: false,
  };
}

export function formatBatchChargeFailureLine(orderName, detail) {
  const name = String(orderName || '').trim();
  const message = String(detail || '').trim();
  if (name && message) return `${name}: ${message}`;
  return name || message;
}
