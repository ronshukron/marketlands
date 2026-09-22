export const DELAYED_CONFIRM_POLL_ATTEMPTS = 20;
export const DELAYED_CONFIRM_POLL_MS = 2000;

const HELD_PAYMENT_STATUSES = new Set(['held', 'completed', 'charged', 'settled']);
const ABANDONED_STATUSES = new Set(['abandoned', 'cancelled', 'cancelled_by_admin']);
const SUCCESS_CONFIRM_STATES = new Set(['held', 'already_settled']);

let missingConfirmEndpointWarned = false;

export const wait = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export const resetDelayedPaymentConfirmTestState = () => {
  missingConfirmEndpointWarned = false;
};

export const warnMissingConfirmEndpointOnce = () => {
  if (missingConfirmEndpointWarned) return;
  missingConfirmEndpointWarned = true;
  console.warn('confirmDelayedPayment endpoint is missing; treating payment as pending');
};

export const parseDelayedPaymentConfirmPayload = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      state: null,
      recovered: false,
      customerOrderId: null,
      paymentStatus: null,
      delayedOrderStatus: null,
    };
  }
  return {
    ok: data.ok === true,
    state: typeof data.state === 'string' ? data.state : null,
    recovered: Boolean(data.recovered),
    customerOrderId: data.customerOrderId || null,
    paymentStatus: data.paymentStatus || null,
    delayedOrderStatus: data.delayedOrderStatus || null,
  };
};

export const classifyDelayedOrderSnapshot = (data) => {
  const paymentStatus = String(data?.paymentStatus || '').toLowerCase();
  const delayedOrderStatus = String(data?.delayedOrderStatus || '').toLowerCase();
  const heldAt = data?.delayedPayment?.heldAt;
  if (heldAt || HELD_PAYMENT_STATUSES.has(paymentStatus) || delayedOrderStatus === 'pending_weighing') {
    return 'held';
  }
  if (ABANDONED_STATUSES.has(paymentStatus) || ABANDONED_STATUSES.has(delayedOrderStatus)) {
    return 'abandoned';
  }
  return 'pending';
};

export const mapConfirmClientResultToView = (result) => {
  if (!result || result.skipped || result.missingEndpoint) return 'pending';
  const state = String(result.state || '').toLowerCase();
  if (SUCCESS_CONFIRM_STATES.has(state)) return 'success';
  if (state === 'not_paid') return 'not_paid';
  if (state === 'unrecoverable') return 'unrecoverable';
  return 'pending';
};

export const isFirestorePermissionError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '');
  return code.includes('permission')
    || message.toLowerCase().includes('insufficient permissions')
    || message.toLowerCase().includes('missing or insufficient permissions');
};

const normalizeDelayedRead = (result) => {
  if (result && result.readable === false) {
    return { readable: false, exists: false, data: null };
  }
  return {
    readable: true,
    exists: Boolean(result?.exists),
    data: result?.data || null,
  };
};

const safeReadDelayedOrder = async (readDelayedOrder, orderId) => {
  try {
    return normalizeDelayedRead(await readDelayedOrder(orderId));
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      return { readable: false, exists: false, data: null };
    }
    throw error;
  }
};

export async function resolveDelayedPaymentSuccessView({
  orderId,
  growResponse = '',
  readDelayedOrder,
  confirmDelayedPaymentFn,
  pollAttempts = DELAYED_CONFIRM_POLL_ATTEMPTS,
  pollMs = DELAYED_CONFIRM_POLL_MS,
  waitFn = wait,
  isCancelled = () => false,
} = {}) {
  const finish = (kind) => ({
    kind,
    orderId: orderId || null,
    growResponse: String(growResponse || '').toLowerCase(),
  });

  if (!orderId) return finish('success');

  let delayed = await safeReadDelayedOrder(readDelayedOrder, orderId);
  if (isCancelled()) return null;
  if (delayed.readable && !delayed.exists) return finish('success');

  let classification = classifyDelayedOrderSnapshot(delayed.data);
  if (delayed.readable && classification === 'held') return finish('success');

  const confirmResult = await confirmDelayedPaymentFn({ customerOrderId: orderId });
  if (isCancelled()) return null;
  if (confirmResult?.missingEndpoint) warnMissingConfirmEndpointOnce();

  const confirmView = mapConfirmClientResultToView(confirmResult);
  if (confirmView === 'success' || confirmView === 'not_paid' || confirmView === 'unrecoverable') {
    return finish(confirmView);
  }

  if (!delayed.readable) return finish('pending');

  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    if (isCancelled()) return null;
    delayed = await safeReadDelayedOrder(readDelayedOrder, orderId);
    if (!delayed.readable) return finish('pending');
    classification = classifyDelayedOrderSnapshot(delayed.data);
    if (classification === 'held') return finish('success');
    if (classification === 'abandoned') return finish('abandoned');
    await waitFn(pollMs);
  }

  return finish('pending');
}

