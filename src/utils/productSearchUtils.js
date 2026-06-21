export const parseShoppingListTerms = (input) => {
  if (!input || typeof input !== 'string') return [];
  const seen = new Set();
  const terms = [];
  input.split(',').forEach((part) => {
    const term = part.trim();
    if (!term) return;
    const key = term.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    terms.push(term);
  });
  return terms;
};

export const calculateRelevance = (product, term) => {
  const lowerTerm = term.toLowerCase();
  const lowerName = product.name.toLowerCase();
  const lowerDesc = product.description?.toLowerCase() || '';
  const lowerBusiness = product.businessName.toLowerCase();

  if (lowerName === lowerTerm) return 1000;
  if (lowerName.startsWith(lowerTerm)) return 900;
  if (lowerName.includes(lowerTerm)) {
    const position = lowerName.indexOf(lowerTerm);
    return 800 - position;
  }
  if (lowerDesc.includes(lowerTerm)) return 300;
  if (lowerBusiness.includes(lowerTerm)) return 200;
  return 0;
};

export const productMatchesTerm = (product, term) => {
  const lowerTerm = term.toLowerCase();
  return (
    product.name.toLowerCase().includes(lowerTerm) ||
    product.description?.toLowerCase().includes(lowerTerm) ||
    product.businessName.toLowerCase().includes(lowerTerm)
  );
};

export const searchProducts = (products, term) => {
  if (!term || !term.trim()) return [];
  return products
    .filter((product) => productMatchesTerm(product, term))
    .sort((a, b) => calculateRelevance(b, term) - calculateRelevance(a, term));
};

export const findBestProductForTerm = (products, term) => {
  const matches = searchProducts(products, term);
  return matches.length > 0 ? matches[0] : null;
};
