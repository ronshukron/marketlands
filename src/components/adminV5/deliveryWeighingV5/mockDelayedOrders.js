export const buildMockDelayedOrders = ({ weekKey, communities = [] }) => {
  const spots = Array.isArray(communities) && communities.length > 0 ? communities : ['דוגמה - קהילה'];
  const customers = [
    { name: 'אברהם כהן', phone: '050-0000001' },
    { name: 'נועה לוי', phone: '050-0000002' },
    { name: 'דנה ישראלי', phone: '050-0000003' },
  ];
  const products = [
    { productId: 'tomato', productName: 'עגבניות', unit: 'kg', pricePerUnit: 12.0 },
    { productId: 'orange', productName: 'תפוזים', unit: 'kg', pricePerUnit: 9.5 },
    { productId: 'cucumber', productName: 'מלפפונים', unit: 'kg', pricePerUnit: 10.0 },
  ];

  const orders = [];
  let idx = 0;
  for (const pickupSpot of spots) {
    for (const c of customers) {
      idx += 1;
      const orderId = `mock_${weekKey || 'week'}_${pickupSpot}_${idx}`.replace(/\s+/g, '_');
      orders.push({
        id: orderId,
        source: 'mock',
        status: 'pending', // pending | in_progress | weighed | completed
        weekKey: weekKey || '',
        pickupSpot,
        customerDetails: {
          name: c.name,
          phone: c.phone,
          pickupSpot,
        },
        // In the real integration this will come from Grow/backend.
        suspendedPaymentRef: {
          provider: 'grow',
          // paymentId: '...',
        },
        items: [
          {
            lineId: `${orderId}::0`,
            ...products[0],
            requestedQuantity: 2.0,
          },
          {
            lineId: `${orderId}::1`,
            ...products[1],
            requestedQuantity: 1.0,
          },
        ],
        createdAtIso: new Date().toISOString(),
      });
    }
  }
  return orders;
};


