export const MAX_BASKETS_PER_CUSTOMER_CAP = 99;

export const BASKET_BLOCK_REASONS = {
  INACTIVE: 'inactive',
  LIMIT: 'limit',
};

/** Whole number of baskets one customer may order. 0 means no limit. */
export function normalizeMaxPerCustomer(value) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.min(parsed, MAX_BASKETS_PER_CUSTOMER_CAP);
}

/**
 * Admin input -> limit. Empty means no limit (0). Returns null when the input
 * is not a whole number between 0 and the cap, so the form can reject it.
 */
export function parseMaxPerCustomerInput(value) {
  const raw = String(value ?? '').trim();
  if (raw === '') return 0;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_BASKETS_PER_CUSTOMER_CAP) return null;
  return parsed;
}

/** One entry per basket in the cart, in the order the baskets were added. */
export function listCartBasketInstances(cartItems = []) {
  const seen = new Set();
  const instances = [];
  (cartItems || []).forEach((item) => {
    if (!item?.basketInstanceId || seen.has(item.basketInstanceId)) return;
    seen.add(item.basketInstanceId);
    instances.push({
      basketId: item.basketId || '',
      basketInstanceId: item.basketInstanceId,
      title: item.basketTitle || 'סל היכרות',
    });
  });
  return instances;
}

export function getCartBasketIds(cartItems = []) {
  return [...new Set(listCartBasketInstances(cartItems).map((basket) => basket.basketId).filter(Boolean))];
}

export function countCartBaskets(cartItems = [], basketId) {
  return listCartBasketInstances(cartItems).filter((basket) => basket.basketId === basketId).length;
}

/**
 * Baskets in the cart that may not be ordered.
 * basketStates: { [basketId]: { active, maxPerCustomer, remaining } }
 *   remaining = how many more this customer may order (already counts past
 *   orders); null/undefined when unknown, then the cart alone is checked.
 * A basket with no known state is treated as not active.
 * When the cart holds more than allowed, the baskets added last are blocked.
 */
export function findBlockedCartBaskets(cartItems = [], basketStates = {}) {
  const blocked = [];
  const keptByBasket = {};

  listCartBasketInstances(cartItems).forEach((instance) => {
    const state = basketStates[instance.basketId];
    if (!state || state.active !== true) {
      blocked.push({ ...instance, reason: BASKET_BLOCK_REASONS.INACTIVE, maxPerCustomer: 0 });
      return;
    }

    const maxPerCustomer = normalizeMaxPerCustomer(state.maxPerCustomer);
    if (maxPerCustomer === 0) return;

    const remaining = Number(state.remaining);
    const allowed = state.remaining != null && Number.isFinite(remaining)
      ? Math.max(0, Math.min(remaining, maxPerCustomer))
      : maxPerCustomer;
    const kept = keptByBasket[instance.basketId] || 0;
    if (kept >= allowed) {
      blocked.push({ ...instance, reason: BASKET_BLOCK_REASONS.LIMIT, maxPerCustomer });
      return;
    }
    keptByBasket[instance.basketId] = kept + 1;
  });

  return blocked;
}

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Customer-facing explanation, one line per basket title and reason. */
export function describeBlockedBasketsHtml(blocked = []) {
  const lines = [];
  const seen = new Set();
  blocked.forEach((basket) => {
    const key = `${basket.basketId}:${basket.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    const title = escapeHtml(basket.title);
    if (basket.reason === BASKET_BLOCK_REASONS.LIMIT) {
      lines.push(basket.maxPerCustomer === 1
        ? `"${title}" מוגבל לסל אחד ללקוח.`
        : `"${title}" מוגבל ל-${basket.maxPerCustomer} סלים ללקוח.`);
    } else {
      lines.push(`"${title}" כבר לא זמין להזמנה.`);
    }
  });
  return lines.join('<br>');
}
