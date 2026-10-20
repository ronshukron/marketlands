import {
  buildProductRanking,
  buildRatingDistribution,
  buildRatingTrend,
  buildTagFrequency,
  FEEDBACK_DATE_BASIS,
  FEEDBACK_PERIOD,
  FEEDBACK_PRODUCT_SORT,
  filterReviewsByDateRange,
  formatFeedbackPeriodLabel,
  formatFeedbackPeriodShort,
  groupProductFeedbackByPeriod,
  summarizeReviews,
  UNKNOWN_PERIOD_KEY,
} from './productFeedbackStats';

const review = (overrides = {}) => ({
  id: Math.random().toString(36).slice(2),
  productId: 'tomato',
  productName: 'עגבנייה',
  rating: 5,
  deliveryDate: new Date(2026, 9, 14, 10),
  submittedAt: new Date(2026, 9, 16, 9),
  ...overrides,
});

describe('summarizeReviews', () => {
  test('computes average, distribution and refund count', () => {
    const summary = summarizeReviews([
      review({ rating: 5 }),
      review({ rating: 4 }),
      review({ rating: 1, refundForThisLine: true }),
      review({ rating: 'bad' }),
    ]);
    expect(summary.count).toBe(3);
    expect(summary.average).toBe(3.3);
    expect(summary.distribution).toEqual([1, 0, 0, 1, 1]);
    expect(summary.lowCount).toBe(1);
    expect(summary.highCount).toBe(2);
    expect(summary.refundCount).toBe(1);
  });

  test('returns zero average for no ratings', () => {
    expect(summarizeReviews([]).average).toBe(0);
  });
});

describe('groupProductFeedbackByPeriod', () => {
  const reviews = [
    review({ rating: 5 }),
    review({ rating: 3 }),
    review({ productId: 'cucumber', productName: 'מלפפון', rating: 2 }),
    review({ rating: 4, deliveryDate: new Date(2026, 9, 7), submittedAt: new Date(2026, 9, 8) }),
    review({ rating: 4, deliveryDate: null, submittedAt: null }),
  ];

  test('groups by Sunday week of delivery and averages per product, newest week first', () => {
    const periods = groupProductFeedbackByPeriod(reviews, { period: FEEDBACK_PERIOD.WEEK });
    expect(periods.map((item) => item.key)).toEqual(['2026-10-11', '2026-10-04', UNKNOWN_PERIOD_KEY]);

    const [latest] = periods;
    expect(latest.summary.count).toBe(3);
    expect(latest.range.end.getDate()).toBe(17);
    expect(latest.products.map((product) => [product.productName, product.summary.average, product.summary.count]))
      .toEqual([['עגבנייה', 4, 2], ['מלפפון', 2, 1]]);
  });

  test('groups by day and can use the submitted date', () => {
    const periods = groupProductFeedbackByPeriod(reviews, {
      period: FEEDBACK_PERIOD.DAY,
      basis: FEEDBACK_DATE_BASIS.SUBMITTED,
    });
    expect(periods.map((item) => item.key)).toEqual(['2026-10-16', '2026-10-08', UNKNOWN_PERIOD_KEY]);
  });

  test('sorts products by lowest average when requested', () => {
    const [latest] = groupProductFeedbackByPeriod(reviews, { sort: FEEDBACK_PRODUCT_SORT.LOWEST });
    expect(latest.products[0].productName).toBe('מלפפון');
  });

  test('falls back to submitted date when the delivery date is missing', () => {
    const periods = groupProductFeedbackByPeriod([
      review({ deliveryDate: null, submittedAt: new Date(2026, 9, 20) }),
    ]);
    expect(periods[0].key).toBe('2026-10-18');
  });
});

describe('period labels', () => {
  test('formats week ranges and unknown periods', () => {
    expect(formatFeedbackPeriodLabel('2026-10-11')).toBe('שבוע 11.10–17.10.2026');
    expect(formatFeedbackPeriodShort('2026-10-11')).toBe('11.10');
    expect(formatFeedbackPeriodLabel(UNKNOWN_PERIOD_KEY)).toBe('ללא תאריך');
  });
});

describe('filterReviewsByDateRange', () => {
  test('keeps reviews inside the inclusive range', () => {
    const items = [
      review({ deliveryDate: new Date(2026, 9, 1) }),
      review({ deliveryDate: new Date(2026, 9, 10, 20) }),
      review({ deliveryDate: new Date(2026, 9, 20) }),
    ];
    expect(filterReviewsByDateRange(items, { from: '2026-10-05', to: '2026-10-10' })).toHaveLength(1);
    expect(filterReviewsByDateRange(items, {})).toHaveLength(3);
  });
});

describe('chart data builders', () => {
  const reviews = [
    review({ rating: 5, tags: ['טרי', 'טעים'] }),
    review({ rating: 1, tags: ['לא טרי'] }),
    review({ productId: 'cucumber', productName: 'מלפפון', rating: 2, tags: ['טרי'] }),
    review({ rating: 4, deliveryDate: new Date(2026, 9, 7) }),
  ];

  test('builds an oldest-first trend', () => {
    const trend = buildRatingTrend(groupProductFeedbackByPeriod(reviews));
    expect(trend.map((item) => item.key)).toEqual(['2026-10-04', '2026-10-11']);
    expect(trend[1]).toMatchObject({ count: 3, lowCount: 2 });
  });

  test('builds the star distribution from 5 down to 1', () => {
    expect(buildRatingDistribution(reviews)).toEqual([
      { rating: 5, count: 1 },
      { rating: 4, count: 1 },
      { rating: 3, count: 0 },
      { rating: 2, count: 1 },
      { rating: 1, count: 1 },
    ]);
  });

  test('ranks products by average', () => {
    expect(buildProductRanking(reviews).map((item) => item.name)).toEqual(['מלפפון', 'עגבנייה']);
    expect(buildProductRanking(reviews, { direction: 'highest', minCount: 2 }).map((item) => item.name))
      .toEqual(['עגבנייה']);
  });

  test('counts tags and marks positive ones', () => {
    expect(buildTagFrequency(reviews)).toEqual([
      { tag: 'טרי', count: 2, positive: true },
      { tag: 'טעים', count: 1, positive: true },
      { tag: 'לא טרי', count: 1, positive: false },
    ]);
  });
});
