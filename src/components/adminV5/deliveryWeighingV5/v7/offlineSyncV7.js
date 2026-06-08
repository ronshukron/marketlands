import { pruneDeliveryV7Storage } from './localStorageSafeV7';

// Static data (orders, productDetails, permanentNumbersMap) — written once per week load.
const STORAGE_KEY = 'deliveryV7::offlineStore';
// Hot data (remoteDraftsByOrder, workingDraftsByOrder, pendingOps, conflicts) — written on every weight save.
const DRAFT_STORAGE_KEY = 'deliveryV7::draftStore';
const STORAGE_VERSION = 1;

function sortValues(values = []) {
  return [...values].filter(Boolean).sort();
}

function normalizeStore(store) {
  if (!store || typeof store !== 'object') {
    return { version: STORAGE_VERSION, scopes: {} };
  }
  return {
    version: STORAGE_VERSION,
    scopes: store.scopes && typeof store.scopes === 'object' ? store.scopes : {},
  };
}

function readRawStore(key) {
  try {
    return normalizeStore(JSON.parse(localStorage.getItem(key) || '{}'));
  } catch {
    return { version: STORAGE_VERSION, scopes: {} };
  }
}

function writeRawStore(key, store) {
  const payload = JSON.stringify(normalizeStore(store));
  try {
    localStorage.setItem(key, payload);
  } catch {
    try {
      pruneDeliveryV7Storage({ maxScopes: 2 });
      localStorage.setItem(key, payload);
    } catch {
      // Ignore quota/storage errors and keep the app usable online.
    }
  }
}

export function buildOfflineScopeKey({
  weekKey = '',
  communities = [],
  startDate = '',
  endDate = '',
}) {
  const sortedCommunities = sortValues(communities);
  return JSON.stringify({
    weekKey: weekKey || '',
    communities: sortedCommunities,
    startDate: startDate || '',
    endDate: endDate || '',
  });
}

export function readOfflineStore() {
  return readRawStore(STORAGE_KEY);
}

export function readDraftStore() {
  return readRawStore(DRAFT_STORAGE_KEY);
}

export function writeOfflineStore(store) {
  writeRawStore(STORAGE_KEY, store);
}

export function writeDraftStore(store) {
  writeRawStore(DRAFT_STORAGE_KEY, store);
}

// Patch ONLY the static fields (orders, productDetails, permanentNumbersMap, meta) for one scope.
// Does NOT touch the draft store.
export function writeStaticScopeData(scopeKey, patch) {
  const store = readRawStore(STORAGE_KEY);
  const current = store.scopes[scopeKey] || {};
  store.scopes[scopeKey] = { ...current, ...patch };
  writeRawStore(STORAGE_KEY, store);
}

// Patch ONLY the draft fields (remoteDraftsByOrder, workingDraftsByOrder, pendingOps, conflicts) for one scope.
// Does NOT touch the static store — reads and writes only DRAFT_STORAGE_KEY.
export function writeDraftScopeData(scopeKey, patch) {
  const store = readRawStore(DRAFT_STORAGE_KEY);
  const current = store.scopes[scopeKey] || {};
  store.scopes[scopeKey] = { ...current, ...patch };
  writeRawStore(DRAFT_STORAGE_KEY, store);
}

// Read a full scope by merging static and draft stores.
// Static fields (orders, productDetails, permanentNumbersMap) come from STORAGE_KEY.
// Draft fields (remoteDraftsByOrder, workingDraftsByOrder, pendingOps, conflicts) come from DRAFT_STORAGE_KEY.
export function getOfflineScope(store, scopeKey) {
  const safeStore = normalizeStore(store);
  const staticScope = safeStore.scopes?.[scopeKey] || {};
  const draftScope = readRawStore(DRAFT_STORAGE_KEY).scopes?.[scopeKey] || {};

  const hasStatic = Object.keys(staticScope).length > 0;
  const hasDraft = Object.keys(draftScope).length > 0;
  if (!hasStatic && !hasDraft) return null;

  return {
    meta: staticScope.meta || {},
    orders: Array.isArray(staticScope.orders) ? staticScope.orders : [],
    productDetails: staticScope.productDetails || {},
    permanentNumbersMap: staticScope.permanentNumbersMap || {},
    remoteDraftsByOrder: draftScope.remoteDraftsByOrder || {},
    workingDraftsByOrder: draftScope.workingDraftsByOrder || {},
    pendingOps: Array.isArray(draftScope.pendingOps) ? draftScope.pendingOps : [],
    conflicts: Array.isArray(draftScope.conflicts) ? draftScope.conflicts : [],
    cachedAtIso: staticScope.cachedAtIso || '',
  };
}

export function upsertOfflineScope(store, scopeKey, patch) {
  const safeStore = normalizeStore(store);
  const current = safeStore.scopes?.[scopeKey] || {};
  safeStore.scopes[scopeKey] = {
    ...current,
    ...patch,
  };
  return safeStore;
}

