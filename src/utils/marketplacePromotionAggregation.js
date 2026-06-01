const formatCurrency = (value) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(Number(value || 0));

/**
 * Aggregate line items across all orders for a weekly promotion.
 * @returns {{ items: Array, orderCount: number, subtotal: number, deliveryFees: number, grandTotal: number }}
 */
export const aggregatePromotionOrders = (orders = []) => {
  const list = Array.isArray(orders) ? orders : [];
  const byProduct = new Map();

  let subtotal = 0;
  let deliveryFees = 0;
  let grandTotal = 0;

  list.forEach((order) => {
    subtotal += Number(order.subtotal || 0);
    deliveryFees += Number(order.deliveryFee || 0);
    grandTotal += Number(order.total ?? order.subtotal ?? 0);

    const lines = Array.isArray(order.lines) ? order.lines : [];
    lines.forEach((line) => {
      const productId = line.productId || line.name || 'unknown';
      const qty = Number(line.quantity) || 0;
      const price = Number(line.price) || 0;
      const lineTotal = Number(line.total) || qty * price;

      if (!byProduct.has(productId)) {
        byProduct.set(productId, {
          productId,
          name: line.name || 'פריט',
          unitPrice: price,
          quantity: 0,
          total: 0,
          orderIds: new Set(),
        });
      }

      const entry = byProduct.get(productId);
      entry.quantity += qty;
      entry.total += lineTotal;
      if (order.id) entry.orderIds.add(order.id);
      if (!entry.unitPrice && price) entry.unitPrice = price;
    });
  });

  const items = [...byProduct.values()]
    .map((entry) => ({
      productId: entry.productId,
      name: entry.name,
      unitPrice: entry.unitPrice,
      quantity: entry.quantity,
      total: entry.total,
      orderCount: entry.orderIds.size,
    }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'he'));

  return {
    items,
    orderCount: list.length,
    subtotal,
    deliveryFees,
    grandTotal,
    formatCurrency,
  };
};

export const PROMOTION_STATUS_LABELS = {
  active: 'פעיל',
  paused: 'מושהה',
  closed: 'נסגר',
};

export const isPromotionOpenForOrders = (promotion) => {
  if (!promotion) return false;
  if (promotion.status && promotion.status !== 'active') return false;
  return true;
};
