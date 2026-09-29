const NIKUD_RE = /[\u0591-\u05C7]/g;
const QUOTES_RE = /[״"'׳`’‘]/g;
const DATE_RE = /\d{1,2}[./]\d{1,2}[./]\d{2,4}/g;
const LEADING_BULLET_RE = /^(?:[*•·]+\s*|-\s+|\(\d+\)\s+|\d+[.)]\s+)/;
const QUANTITY_RE = /(\d+(?:[.,]\d+)?)/g;
const UNIT_BODY = '(?:ק\\s*["״\'׳`’‘]?\\s*ג|קג|יח(?:ידה|ידות)?\\s*["״\'׳`’‘]?|גרם|ג\\s*["״\'׳`’‘])';
const TRAILING_UNIT_RE = new RegExp(`(?:^|\\s)(${UNIT_BODY})\\s*$`, 'u');

const NOISE_TOKENS = new Set([
  'מארז', 'קופסא', 'ארוז', 'יח', 'יחידה', 'יחידות', 'קג', 'גרם', 'קילו', 'קילוגרם',
]);

const GREETING_PREFIXES = ['שלום', 'בוקר טוב', 'צהריים טובים', 'ערב טוב', 'הזמנה ל', 'תודה'];

export const AUTO_ACCEPT_MIN_SCORE = 70;
export const AUTO_ACCEPT_SCORE_GAP = 18;
export const REVIEW_MIN_SCORE = 40;

