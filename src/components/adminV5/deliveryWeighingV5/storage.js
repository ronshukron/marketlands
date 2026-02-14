const STORAGE_PREFIX_V5 = 'deliveryWeighingV5::';
const LEGACY_STORAGE_PREFIX = 'deliveryWeighing::';

const storageKeyForWeek = (weekKey) => `${STORAGE_PREFIX_V5}${weekKey || 'unknown_week'}`;

function toLocalDateKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function weekKeyCandidates(weekKey) {
  const base = String(weekKey || '').trim();
  const out = new Set();
  if (base) out.add(base);
  if (base.includes('T')) out.add(base.split('T')[0]);

  const parsed = new Date(base);
  if (!Number.isNaN(parsed.getTime())) {
    out.add(parsed.toISOString().split('T')[0]);
    out.add(toLocalDateKey(parsed));
  }
  return Array.from(out).filter(Boolean);
}

function normalizeStateShape(parsed) {
  if (!parsed || typeof parsed !== 'object') return { byOrderId: {} };
  if (parsed.byOrderId && typeof parsed.byOrderId === 'object') return parsed;

  // Legacy shape fallback: if top-level object looks like { [orderId]: {...} }
  const values = Object.values(parsed);
  const looksLikeOrderMap = values.length > 0 && values.every(
    (v) => v && typeof v === 'object' && !Array.isArray(v),
  );
  if (looksLikeOrderMap) {
    return { byOrderId: parsed };
  }
  return { byOrderId: {} };
}

function parseStateFromRaw(raw) {
  if (!raw) return { byOrderId: {} };
  try {
    const parsed = JSON.parse(raw);
    return normalizeStateShape(parsed);
  } catch (e) {
    return { byOrderId: {} };
  }
}

function readStateByExactKey(storageKey) {
  try {
    return parseStateFromRaw(localStorage.getItem(storageKey));
  } catch (e) {
    return { byOrderId: {} };
  }
}

function getAllWeighingStorageKeys() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(STORAGE_PREFIX_V5) || k.startsWith(LEGACY_STORAGE_PREFIX)) {
        keys.push(k);
      }
    }
  } catch (e) {
    return [];
  }
  return keys;
}

function resolveRecoveredByOrderIds(orderIds = [], excludeKeys = []) {
  const missing = Array.isArray(orderIds) ? orderIds.filter(Boolean) : [];
  if (missing.length === 0) return {};

  const excluded = new Set(excludeKeys || []);
  const keys = getAllWeighingStorageKeys().filter((k) => !excluded.has(k));
  if (keys.length === 0) return {};

  const bestByOrderId = {};
  const tsByOrderId = {};

  keys.forEach((key) => {
    const state = readStateByExactKey(key);
    missing.forEach((orderId) => {
      const candidate = state.byOrderId?.[orderId];
      if (!candidate || typeof candidate !== 'object') return;
      const ts = new Date(candidate.updatedAtIso || 0).getTime() || 0;
      const prevTs = tsByOrderId[orderId] || -1;
      if (ts >= prevTs) {
        tsByOrderId[orderId] = ts;
        bestByOrderId[orderId] = candidate;
      }
    });
  });

  return bestByOrderId;
}

function normalizeToken(v) {
  return String(v || '').trim().toLowerCase();
}

function parseLineId(lineId) {
  const parts = String(lineId || '').split('::');
  return {
    raw: String(lineId || ''),
    orderToken: parts[0] || '',
    productToken: parts[1] || '',
    selectedOption: parts[2] || '',
    indexToken: parts[3] || '',
  };
}

function tokenSetFromItem(item) {
  const idMeta = parseLineId(item?.lineId);
  return new Set(
    [
      item?.productId,
      item?.productName,
      item?.name,
      idMeta.productToken,
    ]
      .filter(Boolean)
      .map(normalizeToken),
  );
}

function optionsCompatible(a, b) {
  const aa = String(a || '');
  const bb = String(b || '');
  if (!aa && !bb) return true;
  return aa === bb;
}

function remapByCurrentItems(savedMap = {}, items = []) {
  const entries = Object.entries(savedMap || {});
  if (entries.length === 0 || !Array.isArray(items) || items.length === 0) return savedMap || {};

  const currentIds = new Set(items.map((it) => it?.lineId).filter(Boolean));
  const next = {};
  const usedSavedIds = new Set();

  // 1) Keep direct matches.
  entries.forEach(([savedLineId, value]) => {
    if (currentIds.has(savedLineId)) {
      next[savedLineId] = value;
      usedSavedIds.add(savedLineId);
    }
  });

  // 2) Recover by product token + selected option (lineId changed scenario).
  items.forEach((it) => {
    const targetLineId = it?.lineId;
    if (!targetLineId || next[targetLineId] != null) return;
    const tokens = tokenSetFromItem(it);
    if (tokens.size === 0) return;

    let matchedSavedId = null;
    for (const [savedLineId] of entries) {
      if (usedSavedIds.has(savedLineId)) continue;
      const meta = parseLineId(savedLineId);
      if (!optionsCompatible(meta.selectedOption, it?.selectedOption)) continue;
      if (!tokens.has(normalizeToken(meta.productToken))) continue;
      matchedSavedId = savedLineId;
      break;
    }

    if (!matchedSavedId) {
      // 3) Fallback by product token only (option may have changed).
      for (const [savedLineId] of entries) {
        if (usedSavedIds.has(savedLineId)) continue;
        const meta = parseLineId(savedLineId);
        if (!tokens.has(normalizeToken(meta.productToken))) continue;
        matchedSavedId = savedLineId;
        break;
      }
    }

    if (matchedSavedId) {
      next[targetLineId] = savedMap[matchedSavedId];
      usedSavedIds.add(matchedSavedId);
    }
  });

  return next;
}

