// V8-only UI preferences. Kept under its own prefix so nothing here can
// collide with the V7 keys in localStorageSafeV7 / offlineSyncV7.
const VIEW_KEY = 'deliveryV8::view';
const ITEM_SORT_KEY = 'deliveryV8::itemSort';
const HIDE_DONE_ITEMS_KEY = 'deliveryV8::hideDoneItems';

function readString(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeString(key, value) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

export const V8_VIEWS = Object.freeze({ boxes: 'boxes', items: 'items', orders: 'orders' });

function normalizeView(view) {
  return Object.values(V8_VIEWS).includes(view) ? view : V8_VIEWS.boxes;
}

export function readV8View() {
  return normalizeView(readString(VIEW_KEY, V8_VIEWS.boxes));
}

export function saveV8View(view) {
  return writeString(VIEW_KEY, normalizeView(view));
}

const BOXES_READY_PREFIX = 'deliveryV8::boxesReady::';

export function readV8BoxesReady(weekKey) {
  if (!weekKey) return [];
  try {
    const parsed = JSON.parse(readString(`${BOXES_READY_PREFIX}${weekKey}`, '[]'));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function saveV8BoxesReady(weekKey, orderIds) {
  if (!weekKey) return false;
  const ids = [...new Set([...(orderIds || [])].map(String).filter(Boolean))].slice(0, 1000);
  return writeString(`${BOXES_READY_PREFIX}${weekKey}`, JSON.stringify(ids));
}

const ITEM_SORT_MODES = ['business', 'popular', 'name'];

export function readV8ItemSort() {
  const value = readString(ITEM_SORT_KEY, 'business');
  return ITEM_SORT_MODES.includes(value) ? value : 'business';
}

export function saveV8ItemSort(mode) {
  return writeString(ITEM_SORT_KEY, ITEM_SORT_MODES.includes(mode) ? mode : 'business');
}

export function readV8HideDoneItems() {
  return readString(HIDE_DONE_ITEMS_KEY, 'false') === 'true';
}

export function saveV8HideDoneItems(enabled) {
  return writeString(HIDE_DONE_ITEMS_KEY, enabled ? 'true' : 'false');
}
