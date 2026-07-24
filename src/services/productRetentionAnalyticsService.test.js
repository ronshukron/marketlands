import {
  addRetentionWeeks,
  buildProductRetentionIndex,
  calculateProductRetention,
  getRetentionWeekKey,
  makeRetentionProductKey,
  normalizeCustomerIdentity,
  normalizeRetentionOrder,
} from './productRetentionAnalyticsService';

const productLine = (overrides = {}) => ({
  lineId: 'line-1',
  productId: 'product-1',
  productName: 'עגבניות',
  selectedOption: 'גדול',
  quantity: 1,
  ...overrides,
});

const order = ({
  id,
  source = 'customerOrders',
  date,
  phone = '050-123-4567',
  email = '',
  community = 'נגבה',
  items = [productLine()],
  ...overrides
}) => ({
  id,
  _source: source,
  paymentStatus: source === 'customerOrdersDelayed' ? 'held' : 'completed',
  delayedOrderStatus: source === 'customerOrdersDelayed' ? 'pending_weighing' : undefined,
  deliveryDate: date,
  customerDetails: { name: `Customer ${id}`, phone, email, pickupSpot: community },
  orderBreakdown: {
    businessOrder: {
      businessId: 'business-1',
      businessName: 'המשק',
      items,
    },
  },
  ...overrides,
});

describe('product retention normalization', () => {
  test('uses Sunday delivery weeks and normalizes customer aliases', () => {
    expect(getRetentionWeekKey('2026-07-22')).toBe('2026-07-19');
    expect(addRetentionWeeks('2026-07-19', 6)).toBe('2026-08-30');

    expect(normalizeCustomerIdentity(order({
      phone: '+972 50-123-4567',
      email: ' Buyer@Example.COM ',
    }))).toMatchObject({
      id: 'phone:0501234567',
      aliases: [
        'phone:0501234567',
        'email:buyer@example.com',
      ],
    });
  });

  test('keeps only fulfilled legacy orders and active non-shipping lines', () => {
    const delayed = order({
      id: 'held',
      source: 'customerOrdersDelayed',
      date: '2026-07-22',
      items: [
        productLine(),
        productLine({ lineId: 'removed', productId: 'removed-product' }),
        productLine({ lineId: 'shipping', productId: 'Mdean61FIezxRcMUZjVn', isShipping: true }),
      ],
      customerExcludedLineIds: { removed: true },
    });
    const normalized = normalizeRetentionOrder(delayed);

    expect(normalized.purchases).toHaveLength(1);
    expect(normalized.purchases[0]).toMatchObject({
      weekKey: '2026-07-19',
      community: 'נגבה',
      productKey: makeRetentionProductKey({
        businessId: 'business-1',
        productId: 'product-1',
        selectedOption: 'גדול',
      }),
    });

    expect(normalizeRetentionOrder(order({
      id: 'pending',
      source: 'customerOrders',
      date: '2026-07-22',
      paymentStatus: 'held',
    }))).toBeNull();
    expect(normalizeRetentionOrder(order({
      id: 'cancelled',
      source: 'customerOrdersDelayed',
      date: '2026-07-22',
      delayedOrderStatus: 'cancelled',
    }))).toBeNull();
    expect(normalizeRetentionOrder({
      ...delayed,
      _source: 'marketplaceOrders',
    })).toBeNull();
    expect(normalizeRetentionOrder(order({
      id: 'legacy-paid',
      source: 'customerOrders',
      date: '2026-07-22',
      paymentStatus: 'paid',
    }))).not.toBeNull();
  });
});

describe('product retention indexing', () => {
  test('deduplicates buyers, joins normalized identities, and calculates follow-up loss', () => {
    const anchor = '2026-05-03';
    const product = productLine();
    const differentOption = productLine({ selectedOption: 'קטן' });
    const orders = [
      order({ id: 'a1', date: anchor, phone: '+972 50-111-1111', email: 'a@example.com' }),
      order({ id: 'a-duplicate', date: anchor, phone: '0501111111', email: '' }),
      order({ id: 'b1', date: anchor, phone: '050-222-2222', email: 'b@example.com' }),
      order({ id: 'c1', date: anchor, phone: '0503333333', email: 'c@example.com', community: 'נגבה' }),
      order({ id: 'elsewhere', date: anchor, phone: '0504444444', email: 'd@example.com', community: 'ניצנים' }),
      order({ id: 'a2', date: addRetentionWeeks(anchor, 1), phone: '', email: 'A@EXAMPLE.COM' }),
      order({ id: 'b3', date: addRetentionWeeks(anchor, 3), phone: '0502222222', email: '' }),
      order({ id: 'c-option', date: addRetentionWeeks(anchor, 1), phone: '0503333333', items: [differentOption] }),
      order({ id: 'd2', date: addRetentionWeeks(anchor, 1), phone: '0504444444' }),
      order({ id: 'irrelevant', date: addRetentionWeeks(anchor, 1), phone: '0509999999', items: [product] }),
    ];

    const index = buildProductRetentionIndex(orders);
    const [metric] = calculateProductRetention(index, {
      anchorWeek: anchor,
      community: 'נגבה',
      minimumCohortSize: 3,
    });

    expect(metric).toMatchObject({
      buyers: 3,
      missedNextWeek: 2,
      missedRate: 2 / 3,
      sixWeekLapsed: 1,
    });
    expect(metric.customers).toHaveLength(3);
    expect(metric.customers.filter((customer) => customer.sixWeekLapsed)).toHaveLength(1);
  });

  test('enforces the minimum cohort size', () => {
    const index = buildProductRetentionIndex([
      order({ id: 'only', date: '2026-05-03' }),
    ]);

    expect(calculateProductRetention(index, {
      anchorWeek: '2026-05-03',
      minimumCohortSize: 2,
    })).toEqual([]);
  });
});