export const normalizeHebrewLabel = (value = '') => String(value || '')
  .replace(NIKUD_RE, '')
  .replace(QUOTES_RE, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const tokenizeHebrewLabel = (value = '') => normalizeHebrewLabel(value)
  .split(' ')
  .filter((token) => token.length > 1);

export const buildAliasKey = (value = '') => {
  const normalized = normalizeHebrewLabel(String(value || '').replace(/\//g, ' '));
  const seen = new Set();
  const tokens = [];
  normalized.split(' ').forEach((token) => {
    if (token.length <= 1) return;
    if (/^\d+$/.test(token)) return;
    if (NOISE_TOKENS.has(token)) return;
    if (seen.has(token)) return;
    seen.add(token);
    tokens.push(token);
  });
  return tokens.join(' ');
};

export const levenshteinDistance = (a = '', b = '') => {
  const left = String(a || '');
  const right = String(b || '');
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const prev = new Array(right.length + 1);
  const curr = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) prev[j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = curr[j];
  }

  return prev[right.length];
};

export const scoreTokenSimilarity = (left = '', right = '') => {
  const a = normalizeHebrewLabel(left);
  const b = normalizeHebrewLabel(right);
  if (!a || !b) return 0;
  if (a === b) return 100;

  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (dist === 1 && maxLen >= 3) return 88;
  if (dist === 2 && maxLen >= 5) return 72;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 3 && longer.includes(shorter)) {
    return Math.round(70 + (shorter.length / longer.length) * 20);
  }

  const ratio = 1 - dist / maxLen;
  if (ratio >= 0.7) return Math.round(ratio * 100);
  return 0;
};

export const parseQuantity = (value) => {
  const n = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const parseUnitHint = (rawUnit) => {
  if (!rawUnit) return null;
  if (/יח/u.test(rawUnit)) return 'unit';
  if (/גרם|^ג/u.test(normalizeHebrewLabel(rawUnit))) return 'kg';
  if (/[קג]/u.test(rawUnit)) return 'kg';
  return null;
};

const stripLeadingBullet = (line) => {
  let next = line;
  for (let i = 0; i < 3; i += 1) {
    const stripped = next.replace(LEADING_BULLET_RE, '').trim();
    if (stripped === next) break;
    next = stripped;
  }
  return next;
};

const stripTrailingUnit = (line) => {
  const unitMatch = line.match(TRAILING_UNIT_RE);
  if (!unitMatch) return { line, unitHint: null };
  return {
    line: line.slice(0, unitMatch.index).trim(),
    unitHint: parseUnitHint(unitMatch[1]),
  };
};

const withoutDates = (line) => line.replace(DATE_RE, ' ').replace(/\s+/g, ' ').trim();

const hasStandaloneQuantity = (line) => QUANTITY_RE.test(withoutDates(line));

const startsWithGreeting = (line) => {
  const normalized = normalizeHebrewLabel(line);
  return GREETING_PREFIXES.some((phrase) => normalized.startsWith(normalizeHebrewLabel(phrase)));
};

const extractQuantity = (line) => {
  const scrubbed = withoutDates(line);
  const dashQty = scrubbed.match(/^(.+?)\s*[-–—:]\s*(\d+(?:[.,]\d+)?)\s*$/u);
  if (dashQty) {
    const name = dashQty[1].trim();
    const quantity = parseQuantity(dashQty[2]);
    if (name && quantity != null) return { name, quantity };
  }

  const trailingQty = scrubbed.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*$/u);
  if (trailingQty && !/^\d/.test(trailingQty[1].trim())) {
    const name = trailingQty[1].trim();
    const quantity = parseQuantity(trailingQty[2]);
    if (name && quantity != null) return { name, quantity };
  }

  const leadingQty = scrubbed.match(/^(\d+(?:[.,]\d+)?)\s*[-–—:]?\s+(.+)$/u);
  if (leadingQty) {
    const name = leadingQty[2].trim();
    const quantity = parseQuantity(leadingQty[1]);
    if (name && quantity != null) return { name, quantity };
  }

  return null;
};

export const parseFarmerOrderLine = (rawLine) => {
  const original = String(rawLine || '');
  let line = stripLeadingBullet(original.replace(/\s+/g, ' ').trim());
  if (!line) return null;

  if (startsWithGreeting(line)) {
    return {
      kind: 'skipped',
      rawLine: original.trim(),
      name: line,
      quantity: null,
      unitHint: null,
    };
  }

  const stripped = stripTrailingUnit(line);
  line = stripped.line;
  const unitHint = stripped.unitHint;

  if (!line) return null;

  if (!hasStandaloneQuantity(line) && /:\s*$/.test(line)) {
    return {
      kind: 'skipped',
      rawLine: original.trim(),
      name: line,
      quantity: null,
      unitHint,
    };
  }

  const extracted = extractQuantity(line);
  if (extracted) {
    return {
      kind: 'item',
      rawLine: original.trim(),
      name: extracted.name,
      quantity: extracted.quantity,
      unitHint,
    };
  }

  const quantities = [...withoutDates(line).matchAll(QUANTITY_RE)];
  return {
    kind: 'item',
    rawLine: original.trim(),
    name: line,
    quantity: null,
    unitHint,
    parseError: quantities.length === 0 ? 'no_quantity' : 'unparsed',
  };
};

export const parseFarmerOrderText = (text = '') => String(text || '')
  .split(/\r?\n/)
  .map((line) => parseFarmerOrderLine(line))
  .filter(Boolean);

export const buildCropTokens = (products = []) => {
  const freq = new Map();
  products.forEach((product) => {
    const tokens = new Set([
      ...tokenizeHebrewLabel(product?.name),
      ...tokenizeHebrewLabel(product?.thaiName),
    ]);
    tokens.forEach((token) => {
      freq.set(token, (freq.get(token) || 0) + 1);
    });
  });

  const cropTokens = new Set();
  freq.forEach((count, token) => {
    if (count >= 2) cropTokens.add(token);
  });
  return cropTokens;
};

const isCropToken = (token, cropTokens) => {
  if (cropTokens.has(token)) return true;
  return [...cropTokens].some((crop) => scoreTokenSimilarity(token, crop) >= 85);
};

const aliasTokens = (value) => buildAliasKey(value).split(' ').filter(Boolean);

export const scorePasteName = (queryName, productName, cropTokens = new Set()) => {
  const queryKey = buildAliasKey(queryName);
  const productKey = buildAliasKey(productName);
  if (!queryKey || !productKey) return 0;
  if (queryKey === productKey) return 100;

  const queryTokens = aliasTokens(queryName);
  const productTokens = aliasTokens(productName);
  if (queryTokens.length === 0 || productTokens.length === 0) return 0;

  const usedQuery = new Set();
  let weightedSum = 0;
  let weightTotal = 0;
  let unmatchedVariety = 0;

  const ordered = productTokens
    .map((token, index) => ({ token, index, crop: isCropToken(token, cropTokens) }))
    .sort((a, b) => Number(a.crop) - Number(b.crop));

  ordered.forEach(({ token: productToken, crop }) => {
    const weight = crop ? 0.25 : 1;
    let bestScore = 0;
    let bestIndex = -1;
    queryTokens.forEach((queryToken, index) => {
      if (usedQuery.has(index)) return;
      const tokenScore = scoreTokenSimilarity(queryToken, productToken);
      if (tokenScore > bestScore) {
        bestScore = tokenScore;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0 && bestScore >= 70) {
      usedQuery.add(bestIndex);
      weightedSum += bestScore * weight;
    } else if (!crop) {
      unmatchedVariety += 1;
    } else {
      weightedSum += Math.max(0, bestScore) * weight;
    }
    weightTotal += weight;
  });

  if (weightTotal === 0) return 0;
  let score = weightedSum / weightTotal;
  if (unmatchedVariety > 0) score *= 0.35;

  const extraTokens = queryTokens.length - usedQuery.size;
  for (let i = 0; i < extraTokens; i += 1) score *= 0.9;

  return Math.round(Math.min(99, Math.max(0, score)));
};

const scoreAgainstProduct = (queryName, product, cropTokens) => {
  const nameScore = scorePasteName(queryName, product?.name, cropTokens);
  const thaiScore = product?.thaiName
    ? scorePasteName(queryName, product.thaiName, cropTokens)
    : 0;
  return Math.max(nameScore, thaiScore);
};

export const getMatchConfidence = (score, needsReview) => {
  if (needsReview) {
    if (score >= REVIEW_MIN_SCORE) return 'medium';
    if (score > 0) return 'low';
    return 'none';
  }
  if (score >= 90) return 'high';
  if (score >= AUTO_ACCEPT_MIN_SCORE) return 'high';
  return 'medium';
};

const skippedMatch = (parsed) => ({
  kind: 'skipped',
  rawLine: parsed?.rawLine || '',
  parsedName: parsed?.name || '',
  quantity: null,
  unitHint: parsed?.unitHint || null,
  parseError: null,
  productId: '',
  productName: '',
  measurementType: '',
  score: 0,
  confidence: 'none',
  needsReview: false,
  source: '',
  candidates: [],
});

export const matchParsedLineToProducts = (parsed, products = [], cropTokens, aliases = {}) => {
  if (parsed?.kind === 'skipped') return skippedMatch(parsed);

  const crop = cropTokens || buildCropTokens(products);
  const aliasKey = buildAliasKey(parsed?.name);
  const alias = aliasKey ? aliases?.[aliasKey] : null;
  const aliasProduct = alias?.productId
    ? products.find((product) => product.id === alias.productId)
    : null;
  const hasQuantity = parsed?.quantity != null && Number.isFinite(parsed.quantity);

  if (aliasProduct && hasQuantity) {
    return {
      kind: 'item',
      rawLine: parsed?.rawLine || '',
      parsedName: parsed?.name || '',
      quantity: parsed.quantity,
      unitHint: parsed?.unitHint || null,
      parseError: null,
      productId: aliasProduct.id,
      productName: aliasProduct.name || alias.productName || '',
      measurementType: aliasProduct.measurementType || 'kg',
      score: 100,
      confidence: 'high',
      needsReview: false,
      source: 'alias',
      candidates: [{
        productId: aliasProduct.id,
        productName: aliasProduct.name || '',
        measurementType: aliasProduct.measurementType || 'kg',
        score: 100,
      }],
    };
  }

  const candidates = products
    .map((product) => ({
      productId: product.id,
      productName: product.name || '',
      measurementType: product.measurementType || 'kg',
      score: parsed?.name ? scoreAgainstProduct(parsed.name, product, crop) : 0,
    }))
    .sort((a, b) => b.score - a.score || a.productName.localeCompare(b.productName, 'he'));

  const best = candidates[0];
  const runnerUp = candidates[1];
  const bestScore = best?.score || 0;
  const gap = bestScore - (runnerUp?.score || 0);
  const clearWinner = Boolean(
    hasQuantity
    && parsed?.name
    && best?.productId
    && bestScore >= AUTO_ACCEPT_MIN_SCORE
    && gap >= AUTO_ACCEPT_SCORE_GAP
  );
  const needsReview = !clearWinner;

  return {
    kind: 'item',
    rawLine: parsed?.rawLine || '',
    parsedName: parsed?.name || '',
    quantity: hasQuantity ? parsed.quantity : null,
    unitHint: parsed?.unitHint || null,
    parseError: parsed?.parseError || null,
    productId: clearWinner ? best.productId : '',
    productName: clearWinner ? best.productName : '',
    measurementType: clearWinner ? best.measurementType : '',
    score: bestScore,
    confidence: getMatchConfidence(bestScore, needsReview),
    needsReview,
    source: '',
    candidates: candidates.slice(0, 8),
  };
};

export const matchPastedOrder = (text, products = [], aliases = {}) => {
  const cropTokens = buildCropTokens(products);
  return parseFarmerOrderText(text).map((parsed) => (
    matchParsedLineToProducts(parsed, products, cropTokens, aliases)
  ));
};

export const formatFarmerQuantity = (quantity, measurementType = 'kg', lang = 'he') => {
  const amount = Number(quantity);
  if (!Number.isFinite(amount)) return '';
  const isCount = measurementType === 'unit' || measurementType === 'package';
  const shown = isCount || Number.isInteger(amount)
    ? String(Math.round(amount * 1000) / 1000)
    : amount.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  const unit = isCount
    ? (lang === 'th' ? 'ชิ้น' : 'יח׳')
    : (lang === 'th' ? 'กก.' : 'ק״ג');
  return `${shown} ${unit}`;
};

export const allLinesReadyToSave = (matches) => {
  if (!Array.isArray(matches)) return false;
  const items = matches.filter((line) => line?.kind !== 'skipped');
  return items.length > 0
    && items.every((line) => (
      Boolean(line.productId)
      && line.quantity != null
      && Number.isFinite(Number(line.quantity))
    ));
};
