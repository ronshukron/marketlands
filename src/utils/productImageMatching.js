const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

export const normalizeImageLabel = (value = '') => {
  let text = String(value || '').trim();

  if (IMAGE_EXTENSIONS.test(text)) {
    text = text.replace(IMAGE_EXTENSIONS, '');
  }

  return text
    .toLowerCase()
    .replace(/^\d+[\.\-_\s)]+/, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const tokenize = (value) =>
  normalizeImageLabel(value)
    .split(' ')
    .filter((token) => token.length > 1);

export const scoreNameMatch = (fileName, productName) => {
  const fileLabel = normalizeImageLabel(fileName);
  const productLabel = normalizeImageLabel(productName);

  if (!fileLabel || !productLabel) return 0;
  if (fileLabel === productLabel) return 100;

  const shorter = fileLabel.length <= productLabel.length ? fileLabel : productLabel;
  const longer = fileLabel.length > productLabel.length ? fileLabel : productLabel;

  if (longer.includes(shorter) && shorter.length >= 3) {
    return Math.round(70 + (shorter.length / longer.length) * 20);
  }

  const fileTokens = tokenize(fileLabel);
  const productTokens = tokenize(productLabel);
  if (fileTokens.length === 0 || productTokens.length === 0) return 0;

  let overlap = 0;
  fileTokens.forEach((token) => {
    if (productTokens.includes(token)) overlap += 1;
  });

  const union = new Set([...fileTokens, ...productTokens]).size;
  const jaccard = union > 0 ? overlap / union : 0;

  let score = Math.round(jaccard * 55);
  if (overlap > 0) score += 15 + overlap * 8;

  const firstFileToken = fileTokens[0];
  const firstProductToken = productTokens[0];
  if (firstFileToken && firstProductToken) {
    if (firstFileToken === firstProductToken) score += 12;
    else if (
      firstFileToken.startsWith(firstProductToken)
      || firstProductToken.startsWith(firstFileToken)
    ) {
      score += 6;
    }
  }

  return Math.min(score, 99);
};

export const getMatchConfidence = (score) => {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  if (score > 0) return 'low';
  return 'none';
};

export const buildInitialImageMatches = (files = [], products = [], minScore = 40) => {
  const initialMatches = files.map((file, index) => {
    const ranked = products
      .map((product) => ({
        productId: product.id,
        productName: product.name || '',
        score: scoreNameMatch(file.name, product.name || ''),
      }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const productId = best && best.score >= minScore ? best.productId : '';
    const score = best?.score || 0;

    return {
      id: `${file.name}-${file.lastModified}-${index}`,
      file,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      productId,
      score,
      confidence: getMatchConfidence(score),
      enabled: Boolean(productId),
      candidates: ranked.slice(0, 6),
      needsReview: !productId || score < 75,
    };
  });

  const winnerByProduct = new Map();
  initialMatches.forEach((match) => {
    if (!match.productId) return;
    const current = winnerByProduct.get(match.productId);
    if (!current || match.score > current.score) {
      winnerByProduct.set(match.productId, match);
    }
  });

  return initialMatches.map((match) => {
    if (!match.productId) {
      return { ...match, conflict: false, needsReview: true };
    }

    const winner = winnerByProduct.get(match.productId);
    const isWinner = winner?.id === match.id;
    return {
      ...match,
      conflict: !isWinner,
      enabled: isWinner,
      needsReview: !isWinner || match.score < 75,
    };
  });
};

export const revokeObjectUrls = (matches = []) => {
  matches.forEach((match) => {
    if (match.previewUrl) {
      URL.revokeObjectURL(match.previewUrl);
    }
  });
};
