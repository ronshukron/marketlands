import { getMatchConfidence, scoreNameMatch } from './productImageMatching';

const SUPPLIER_NOISE_WORDS = new Set([
  'איכות', 'מעולה', 'מובחר', 'מוזל', 'ישראלי', 'יבוא', 'יחידה', 'יחידות',
  'קרטון', 'ארוז', 'בק', 'קג', 'יח',
]);

export const normalizeSupplierLabel = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[״"'׳`]/g, '')
  .replace(/[^\p{L}\p{N}.\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const meaningfulLabel = (value) => normalizeSupplierLabel(value)
  .split(' ')
  .filter((token) => token.length > 1 && !SUPPLIER_NOISE_WORDS.has(token))
  .join(' ');

export const scoreSupplierProductMatch = (supplierName, productName) => {
  const directScore = scoreNameMatch(supplierName, productName);
  const meaningfulScore = scoreNameMatch(
    meaningfulLabel(supplierName),
    meaningfulLabel(productName)
  );
  return Math.max(directScore, meaningfulScore);
};

export const parseSupplierTextLine = (line, page = null) => {
  const normalizedLine = String(line || '').replace(/\s+/g, ' ').trim();
  const codeMatch = normalizedLine.match(/^([A-Za-z]?\d{1,10})\s+(.+)$/u);
  if (!codeMatch) return null;

  const supplierCode = codeMatch[1].toUpperCase();
  const remainder = codeMatch[2];
  const prices = [...remainder.matchAll(/(?:^|\s)(\d{1,4}[.,]\d{1,2})(?=\s|$)/g)];
  if (prices.length === 0) return null;

  const priceMatch = prices[prices.length - 1];
  const cost = Number(priceMatch[1].replace(',', '.'));
  if (!Number.isFinite(cost) || cost < 0) return null;

  const beforePrice = remainder.slice(0, priceMatch.index).trim();
  const afterPrice = remainder.slice(priceMatch.index + priceMatch[0].length).trim();
  const unitMatch = beforePrice.match(/\s+(ק\s*["״']?\s*ג|ג\s*["״']?\s*ק|יח(?:ידה)?|['׳]יח)\s*$/u);
  const rawUnit = unitMatch?.[1] || '';
  const name = (unitMatch ? beforePrice.slice(0, unitMatch.index) : beforePrice).trim();
  if (!name) return null;

  const normalizedUnit = /יח/u.test(rawUnit) ? 'unit' : /[קג]/u.test(rawUnit) ? 'kg' : 'unknown';

  return {
    supplierCode,
    name,
    unit: normalizedUnit,
    unitLabel: rawUnit,
    cost,
    notes: afterPrice,
    page,
    rawLine: normalizedLine,
  };
};

export const parseSupplierTextLines = (lines = []) => {
  const rows = [];
  const duplicateCodes = new Set();
  const seenCodes = new Set();

  lines.forEach((entry) => {
    const line = typeof entry === 'string' ? entry : entry?.text;
    const row = parseSupplierTextLine(line, entry?.page ?? null);
    if (!row) return;
    if (seenCodes.has(row.supplierCode)) duplicateCodes.add(row.supplierCode);
    seenCodes.add(row.supplierCode);
    rows.push(row);
  });

  return { rows, duplicateCodes: [...duplicateCodes] };
};

export const compareSupplierReports = (currentRows = [], previousRows = []) => {
  const previousByCode = new Map(previousRows.map((row) => [row.supplierCode, row]));
  const currentCodes = new Set(currentRows.map((row) => row.supplierCode));

  const compared = currentRows.map((row) => {
    const previous = previousByCode.get(row.supplierCode);
    if (!previous) {
      return { ...row, previousCost: null, costDelta: null, changePercent: null, changeType: 'new' };
    }
    const previousCost = Number(previous.cost);
    const costDelta = Number(row.cost) - previousCost;
    const changePercent = previousCost > 0 ? (costDelta / previousCost) * 100 : null;
    const changeType = Math.abs(costDelta) < 0.005
      ? 'unchanged'
      : costDelta > 0 ? 'increased' : 'decreased';
    return { ...row, previousCost, costDelta, changePercent, changeType };
  });

  const removed = previousRows
    .filter((row) => !currentCodes.has(row.supplierCode))
    .map((row) => ({ ...row, changeType: 'removed' }));

  return { compared, removed };
};

export const calculateMarginPreservingPrice = ({
  currentPrice,
  previousCost,
  newCost,
  roundTo = 0.1,
}) => {
  if (currentPrice == null || previousCost == null || newCost == null || previousCost === '') {
    return { valid: false, reason: 'missing-baseline', margin: null, suggestedPrice: null };
  }
  const retail = Number(currentPrice);
  const oldCost = Number(previousCost);
  const cost = Number(newCost);
  if (![retail, oldCost, cost].every(Number.isFinite) || retail <= 0 || oldCost < 0 || cost < 0) {
    return { valid: false, reason: 'missing-baseline', margin: null, suggestedPrice: null };
  }

  const margin = (retail - oldCost) / retail;
  if (margin < 0 || margin >= 0.95) {
    return { valid: false, reason: 'invalid-margin', margin, suggestedPrice: null };
  }

  const rawPrice = cost / (1 - margin);
  const suggestedPrice = Math.round(rawPrice / roundTo) * roundTo;
  return {
    valid: Number.isFinite(suggestedPrice),
    reason: null,
    margin,
    suggestedPrice: Number(suggestedPrice.toFixed(2)),
  };
};

export const buildMatchesForBusinesses = ({
  rows = [],
  businesses = [],
  productsByBusiness = {},
  mappings = [],
  minimumScore = 40,
}) => {
  const mappingByKey = new Map(
    mappings.map((mapping) => [`${mapping.businessId}::${mapping.supplierCode}`, mapping])
  );

  return businesses.flatMap((business) => {
    const products = productsByBusiness[business.id] || [];
    return rows.map((row) => {
      const savedMapping = mappingByKey.get(`${business.id}::${row.supplierCode}`);
      const savedProduct = savedMapping
        ? products.find((product) => product.id === savedMapping.productId)
        : null;
      const ranked = products
        .map((product) => ({
          productId: product.id,
          productName: product.name || '',
          score: scoreSupplierProductMatch(row.name, product.name || ''),
        }))
        .sort((a, b) => b.score - a.score);
      const best = savedProduct
        ? { productId: savedProduct.id, productName: savedProduct.name, score: 100 }
        : ranked[0];
      const productId = best?.score >= minimumScore ? best.productId : '';
      const product = products.find((item) => item.id === productId) || null;
      const calculation = product && row.previousCost != null
        ? calculateMarginPreservingPrice({
            currentPrice: product.price,
            previousCost: row.previousCost,
            newCost: row.cost,
          })
        : { valid: false, reason: 'missing-baseline', margin: null, suggestedPrice: null };

      return {
        id: `${business.id}::${row.supplierCode}`,
        ...row,
        businessId: business.id,
        businessName: business.businessName || business.name || business.email || business.id,
        productId,
        product,
        score: best?.score || 0,
        confidence: savedProduct ? 'saved' : getMatchConfidence(best?.score || 0),
        candidates: ranked.slice(0, 8),
        needsReview: !savedProduct && (!productId || (best?.score || 0) < 75),
        enabled: Boolean(savedProduct || ((best?.score || 0) >= 75 && productId)),
        calculation,
        finalPrice: calculation.suggestedPrice,
      };
    });
  });
};
