// Cart counts shown to the customer.
//
// Kg quantities are fractions (0.3, 0.7), so a plain sum of quantities is a
// float like 2.9999999999999996, which the 20px cart badge rendered as "999".
// The badge shows the number of product lines; the quantity sum is kept for
// the saved order's `itemCount` and is rounded to 3 decimals.

const isCountedLine = (item) => Boolean(item)
  && !item.isBasketAdjustment
  && !item.isShipping;

export function countCartLines(items) {
  if (!Array.isArray(items)) return 0;
  return items.filter(isCountedLine).length;
}

export function sumCartQuantity(items) {
  if (!Array.isArray(items)) return 0;
  const sum = items.reduce((total, item) => {
    if (!isCountedLine(item)) return total;
    const quantity = Number(item.quantity);
    return Number.isFinite(quantity) ? total + quantity : total;
  }, 0);
  return Math.round(sum * 1000) / 1000;
}

// Text for a small round badge: whole numbers only, "99+" above 99.
export function formatCartBadge(count) {
  const value = Math.max(0, Math.floor(Number(count) || 0));
  return value > 99 ? '99+' : String(value);
}
