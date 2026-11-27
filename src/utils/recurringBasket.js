import {
  findActiveGroupPromotionForProduct,
  getEstimatedLineTotal,
  getGroupPromotionLabel,
  getQuantityDiscountLabel,
  normalizeQuantityDiscount,
} from './pricing';

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
      // The farmer form the product is sold through (recurringLines keep it as orderId).
      formId: String(line.formId || line.orderId || ''),
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
    formId: String(product.formId || ''),
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
  formId: String(source.formId || source.orderId || ''),
  // The farmer: catalog products carry businessId, Products docs Owner_ID.
  businessId: String(source.businessId || source.Owner_ID || ''),
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

/**
 * Unit price of every line, as a delivery would be priced: a farmer's shared
 * promotion ("N for ₪X" across products, businesses/{id}.productPromotions)
 * when the linked products together reach N, else the product's own quantity
 * discount. Same rule as the cart (applyCartPricing) and the server
 * (functions/utils/groupPromotionPricing.js); the order groups by farmer form,
 * the estimate by farmer.
 * @param {Array<Object>} lines
 * @param {Object} productInfo productId -> toProductInfo()
 * @param {Object<string, Array>} [promotionsByBusinessId]
 * @return {Object} recurringLineKey -> {basePrice, unitPrice, applied, discount, group}
 *   group: {label, threshold, applied, missing} when the line is in a shared promotion
 */
export function priceRecurringLines(lines = [], productInfo = {}, promotionsByBusinessId = {}) {
  const promoFor = (line) => {
    const info = productInfo[line.productId] || {};
    const businessId = info.businessId || line.businessId || '';
    if (!businessId) return { promo: null, businessId };
    const promo = findActiveGroupPromotionForProduct(promotionsByBusinessId[businessId] || [], {
      id: line.productId,
      measurementType: line.measurementType || info.measurementType || 'kg',
    });
    return { promo, businessId };
  };
  const assigned = lines.map(promoFor);
  const totals = {};
  lines.forEach((line, index) => {
    const { promo, businessId } = assigned[index];
    if (!promo) return;
    const key = `${businessId}|${promo.id}`;
    totals[key] = roundQuantity((totals[key] || 0) + (Number(line.quantity) || 0));
  });
  const result = {};
  lines.forEach((line, index) => {
    const info = productInfo[line.productId] || {};
    const own = getRecurringUnitPricing(info, line.quantity);
    const { promo, businessId } = assigned[index];
    if (!promo) {
      result[recurringLineKey(line)] = { ...own, group: null };
      return;
    }
    const groupTotal = totals[`${businessId}|${promo.id}`] || 0;
    const groupApplied = groupTotal >= promo.threshold;
    result[recurringLineKey(line)] = {
      ...own,
      unitPrice: groupApplied ? promo.discountedPrice : own.unitPrice,
      applied: groupApplied || own.applied,
      group: {
        label: getGroupPromotionLabel(promo),
        threshold: promo.threshold,
        applied: groupApplied,
        missing: groupApplied ? 0 : roundQuantity(promo.threshold - groupTotal),
      },
    };
  });
  return result;
}

/** Rough cost of one delivery of these lines at today's prices. */
export const estimateRecurringLines = (lines, productInfo = {}, promotionsByBusinessId = {}) => {
  const pricing = priceRecurringLines(lines, productInfo, promotionsByBusinessId);
  return lines.reduce((sum, line) => {
    const info = productInfo[line.productId] || {};
    return sum + getEstimatedLineTotal({
      measurementType: line.measurementType || info.measurementType || 'kg',
      quantity: Number(line.quantity) || 0,
      price: pricing[recurringLineKey(line)]?.unitPrice ?? getRecurringUnitPricing(info, line.quantity).unitPrice,
      averageWeightKg: Number(info.averageWeightKg) || 1,
    });
  }, 0);
};

/**
 * What changed between the saved recurring basket and the new one, per
 * product and option. Used to offer the same change on a delivery that is
 * already open: each entry is the quantity that delivery should now hold.
 * Products that were never in the recurring basket are not listed, so a
 * product the customer added to one delivery only is left alone.
 * @param {Array<Object>} before recurring lines before the save
 * @param {Array<Object>} after recurring lines as saved
 * @return {Array<{key, productId, selectedOption, productName, formId, before, quantity, change}>}
 *   change is 'added' | 'removed' | 'changed'; quantity is 0 for a removal
 */
export function diffRecurringLines(before = [], after = []) {
  const toMap = (lines) => new Map((lines || [])
    .filter((line) => line && line.productId)
    .map((line) => [recurringLineKey(line), line]));
  const previous = toMap(before);
  const next = toMap(after);
  const changes = [];
  next.forEach((line, key) => {
    const old = previous.get(key);
    const quantity = roundQuantity(line.quantity);
    const oldQuantity = old ? roundQuantity(old.quantity) : 0;
    if (old && oldQuantity === quantity) return;
    changes.push({
      key,
      productId: line.productId,
      selectedOption: normalizeOptionKey(line.selectedOption),
      productName: line.productName || (old && old.productName) || '',
      formId: line.formId || (old && old.formId) || '',
      before: oldQuantity,
      quantity,
      change: old ? 'changed' : 'added',
    });
  });
  previous.forEach((line, key) => {
    if (next.has(key)) return;
    changes.push({
      key,
      productId: line.productId,
      selectedOption: normalizeOptionKey(line.selectedOption),
      productName: line.productName || '',
      formId: line.formId || '',
      before: roundQuantity(line.quantity),
      quantity: 0,
      change: 'removed',
    });
  });
  return changes;
}

/**
 * The recurring lines with one more product, at the quantity the customer has
 * in this week's delivery. A product that is already there is not changed.
 * @param {Array<Object>} lines initialRecurringLines(...).lines
 * @param {{productId: string, selectedOption?: string, quantity: number, productName?: string, measurementType?: string, unitSize?: number, formId?: string}} product
 * @return {{lines: Array<Object>, alreadyThere: boolean}}
 */
export function withRecurringLine(lines, product) {
  const current = Array.isArray(lines) ? lines : [];
  const selectedOption = normalizeOptionKey(product?.selectedOption);
  const key = recurringLineKey({ productId: product?.productId, selectedOption });
  if (current.some((line) => recurringLineKey(line) === key)) return { lines: current, alreadyThere: true };
  return {
    alreadyThere: false,
    lines: [...current, {
      productId: product.productId,
      quantity: roundQuantity(product.quantity),
      selectedOption,
      productName: product.productName || '',
      measurementType: product.measurementType || 'kg',
      unitSize: Number(product.unitSize) || 0,
      formId: String(product.formId || ''),
    }],
  };
}

/** Whether a product is in the customer's own recurring lines. */
export const isInRecurringLines = (subscription, productId, selectedOption = '') => {
  const key = recurringLineKey({ productId, selectedOption: normalizeOptionKey(selectedOption) });
  return (Array.isArray(subscription?.recurringLines) ? subscription.recurringLines : [])
    .some((line) => recurringLineKey(line) === key);
};
