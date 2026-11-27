const STORAGE_KEY = 'deliveryV7::crateLabel';
const PENDING_SYNC_KEY = 'deliveryV7::pendingCartonSync';
const MAX_ORDERS = 300;

function readJson(key) {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeJson(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    const keys = Object.keys(value);
    if (keys.length > MAX_ORDERS) {
      keys.slice(0, keys.length - MAX_ORDERS).forEach((entry) => {
        delete value[entry];
      });
    }
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-critical: draft persistence still covers online stations.
  }
}

const positive = (value) => {
  const number = Math.floor(Number(value) || 0);
  return number > 0 ? number : 0;
};

/** This station's counter for an order: {index (next to print), lastPrinted?}. */
export function readCrateLabel(orderId) {
  if (!orderId) return null;
  const value = readJson(STORAGE_KEY)[orderId];
  if (!value || typeof value !== 'object') return null;
  return value;
}

/**
 * Save the next carton number. `lastPrinted` (the label that actually came out)
 * only ever grows; a manual edit of the counter leaves it as it was.
 */
export function writeCrateLabel(orderId, value) {
  if (!orderId) return;
  const all = readJson(STORAGE_KEY);
  const previous = all[orderId] && typeof all[orderId] === 'object' ? all[orderId] : {};
  const lastPrinted = Math.max(positive(previous.lastPrinted), positive(value?.lastPrinted));
  all[orderId] = {
    index: value?.index,
    ...(lastPrinted > 0 ? { lastPrinted } : {}),
  };
  writeJson(STORAGE_KEY, all);
}

/**
 * Carton counts printed while the order could not be updated (offline, slow
 * network). Kept on the station until the count is saved.
 * @return {Object<string, {printedIndex: number, loadingOrder: number|null, atIso: string}>}
 */
export function readPendingCartonSyncs() {
  return readJson(PENDING_SYNC_KEY);
}

export function addPendingCartonSync(orderId, { printedIndex, loadingOrder = null } = {}) {
  if (!orderId || !(positive(printedIndex) > 0)) return;
  const all = readJson(PENDING_SYNC_KEY);
  const previous = all[orderId] || {};
  all[orderId] = {
    printedIndex: Math.max(positive(previous.printedIndex), positive(printedIndex)),
    loadingOrder: loadingOrder || previous.loadingOrder || null,
    atIso: new Date().toISOString(),
  };
  writeJson(PENDING_SYNC_KEY, all);
}

/** Drop a pending count once a count at least as high was saved on the order. */
export function removePendingCartonSync(orderId, savedCount) {
  if (!orderId) return;
  const all = readJson(PENDING_SYNC_KEY);
  if (!all[orderId]) return;
  if (positive(all[orderId].printedIndex) > positive(savedCount)) return;
  delete all[orderId];
  writeJson(PENDING_SYNC_KEY, all);
}
