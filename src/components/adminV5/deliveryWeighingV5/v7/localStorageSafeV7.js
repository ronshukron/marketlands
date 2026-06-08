const OFFLINE_KEY = 'deliveryV7::offlineStore';
const DRAFT_KEY = 'deliveryV7::draftStore';
const LEGACY_PREFIXES = ['deliveryWeighingV5::', 'deliveryWeighing::'];

function isQuotaError(error) {
  return error?.name === 'QuotaExceededError'
    || String(error?.message || '').toLowerCase().includes('quota');
}

export function sanitizeCommunityOrder(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => typeof entry === 'string' && entry.trim())
    .map((entry) => entry.trim())
    .slice(0, 500);
}

export function readCommunityOrder(storageKey) {
  if (typeof localStorage === 'undefined') return [];
  try {
    return sanitizeCommunityOrder(JSON.parse(localStorage.getItem(storageKey) || '[]'));
  } catch {
    return [];
  }
}

function pruneScopesInStore(storageKey, keepScopeKeys = [], maxScopes = 2) {
  let raw;
  try {
    raw = localStorage.getItem(storageKey);
  } catch {
    return false;
  }
  if (!raw) return false;

  let store;
  try {
    store = JSON.parse(raw);
  } catch {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    return true;
  }

  const scopes = store?.scopes;
  if (!scopes || typeof scopes !== 'object') return false;

  const keys = Object.keys(scopes);
  if (keys.length <= maxScopes && keepScopeKeys.every((key) => !key || keys.includes(key))) {
    return false;
  }

  const keep = new Set(keepScopeKeys.filter(Boolean));
  if (keep.size < maxScopes) {
    keys
      .sort((a, b) => String(scopes[b]?.cachedAtIso || '').localeCompare(String(scopes[a]?.cachedAtIso || '')))
      .slice(0, maxScopes)
      .forEach((key) => keep.add(key));
  }

  let changed = false;
  keys.forEach((key) => {
    if (!keep.has(key)) {
      delete scopes[key];
      changed = true;
    }
  });

  if (!changed) return false;

  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...store, scopes }));
    return true;
  } catch {
    return false;
  }
}

export function pruneDeliveryV7Storage({ keepScopeKeys = [], maxScopes = 2 } = {}) {
  let changed = false;
  changed = pruneScopesInStore(OFFLINE_KEY, keepScopeKeys, maxScopes) || changed;
  changed = pruneScopesInStore(DRAFT_KEY, keepScopeKeys, maxScopes) || changed;

  if (typeof localStorage === 'undefined') return changed;

  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      if (LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key);
        changed = true;
      }
    }
  } catch {
    // ignore
  }

  return changed;
}

export function safeSetLocalStorage(key, value, options = {}) {
  if (typeof localStorage === 'undefined') return false;
  const { keepScopeKeys = [] } = options;

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaError(error)) return false;
    pruneDeliveryV7Storage({ keepScopeKeys, maxScopes: 1 });
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

export function saveCommunityOrder(storageKey, order, keepScopeKeys = []) {
  const sanitized = sanitizeCommunityOrder(order);
  return safeSetLocalStorage(storageKey, JSON.stringify(sanitized), { keepScopeKeys });
}

const COMMUNITY_COLORS_KEY = 'deliveryV7::communityColors';

export function readCommunityColorOverrides() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(COMMUNITY_COLORS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCommunityColorOverride(communityName, color) {
  if (!communityName || typeof localStorage === 'undefined') return false;
  const current = readCommunityColorOverrides();
  return safeSetLocalStorage(
    COMMUNITY_COLORS_KEY,
    JSON.stringify({ ...current, [communityName]: color }),
  );
}
