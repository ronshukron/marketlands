// The customer's recurring basket (basketSubscriptions.recurringLines): what
// each future delivery starts from. Editing it never touches the shared admin
// basket or orders that already exist.

export const normalizeOptionKey = (value) => (value && value !== 'None' ? String(value) : '');

export const recurringLineKey = (line) => `${line?.productId || ''}|${normalizeOptionKey(line?.selectedOption)}`;

export const quantityStep = (measurementType, unitSize) => (
  (measurementType || 'kg') === 'kg' ? (Number(unitSize) > 0 ? Number(unitSize) : 0.5) : 1
);

export const roundQuantity = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

/**
 * The lines the editor starts from: the customer's own, or the admin basket's.
 * @param {Object} subscription
 * @param {Object|null} basket subscriptionBaskets doc
 * @return {{lines: Array<Object>, personal: boolean}}
 */
export function initialRecurringLines(subscription, basket) {
  const personal = Array.isArray(subscription?.recurringLines) ? subscription.recurringLines : [];
  const source = personal.length > 0 ? personal : (Array.isArray(basket?.componentLines) ? basket.componentLines : []);
  const lines = source
    .filter((line) => line && line.productId && Number(line.quantity) > 0)
    .map((line) => ({
      productId: String(line.productId),
      quantity: roundQuantity(line.quantity),
      selectedOption: normalizeOptionKey(line.selectedOption),
      productName: line.productName || line.name || '',
      measurementType: line.measurementType || '',
      unitSize: Number(line.unitSize) || 0,
    }));
  return { lines, personal: personal.length > 0 };
}

/** Add a product, or more of it when it is already in the basket. */
export function addRecurringLine(lines, product, selectedOption = '') {
  const option = normalizeOptionKey(selectedOption);
  const key = recurringLineKey({ productId: product.productId, selectedOption: option });
  const step = quantityStep(product.measurementType, product.unitSize);
  const existing = lines.find((line) => recurringLineKey(line) === key);
  if (existing) {
    return lines.map((line) => (line === existing ? { ...line, quantity: roundQuantity(line.quantity + step) } : line));
  }
  return [...lines, {
    productId: product.productId,
    quantity: step,
    selectedOption: option,
    productName: product.productName || '',
    measurementType: product.measurementType || 'kg',
    unitSize: Number(product.unitSize) || 0,
  }];
}

/** New quantity for one line; 0 or less removes it. */
export function setRecurringLineQuantity(lines, key, quantity) {
  const next = roundQuantity(quantity);
  if (next <= 0) return lines.filter((line) => recurringLineKey(line) !== key);
  return lines.map((line) => (recurringLineKey(line) === key ? { ...line, quantity: next } : line));
}

/** What updateRecurringBasket expects. */
export const toRecurringPayload = (lines) => lines.map((line) => ({
  productId: line.productId,
  quantity: roundQuantity(line.quantity),
  selectedOption: normalizeOptionKey(line.selectedOption),
}));

export function isRecurringBasketChanged(initial, current) {
  const signature = (lines) => toRecurringPayload(lines)
    .map((line) => `${line.productId}|${line.selectedOption}|${line.quantity}`)
    .sort()
    .join(',');
  return signature(initial) !== signature(current);
}