function normalizeWeightEntry(entry) {
  if (!entry || entry.actualQuantity == null) return null;
  return {
    actualQuantity: Number(entry.actualQuantity),
    source: entry.source || '',
  };
}

function targetKeyForOp(op) {
  if (!op) return '';
  if (op.type === 'setStatus') return `${op.orderId}::status`;
  if (op.type === 'setWeight' || op.type === 'clearWeight') return `${op.orderId}::weight::${op.lineId || ''}`;
  if (op.type === 'removeLine' || op.type === 'restoreLine') return `${op.orderId}::removed::${op.lineId || ''}`;
  return `${op.orderId || ''}::${op.type || ''}::${op.lineId || ''}`;
}

export function buildBaseSnapshotForOp(draft = {}, op) {
  if (!op) return {};
  if (op.type === 'setWeight' || op.type === 'clearWeight') {
    return { weight: normalizeWeightEntry(draft?.weightsByLineId?.[op.lineId]) };
  }
  if (op.type === 'removeLine' || op.type === 'restoreLine') {
    return { removed: !!draft?.removedLineIds?.[op.lineId] };
  }
  if (op.type === 'setStatus') {
    return { status: draft?.status || '' };
  }
  return {};
}

export function mergePendingOps(existingOps = [], nextOp) {
  if (!nextOp) return existingOps;
  const nextKey = targetKeyForOp(nextOp);
  let merged = false;
  const output = existingOps.map((op) => {
    if (targetKeyForOp(op) !== nextKey) return op;
    merged = true;
    return {
      ...nextOp,
      id: nextOp.id,
      baseDraftUpdatedAtIso: op.baseDraftUpdatedAtIso || nextOp.baseDraftUpdatedAtIso || '',
      baseSnapshot: op.baseSnapshot || nextOp.baseSnapshot || {},
      localTimestamp: nextOp.localTimestamp,
    };
  });
  if (!merged) output.push(nextOp);
  output.sort((a, b) => String(a.localTimestamp || '').localeCompare(String(b.localTimestamp || '')));
  return output;
}

export function applyOpToDraft(draft = {}, op) {
  if (!op) return draft || {};
  const next = {
    ...(draft || {}),
    weightsByLineId: { ...((draft || {}).weightsByLineId || {}) },
    removedLineIds: { ...((draft || {}).removedLineIds || {}) },
  };
  if (op.type === 'setWeight') {
    next.weightsByLineId[op.lineId] = {
      actualQuantity: op.value?.actualQuantity,
      source: op.value?.source || '',
    };
    if (op.value?.status) next.status = op.value.status;
  } else if (op.type === 'clearWeight') {
    next.weightsByLineId[op.lineId] = { actualQuantity: null, source: op.value?.source || 'manual' };
    if (op.value?.status) next.status = op.value.status;
  } else if (op.type === 'removeLine') {
    next.removedLineIds[op.lineId] = true;
  } else if (op.type === 'restoreLine') {
    delete next.removedLineIds[op.lineId];
  } else if (op.type === 'setStatus') {
    next.status = op.value?.status || '';
  }
  next.orderId = op.orderId || next.orderId || '';
  next.updatedAtIso = op.localTimestamp || next.updatedAtIso || '';
  return next;
}

export function applyOpsToDrafts(remoteDraftsByOrder = {}, ops = []) {
  const next = { ...(remoteDraftsByOrder || {}) };
  (ops || []).forEach((op) => {
    if (!op?.orderId) return;
    next[op.orderId] = applyOpToDraft(next[op.orderId] || {}, op);
  });
  return next;
}

export function getCurrentFieldValueForOp(draft = {}, op) {
  if (!op) return null;
  if (op.type === 'setWeight' || op.type === 'clearWeight') {
    return { weight: normalizeWeightEntry(draft?.weightsByLineId?.[op.lineId]) };
  }
  if (op.type === 'removeLine' || op.type === 'restoreLine') {
    return { removed: !!draft?.removedLineIds?.[op.lineId] };
  }
  if (op.type === 'setStatus') {
    return { status: draft?.status || '' };
  }
  return {};
}

/** Target field value after applying a pending op (used to detect false sync conflicts). */
export function getDesiredFieldValueForOp(op) {
  if (!op) return {};
  if (op.type === 'setWeight') {
    return { weight: normalizeWeightEntry(op.value) };
  }
  if (op.type === 'clearWeight') {
    return { weight: normalizeWeightEntry({ actualQuantity: null, source: op.value?.source || 'manual' }) };
  }
  if (op.type === 'removeLine') return { removed: true };
  if (op.type === 'restoreLine') return { removed: false };
  if (op.type === 'setStatus') return { status: op.value?.status || '' };
  return {};
}
