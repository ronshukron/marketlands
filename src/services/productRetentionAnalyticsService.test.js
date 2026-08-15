import {
  addRetentionWeeks,
  buildProductRetentionIndex,
  calculateMissedWeekProductCorrelation,
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

  test('prefers the explicit delivery week over the order creation date', () => {
    const normalized = normalizeRetentionOrder(order({
      id: 'explicit-week',
      date: '2026-04-01',
      deliveryWeekKey: '2026-05-03',
    }));

    expect(normalized.purchases[0].weekKey).toBe('2026-05-03');
  });
});

describe('product retention indexing', () => {
  test('deduplicates buyers, joins normalized identities, and calculates follow-up loss', () => {
    const anchor = '2026-05-03';
    const product = productLine();
    const differentOption = productLine({ selectedOption: 'קטן' });
    const orders = [
      ...[1, 2, 3].flatMap((weeksAgo) => [
        order({ id: `a-history-${weeksAgo}`, date: addRetentionWeeks(anchor, -weeksAgo), phone: '0501111111' }),
        order({ id: `b-history-${weeksAgo}`, date: addRetentionWeeks(anchor, -weeksAgo), phone: '0502222222' }),
        order({ id: `c-history-${weeksAgo}`, date: addRetentionWeeks(anchor, -weeksAgo), phone: '0503333333' }),
      ]),
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
      missedNextWeek: 1,
      missedRate: 1 / 3,
      sixWeekLapsed: 0,
      requiredActiveWeeks: 3,
    });
    expect(metric.customers).toHaveLength(3);
    expect(metric.customers.filter((customer) => customer.sixWeekLapsed)).toHaveLength(0);
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

describe('missed week product correlation', () => {
  test('finds products shared by active customers who skipped the target week', () => {
    const targetWeek = '2026-06-14';
    const tomatoes = productLine();
    const bread = productLine({
      lineId: 'bread',
      productId: 'bread',
      productName: 'לחם',
      selectedOption: '',
    });
    const apples = productLine({
      lineId: 'apples',
      productId: 'apples',
      productName: 'תפוחים',
      selectedOption: '',
    });
    const orders = [
      order({
        id: 'missed-a',
        date: addRetentionWeeks(targetWeek, -1),
        phone: '0501111111',
        items: [tomatoes, bread],
      }),
      order({
        id: 'missed-b',
        date: addRetentionWeeks(targetWeek, -2),
        phone: '0502222222',
        items: [tomatoes, apples],
      }),
      order({
        id: 'returned',
        date: addRetentionWeeks(targetWeek, -1),
        phone: '0503333333',
        items: [tomatoes],
      }),
      order({
        id: 'returned-target',
        date: targetWeek,
        phone: '0503333333',
        community: 'ניצנים',
        items: [bread],
      }),
      order({
        id: 'too-old',
        date: addRetentionWeeks(targetWeek, -3),
        phone: '0504444444',
        items: [tomatoes],
      }),
    ];

    const result = calculateMissedWeekProductCorrelation(
      buildProductRetentionIndex(orders),
      { targetWeek, community: 'נגבה', lookbackWeeks: 2 },
    );

    expect(result.activeCustomers).toBe(3);
    expect(result.missedCount).toBe(2);
    expect(result.commonProducts).toHaveLength(1);
    expect(result.commonProducts[0]).toMatchObject({
      productName: 'עגבניות',
      customerCount: 2,
      coverage: 1,
    });
    expect(result.products.find((product) => product.productName === 'לחם')).toMatchObject({
      customerCount: 1,
      coverage: 0.5,
    });
  });

  test('returns an empty result when no active customer missed the week', () => {
    const targetWeek = '2026-06-14';
    const orders = [
      order({ id: 'before', date: addRetentionWeeks(targetWeek, -1) }),
      order({ id: 'target', date: targetWeek }),
    ];

    const result = calculateMissedWeekProductCorrelation(
      buildProductRetentionIndex(orders),
      { targetWeek },
    );

    expect(result.missedCount).toBe(0);
    expect(result.products).toEqual([]);
    expect(result.commonProducts).toEqual([]);
  });

  test('requires orders in at least half of the lookback weeks', () => {
    const targetWeek = '2026-06-14';
    const orders = [
      order({ id: 'occasional', date: addRetentionWeeks(targetWeek, -1), phone: '0501111111' }),
      ...[1, 2, 3].map((weeksAgo) => order({
        id: `active-${weeksAgo}`,
        date: addRetentionWeeks(targetWeek, -weeksAgo),
        phone: '0502222222',
      })),
    ];

    const result = calculateMissedWeekProductCorrelation(
      buildProductRetentionIndex(orders),
      { targetWeek, lookbackWeeks: 6, minimumActivityRate: 0.5 },
    );

    expect(result.activeCustomers).toBe(1);
    expect(result.missedCustomers).toHaveLength(1);
    expect(result.missedCustomers[0].phone).toBe('0502222222');
    expect(result.requiredActiveWeeks).toBe(3);
  });
});
