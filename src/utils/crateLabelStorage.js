const STORAGE_KEY = 'deliveryV7::crateLabel';

function readAll() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readCrateLabel(orderId) {
  if (!orderId) return null;
  const value = readAll()[orderId];
  if (!value || typeof value !== 'object') return null;
  return value;
}

export function writeCrateLabel(orderId, value) {
  if (!orderId || typeof localStorage === 'undefined') return;
  try {
    const all = readAll();
    all[orderId] = {
      index: value?.index,
    };
    const keys = Object.keys(all);
    if (keys.length > 300) {
      keys.slice(0, keys.length - 300).forEach((key) => {
        delete all[key];
      });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Non-critical: draft persistence still covers online stations.
  }
}
