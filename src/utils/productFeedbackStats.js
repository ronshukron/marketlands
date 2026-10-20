import { getWeekKey, parseDateSafe, toLocalDateKey } from './deliveryScheduleUtils';

export const FEEDBACK_PERIOD = Object.freeze({ WEEK: 'week', DAY: 'day' });
export const FEEDBACK_DATE_BASIS = Object.freeze({ DELIVERY: 'delivery', SUBMITTED: 'submitted' });
export const FEEDBACK_PRODUCT_SORT = Object.freeze({ COUNT: 'count', LOWEST: 'lowest', HIGHEST: 'highest' });
export const UNKNOWN_PERIOD_KEY = 'unknown';

export const POSITIVE_FEEDBACK_TAGS = Object.freeze(['טרי', 'טעים', 'כמו בתמונה']);

const roundOne = (value) => Math.round(value * 10) / 10;

const toMillis = (value) => parseDateSafe(value)?.getTime() || 0;

export const getReviewDate = (review = {}, basis = FEEDBACK_DATE_BASIS.DELIVERY) => (
  basis === FEEDBACK_DATE_BASIS.SUBMITTED
    ? parseDateSafe(review.submittedAt)
    : parseDateSafe(review.deliveryDate) || parseDateSafe(review.submittedAt)
);

export const getPeriodKey = (date, period = FEEDBACK_PERIOD.WEEK) => {
  if (!parseDateSafe(date)) return UNKNOWN_PERIOD_KEY;
  return period === FEEDBACK_PERIOD.DAY ? toLocalDateKey(date) : getWeekKey(date);
};

export const getPeriodRange = (key, period = FEEDBACK_PERIOD.WEEK) => {
  const start = key === UNKNOWN_PERIOD_KEY ? null : parseDateSafe(key);
  if (!start) return null;
  const end = new Date(start);
  if (period === FEEDBACK_PERIOD.WEEK) end.setDate(start.getDate() + 6);
  return { start, end };
};

const formatDayMonth = (date) => `${date.getDate()}.${date.getMonth() + 1}`;

export const formatFeedbackPeriodShort = (key, period = FEEDBACK_PERIOD.WEEK) => {
  const range = getPeriodRange(key, period);
  return range ? formatDayMonth(range.start) : 'ללא תאריך';
};

