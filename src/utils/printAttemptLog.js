// The last print attempts on this station, newest first, so the next
// "the print button seemed bugged" can be read instead of guessed.
// Kept in localStorage only; holds order ids and carton numbers, no customer data.

const STORAGE_KEY = 'deliveryV7::printLog';
export const PRINT_LOG_LIMIT = 50;

export function readPrintAttempts() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {Object} attempt
 * @param {string} attempt.orderId
 * @param {number} attempt.carton
 * @param {string} attempt.code 'ok', 'ok_confirmed' (timeout, worker saw the label) or the printer's error code
 * @param {number} attempt.durationMs
 * @param {string} [attempt.sync] 'saved' | 'pending' after the carton count save
 * @param {Date} [now]
 */
export function appendPrintAttempt(attempt, now = new Date()) {
  if (typeof localStorage === 'undefined' || !attempt) return;
  const entry = {
    at: now.toISOString(),
    orderId: String(attempt.orderId || ''),
    carton: Math.max(0, Math.floor(Number(attempt.carton) || 0)),
    code: String(attempt.code || 'unknown'),
    durationMs: Math.max(0, Math.round(Number(attempt.durationMs) || 0)),
    ...(attempt.sync ? { sync: String(attempt.sync) } : {}),
  };
  try {
    const next = [entry, ...readPrintAttempts()].slice(0, PRINT_LOG_LIMIT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the log is a diagnostic, printing goes on.
  }
}

/** Record the carton-count save result on the newest attempt for that order and carton. */
export function markPrintAttemptSync(orderId, carton, sync) {
  if (typeof localStorage === 'undefined') return;
  const all = readPrintAttempts();
  const target = all.find((entry) => entry.orderId === orderId && entry.carton === carton);
  if (!target) return;
  target.sync = sync;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}
