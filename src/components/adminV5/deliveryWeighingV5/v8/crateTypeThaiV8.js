/**
 * Crate marks printed as symbols on V8 QL-800 labels.
 * Small crate up to 10 products, large crate above 10.
 */
export function crateMarkV8({ reusable = false, itemCount = 0 } = {}) {
  return {
    reusable: Boolean(reusable),
    large: Number(itemCount) > 10,
  };
}

export function countActiveOrderItems(order, draft = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const removed = draft?.removedLineIds || {};
  return items.filter((item) => {
    if (!item) return false;
    if (item.lineId && removed[item.lineId]) return false;
    return true;
  }).length;
}