function reconcileOrderStateForItems(orderState = {}, items = []) {
  if (!orderState || typeof orderState !== 'object') return { orderState, changed: false };

  const nextWeights = remapByCurrentItems(orderState.weightsByLineId || {}, items);
  const nextRemoved = remapByCurrentItems(orderState.removedLineIds || {}, items);

  const changedWeights = JSON.stringify(nextWeights) !== JSON.stringify(orderState.weightsByLineId || {});
  const changedRemoved = JSON.stringify(nextRemoved) !== JSON.stringify(orderState.removedLineIds || {});

  if (!changedWeights && !changedRemoved) return { orderState, changed: false };

  return {
    changed: true,
    orderState: {
      ...orderState,
      ...(changedWeights ? { weightsByLineId: nextWeights } : {}),
      ...(changedRemoved ? { removedLineIds: nextRemoved } : {}),
      updatedAtIso: new Date().toISOString(),
    },
  };
}

export function loadWeighingState({ weekKey }) {
  try {
    const candidates = weekKeyCandidates(weekKey);
    // Prefer exact v5 week key, then compatible week-like keys, then legacy prefix.
    const candidateStorageKeys = [
      storageKeyForWeek(weekKey),
      ...candidates.map((wk) => storageKeyForWeek(wk)),
      ...candidates.map((wk) => `${LEGACY_STORAGE_PREFIX}${wk}`),
    ];

    for (const key of candidateStorageKeys) {
      const state = readStateByExactKey(key);
      if (state.byOrderId && Object.keys(state.byOrderId).length > 0) return state;
    }

    return { byOrderId: {} };
  } catch (e) {
    console.error('Failed to load delivery weighing state', e);
    return { byOrderId: {} };
  }
}

export function loadWeighingStateWithRecovery({ weekKey, orderIds = [] }) {
  const base = loadWeighingState({ weekKey });
  const presentIds = new Set(Object.keys(base.byOrderId || {}));
  const missingIds = (Array.isArray(orderIds) ? orderIds : []).filter((id) => id && !presentIds.has(id));
  if (missingIds.length === 0) return base;

  const excludedKeys = [storageKeyForWeek(weekKey), ...weekKeyCandidates(weekKey).map((wk) => storageKeyForWeek(wk))];
  const recovered = resolveRecoveredByOrderIds(missingIds, excludedKeys);
  if (Object.keys(recovered).length === 0) return base;

  const merged = {
    ...base,
    byOrderId: {
      ...(base.byOrderId || {}),
      ...recovered,
    },
  };
  saveWeighingState({ weekKey, state: merged });
  return merged;
}

export function reconcileWeighingStateWithOrders({ weekKey, state, orders = [] }) {
  const current = state && typeof state === 'object' ? state : { byOrderId: {} };
  const nextByOrderId = { ...(current.byOrderId || {}) };
  let changed = false;

  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const orderId = order?.id;
    if (!orderId || !nextByOrderId[orderId]) return;
    const { orderState: reconciled, changed: orderChanged } = reconcileOrderStateForItems(
      nextByOrderId[orderId],
      Array.isArray(order?.items) ? order.items : [],
    );
    if (!orderChanged) return;
    nextByOrderId[orderId] = reconciled;
    changed = true;
  });

  if (!changed) return current;
  const nextState = { ...current, byOrderId: nextByOrderId };
  saveWeighingState({ weekKey, state: nextState });
  return nextState;
}

export function saveWeighingState({ weekKey, state }) {
  try {
    localStorage.setItem(storageKeyForWeek(weekKey), JSON.stringify(state || { byOrderId: {} }));
  } catch (e) {
    console.error('Failed to save delivery weighing state', e);
  }
}

export function upsertOrderWeighing({
  weekKey,
  orderId,
  patch,
}) {
  const current = loadWeighingState({ weekKey });
  const prev = current.byOrderId?.[orderId] || {};
  const next = {
    ...current,
    byOrderId: {
      ...(current.byOrderId || {}),
      [orderId]: {
        ...prev,
        ...(patch || {}),
        updatedAtIso: new Date().toISOString(),
      },
    },
  };
  saveWeighingState({ weekKey, state: next });
  return next;
}


