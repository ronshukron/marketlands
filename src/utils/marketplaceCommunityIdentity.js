const normalizeCommunityLabel = (value) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

let aliasToCanonical = new Map();

export const setMarketplaceCommunityIdentity = ({
  communities = [],
  aliases = {},
} = {}) => {
  const next = new Map();

  communities.forEach((community) => {
    const canonical = normalizeCommunityLabel(
      typeof community === 'string' ? community : community?.name
    );
    if (canonical) next.set(canonical, canonical);
  });

  Object.entries(aliases || {}).forEach(([alias, canonicalName]) => {
    const normalizedAlias = normalizeCommunityLabel(alias);
    const canonical = normalizeCommunityLabel(canonicalName);
    if (normalizedAlias && canonical) next.set(normalizedAlias, canonical);
  });

  aliasToCanonical = next;
};

export const resolveMarketplaceCommunityName = (value) => {
  const normalized = normalizeCommunityLabel(value);
  if (!normalized) return '';

  let current = normalized;
  const visited = new Set();
  while (aliasToCanonical.has(current) && !visited.has(current)) {
    visited.add(current);
    const next = aliasToCanonical.get(current);
    if (!next || next === current) return current;
    current = next;
  }
  return current;
};

export const marketplaceCommunityNamesMatch = (first, second) => {
  const a = resolveMarketplaceCommunityName(first);
  const b = resolveMarketplaceCommunityName(second);
  return Boolean(a && b && a === b);
};

export { normalizeCommunityLabel };