export const formatFeedbackPeriodLabel = (key, period = FEEDBACK_PERIOD.WEEK) => {
  const range = getPeriodRange(key, period);
  if (!range) return 'ללא תאריך';
  if (period === FEEDBACK_PERIOD.DAY) {
    return range.start.toLocaleDateString('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
  }
  return `שבוע ${formatDayMonth(range.start)}–${formatDayMonth(range.end)}.${range.end.getFullYear()}`;
};

const getProductKey = (review) => String(review.productId || review.productName || 'unknown');

export const summarizeReviews = (reviews = []) => {
  const distribution = [0, 0, 0, 0, 0];
  let sum = 0;
  let count = 0;
  let refundCount = 0;
  reviews.forEach((review) => {
    const rating = Math.round(Number(review.rating));
    if (!(rating >= 1 && rating <= 5)) return;
    distribution[rating - 1] += 1;
    sum += rating;
    count += 1;
    if (review.refundForThisLine) refundCount += 1;
  });
  return {
    count,
    average: count ? roundOne(sum / count) : 0,
    distribution,
    lowCount: distribution[0] + distribution[1],
    highCount: distribution[3] + distribution[4],
    refundCount,
  };
};

const sortProducts = (products, sort) => {
  const byName = (a, b) => a.productName.localeCompare(b.productName, 'he');
  const comparators = {
    [FEEDBACK_PRODUCT_SORT.LOWEST]: (a, b) => (
      a.summary.average - b.summary.average || b.summary.count - a.summary.count || byName(a, b)
    ),
    [FEEDBACK_PRODUCT_SORT.HIGHEST]: (a, b) => (
      b.summary.average - a.summary.average || b.summary.count - a.summary.count || byName(a, b)
    ),
    [FEEDBACK_PRODUCT_SORT.COUNT]: (a, b) => (
      b.summary.count - a.summary.count || a.summary.average - b.summary.average || byName(a, b)
    ),
  };
  return products.sort(comparators[sort] || comparators[FEEDBACK_PRODUCT_SORT.COUNT]);
};

export const groupReviewsByProduct = (reviews = [], { sort = FEEDBACK_PRODUCT_SORT.COUNT } = {}) => {
  const groups = new Map();
  reviews.forEach((review) => {
    const key = getProductKey(review);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(review);
  });

  const products = [...groups.entries()].map(([key, items]) => {
    const sorted = [...items].sort((a, b) => toMillis(b.submittedAt) - toMillis(a.submittedAt));
    const latest = sorted[0] || {};
    return {
      key,
      productId: latest.productId || '',
      productName: latest.productName || 'מוצר',
      businessName: latest.businessName || '',
      summary: summarizeReviews(sorted),
      reviews: sorted,
    };
  });
  return sortProducts(products, sort);
};

export const groupProductFeedbackByPeriod = (reviews = [], {
  period = FEEDBACK_PERIOD.WEEK,
  basis = FEEDBACK_DATE_BASIS.DELIVERY,
  sort = FEEDBACK_PRODUCT_SORT.COUNT,
} = {}) => {
  const groups = new Map();
  reviews.forEach((review) => {
    const key = getPeriodKey(getReviewDate(review, basis), period);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(review);
  });

  return [...groups.entries()]
    .map(([key, items]) => ({
      key,
      range: getPeriodRange(key, period),
      summary: summarizeReviews(items),
      products: groupReviewsByProduct(items, { sort }),
    }))
    .sort((a, b) => {
      if (a.key === UNKNOWN_PERIOD_KEY) return 1;
      if (b.key === UNKNOWN_PERIOD_KEY) return -1;
      return b.key.localeCompare(a.key);
    });
};

export const filterReviewsByDateRange = (reviews = [], {
  from = '',
  to = '',
  basis = FEEDBACK_DATE_BASIS.DELIVERY,
} = {}) => {
  const start = from ? parseDateSafe(from) : null;
  const end = to ? parseDateSafe(to) : null;
  if (end) end.setHours(23, 59, 59, 999);
  if (!start && !end) return reviews;
  return reviews.filter((review) => {
    const date = getReviewDate(review, basis);
    if (!date) return false;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  });
};

export const buildRatingTrend = (periods = []) => periods
  .filter((item) => item.key !== UNKNOWN_PERIOD_KEY)
  .slice()
  .reverse()
  .map((item) => ({
    key: item.key,
    average: item.summary.average,
    count: item.summary.count,
    lowCount: item.summary.lowCount,
  }));

export const buildRatingDistribution = (reviews = []) => {
  const { distribution } = summarizeReviews(reviews);
  return distribution.map((count, index) => ({ rating: index + 1, count })).reverse();
};

export const buildProductRanking = (reviews = [], {
  direction = 'lowest',
  limit = 8,
  minCount = 1,
} = {}) => groupReviewsByProduct(reviews, {
  sort: direction === 'highest' ? FEEDBACK_PRODUCT_SORT.HIGHEST : FEEDBACK_PRODUCT_SORT.LOWEST,
})
  .filter((product) => product.summary.count >= minCount)
  .slice(0, limit)
  .map((product) => ({
    key: product.key,
    name: product.productName,
    average: product.summary.average,
    count: product.summary.count,
  }));

export const buildTagFrequency = (reviews = []) => {
  const counts = new Map();
  reviews.forEach((review) => {
    (Array.isArray(review.tags) ? review.tags : []).forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count, positive: POSITIVE_FEEDBACK_TAGS.includes(tag) }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'he'));
};
