import { getEstimatedLineTotal, getQuantityDiscountLabel, normalizeQuantityDiscount } from './pricing';

// The customer's recurring basket (basketSubscriptions.recurringLines): what
// each future delivery starts from. Editing it never touches the shared admin
// basket or orders that already exist.

// "None" and "ללא אופציות" both mean the product has no option to choose.
const NO_OPTION_VALUES = new Set(['None', 'ללא אופציות']);
export const normalizeOptionKey = (value) => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text && !NO_OPTION_VALUES.has(text) ? text : '';
};

/** Whether a product's option list holds a real choice (not just "ללא אופציות"). */
export const hasRealOptions = (options) => Array.isArray(options) && options.some((option) => normalizeOptionKey(option));

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

/**
 * What the editor shows for a product: from an admin basket line, a product
 * from listRecurringBasketProducts, or a Products doc.
 * @param {Object} source
 * @return {Object}
 */
export const toProductInfo = (source = {}) => ({
  productName: source.productName || source.name || '',
  image: source.image || (Array.isArray(source.images) ? source.images[0] || '' : ''),
  price: Number(source.price ?? source.priceSnapshot) || 0,
  measurementType: source.measurementType || 'kg',
  unitSize: Number(source.unitSize) || 0,
  averageWeightKg: Number(source.averageWeightKg) || 1,
  businessName: source.businessName || '',
  quantityDiscountThreshold: source.quantityDiscountThreshold ?? null,
  quantityDiscountPrice: source.quantityDiscountPrice ?? null,
  quantityDiscountLabel: source.quantityDiscountLabel || '',
});

/**
 * The product's own quantity discount, as subscription orders apply it
 * (getUnitPricing in functions/utils/subscriptionOrderBuilder.js): the
 * discounted price from the threshold up, only when it is below the regular price.
 * @param {Object} source product, toProductInfo() or a basket line
 * @return {{threshold: number, price: number, label: string}|null}
 */
export const getQuantityDiscount = (source = {}) => {
  const discount = normalizeQuantityDiscount(source.quantityDiscountThreshold, source.quantityDiscountPrice);
  const basePrice = Math.max(0, Number(source.price ?? source.priceSnapshot) || 0);
  if (!discount || discount.quantityDiscountPrice >= basePrice) return null;
  return {
    threshold: discount.quantityDiscountThreshold,
    price: discount.quantityDiscountPrice,
    label: getQuantityDiscountLabel(source),
  };
};

/** Unit price for a quantity, after the product's quantity discount. */
export const getRecurringUnitPricing = (source = {}, quantity = 0) => {
  const basePrice = Math.max(0, Number(source.price ?? source.priceSnapshot) || 0);
  const discount = getQuantityDiscount(source);
  const applied = Boolean(discount) && (Number(quantity) || 0) >= discount.threshold;
  return { basePrice, unitPrice: applied ? discount.price : basePrice, discount, applied };
};

/** Rough cost of one line at today's price, after the quantity discount. */
export const estimateRecurringLine = (source = {}, quantity = 0, measurementType = '') => getEstimatedLineTotal({
  measurementType: measurementType || source.measurementType || 'kg',
  quantity: Number(quantity) || 0,
  price: getRecurringUnitPricing(source, quantity).unitPrice,
  averageWeightKg: Number(source.averageWeightKg) || 1,
});

/** Rough cost of one delivery of these lines at today's prices. */
export const estimateRecurringLines = (lines, productInfo = {}) => lines.reduce((sum, line) => (
  sum + estimateRecurringLine(productInfo[line.productId] || {}, line.quantity, line.measurementType)
), 0);
