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

// handleSuspendedPayment answers 422 amount_above_hold when the total is above
// the order's card hold (the station's order data was stale). Returns the
// amounts so the station can offer to charge exactly the hold, or null.
export function readAmountAboveHoldError(error) {
  const data = error?.response?.data;
  const err = data?.err || data?.error || {};
  if (String(err.code || '').toLowerCase() !== 'amount_above_hold') return null;
  const total = Number(err.total);
  const holdSum = Number(err.holdSum);
  if (!Number.isFinite(total) || !Number.isFinite(holdSum) || holdSum <= 0) return null;
  return { total, holdSum };
}

const formatIls = (value) => `₪${(Number(value) || 0).toFixed(2)}`;

export function interpretHandleSuspendedPaymentError(error) {
  const data = error?.response?.data;
  const status = Number(error?.response?.status) || null;
  const code = String(data?.error?.code || data?.err?.code || '').toLowerCase();
  const missingGrowHold = status === 409 || code === 'missing_grow_hold';
  const aboveHold = readAmountAboveHoldError(error);
  return {
    message: aboveHold
      ? `הסכום ${formatIls(aboveHold.total)} גבוה מהמקסימום לסליקה ${formatIls(aboveHold.holdSum)}`
      : getActionErrorDetail(error),
    code,
    status,
    missingGrowHold,
    aboveHold,
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
