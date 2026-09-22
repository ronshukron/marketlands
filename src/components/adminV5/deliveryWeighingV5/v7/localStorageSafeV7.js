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

const COMMUNITY_ORDER_BY_SCOPE_KEY = 'deliveryV7::communityOrderByScope';
const MAX_COMMUNITY_ORDER_SCOPES = 5;

function readCommunityOrderByScopeStore() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(COMMUNITY_ORDER_BY_SCOPE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function pruneCommunityOrderByScopeStore(store, keepScopeKey) {
  const next = { ...(store || {}) };
  const keys = Object.keys(next);
  if (keys.length <= MAX_COMMUNITY_ORDER_SCOPES) return next;

  const ranked = keys
    .map((key, index) => ({
      key,
      updatedAt: String(next[key]?.updatedAt || ''),
      index,
    }))
    .sort((a, b) => {
      const byTime = b.updatedAt.localeCompare(a.updatedAt);
      if (byTime !== 0) return byTime;
      return b.index - a.index;
    });

  const keep = new Set();
  if (keepScopeKey) keep.add(keepScopeKey);
  ranked.forEach((entry) => {
    if (keep.size < MAX_COMMUNITY_ORDER_SCOPES) keep.add(entry.key);
  });

  keys.forEach((key) => {
    if (!keep.has(key)) delete next[key];
  });
  return next;
}

export function readCommunityOrderForScope(scopeKey) {
  if (!scopeKey) return [];
  const store = readCommunityOrderByScopeStore();
  const entry = store[scopeKey];
  if (Array.isArray(entry)) return sanitizeCommunityOrder(entry);
  return sanitizeCommunityOrder(entry?.order);
}

export function saveCommunityOrderForScope(scopeKey, order) {
  if (!scopeKey) return false;
  const store = readCommunityOrderByScopeStore();
  store[scopeKey] = {
    order: sanitizeCommunityOrder(order),
    updatedAt: new Date().toISOString(),
  };
  const pruned = pruneCommunityOrderByScopeStore(store, scopeKey);
  return safeSetLocalStorage(COMMUNITY_ORDER_BY_SCOPE_KEY, JSON.stringify(pruned), {
    keepScopeKeys: [scopeKey],
  });
}

export function clearCommunityOrderForScope(scopeKey) {
  if (!scopeKey) return false;
  const store = readCommunityOrderByScopeStore();
  if (!store[scopeKey]) return true;
  const next = { ...store };
  delete next[scopeKey];
  return safeSetLocalStorage(COMMUNITY_ORDER_BY_SCOPE_KEY, JSON.stringify(next), {
    keepScopeKeys: Object.keys(next).slice(0, MAX_COMMUNITY_ORDER_SCOPES),
  });
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

const BATCH_CHARGE_EXCLUDED_PREFIX = 'deliveryV7::batchChargeExcluded::';

export function readBatchChargeExcludedOrderIds(weekKey) {
  if (!weekKey || typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(`${BATCH_CHARGE_EXCLUDED_PREFIX}${weekKey}`) || '[]');
    return Array.isArray(parsed) ? [...new Set(parsed.map(String).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

export function saveBatchChargeExcludedOrderIds(weekKey, orderIds, keepScopeKeys = []) {
  if (!weekKey) return false;
  const ids = [...new Set([...(orderIds || [])].map(String).filter(Boolean))];
  return safeSetLocalStorage(
    `${BATCH_CHARGE_EXCLUDED_PREFIX}${weekKey}`,
    JSON.stringify(ids),
    { keepScopeKeys },
  );
}

export function saveCommunityColorOverride(communityName, color) {
  if (!communityName || typeof localStorage === 'undefined') return false;
  const current = readCommunityColorOverrides();
  return safeSetLocalStorage(
    COMMUNITY_COLORS_KEY,
    JSON.stringify({ ...current, [communityName]: color }),
  );
}
