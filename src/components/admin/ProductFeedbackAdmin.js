import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import {
  dismissProductFeedback,
  getAdminProductFeedback,
  restoreProductFeedback,
} from '../../services/productFeedbackService';
import { getRefundStatusDetails } from '../../utils/refundUtils';
import { toLocalDateKey } from '../../utils/deliveryScheduleUtils';
import {
  isDismissedProductFeedback,
  PRODUCT_FEEDBACK_DISMISS_PRESETS,
  validateDismissReason,
} from '../../utils/productFeedbackUtils';
import {
  FEEDBACK_DATE_BASIS,
  FEEDBACK_PERIOD,
  FEEDBACK_PRODUCT_SORT,
  filterReviewsByDateRange,
  formatFeedbackPeriodLabel,
  groupProductFeedbackByPeriod,
  summarizeReviews,
} from '../../utils/productFeedbackStats';
import ProductFeedbackCharts, { getAverageColor, STAR_COLORS } from './ProductFeedbackCharts';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];
const PERIODS_PAGE_SIZE = 12;

const RANGE_PRESETS = [
  { id: '4w', label: '4 שבועות', days: 28 },
  { id: '12w', label: '12 שבועות', days: 84 },
  { id: 'all', label: 'הכל', days: null },
];

const formatDate = (value) => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return 'לא זמין';
  return date.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
};

const formatDay = (value) => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return 'לא זמין';
  return date.toLocaleDateString('he-IL', { dateStyle: 'short' });
};

const formatAmount = (value) => new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
}).format(Number(value) || 0);

const getRefundSummary = (review) => {
  if (!review.refundsLoaded) {
    return {
      label: 'לא הצלחנו לבדוק בקשות החזר',
      className: 'border-gray-200 bg-gray-50 text-gray-700',
    };
  }
  if (review.refundForThisLine) {
    return {
      label: 'ביקש החזר על המוצר הזה',
      className: 'border-orange-200 bg-orange-50 text-orange-950',
    };
  }
  if (review.refundRequested) {
    return {
      label: 'ביקש החזר על ההזמנה, לא על המוצר הזה',
      className: 'border-amber-200 bg-amber-50 text-amber-950',
    };
  }
  return {
    label: 'לא ביקש החזר',
    className: 'border-gray-200 bg-gray-50 text-gray-600',
  };
};

const getPresetFrom = (days) => {
  if (!days) return '';
  const date = new Date();
  date.setDate(date.getDate() - days + 1);
  return toLocalDateKey(date);
};

const matchesSearch = (review, term) => {
  if (!term) return true;
  return [review.productName, review.businessName, review.customerName, review.customerPhone, review.feedback]
    .some((value) => String(value || '').toLowerCase().includes(term));
};

const AverageBadge = ({ average, count }) => (
  <span
    className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold text-white"
    style={{ backgroundColor: count ? getAverageColor(average) : '#9ca3af' }}
    aria-label={`ממוצע ${average} מתוך 5`}
  >
    <span aria-hidden="true">★</span> {count ? average.toFixed(1) : '—'}
  </span>
);

const DistributionBar = ({ distribution, count }) => (
  <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
    {[5, 4, 3, 2, 1].map((rating) => {
      const value = distribution[rating - 1];
      if (!value) return null;
      return (
        <span
          key={rating}
          style={{ width: `${(value / count) * 100}%`, backgroundColor: STAR_COLORS[rating] }}
        />
      );
    })}
  </div>
);

const StatCard = ({ label, value, hint }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold text-gray-500">{label}</p>
    <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
  </div>
);

const SegmentedControl = ({ label, value, options, onChange }) => (
  <div>
    <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
    <div className="inline-flex rounded-lg border border-gray-300 bg-white text-sm" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`min-h-[40px] px-3 first:rounded-r-lg last:rounded-l-lg ${
            value === option.value ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

const ReviewCard = ({
  review,
  showProduct = false,
  pending = false,
  onDismiss,
  onRestore,
}) => {
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const refundSummary = getRefundSummary(review);
  const refundStatus = review.refundStatus ? getRefundStatusDetails(review.refundStatus) : null;

  const submitDismiss = async (event) => {
    event.preventDefault();
    const validationError = validateDismissReason(reason);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    try {
      setFormError('');
      await onDismiss(review, reason.trim());
      setFormOpen(false);
      setReason('');
    } catch (dismissError) {
      setFormError(dismissError.message || 'לא הצלחנו לנטרל את הביקורת');
    }
  };

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {showProduct && (
            <p className="text-sm font-semibold text-gray-500">{review.productName || 'מוצר'}</p>
          )}
          <p className="text-base font-bold text-gray-900">{review.customerName || 'שם לא נמצא בהזמנה'}</p>
          <dl className="mt-1 space-y-0.5 text-sm text-gray-700">
            {review.customerPhone && (
              <div>
                <dt className="inline font-semibold">טלפון: </dt>
                <dd className="inline">
                  <a href={`tel:${review.customerPhone}`} className="text-blue-700 hover:underline">{review.customerPhone}</a>
                </dd>
              </div>
            )}
            {review.customerEmail && (
              <div>
                <dt className="inline font-semibold">אימייל: </dt>
                <dd className="inline break-all">
                  <a href={`mailto:${review.customerEmail}`} className="text-blue-700 hover:underline">{review.customerEmail}</a>
                </dd>
              </div>
            )}
            {review.pickupSpot && (
              <div>
                <dt className="inline font-semibold">נקודת איסוף: </dt>
                <dd className="inline">{review.pickupSpot}</dd>
              </div>
            )}
          </dl>
        </div>
        <span
          className="rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-900"
          aria-label={`דירוג ${review.rating} מתוך 5`}
        >
          <span aria-hidden="true">★</span> {review.rating}/5
        </span>
      </div>

      {Array.isArray(review.tags) && review.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {review.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-950">
              {tag}
            </li>
          ))}
        </ul>
      )}
      <blockquote className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-gray-800">
        {review.feedback || 'דירוג בלבד, בלי טקסט'}
      </blockquote>

      <div className={`mt-3 rounded-lg border px-3 py-2 text-sm font-semibold ${refundSummary.className}`}>
        {refundSummary.label}
        {review.refundRequested && refundStatus && (
          <span className="mr-2 font-medium">· {refundStatus.adminLabel}</span>
        )}
        {review.refundForThisLine && review.refundAmount != null && (
          <span className="mr-2 font-medium">· {formatAmount(review.refundAmount)}</span>
        )}
      </div>
      {review.refundRequested && review.refundReason && (
        <p className="mt-2 text-sm text-gray-700">
          <span className="font-semibold">סיבת ההחזר: </span>
          {review.refundReason}
        </p>
      )}
      {review.refundRequested && (
        <Link to="/admin/refunds" className="mt-1 inline-flex min-h-[44px] items-center text-sm text-blue-700 hover:underline">
          לבקשות ההחזר
        </Link>
      )}

      <dl className="mt-3 grid grid-cols-1 gap-1 text-xs text-gray-500">
        <div><dt className="inline font-semibold">משלוח: </dt><dd className="inline">{formatDay(review.deliveryDate)}</dd></div>
        <div><dt className="inline font-semibold">עודכן: </dt><dd className="inline">{formatDate(review.submittedAt)}</dd></div>
        <div>
          <dt className="inline font-semibold">מקור: </dt>
          <dd className="inline">{review.source === 'homepage' ? 'עמוד הבית' : 'עמוד ההזמנה'}</dd>
        </div>
        <div><dt className="inline font-semibold">הזמנה: </dt><dd className="inline break-all">{review.orderId}</dd></div>
      </dl>

      {review.dismissed ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">נוטרלה: </span>
            {review.dismissReason || 'בלי סיבה'}
            {review.dismissedAt && <span> · {formatDate(review.dismissedAt)}</span>}
          </p>
          <button
            type="button"
            onClick={() => onRestore(review)}
            disabled={pending}
            className="mt-2 min-h-[44px] rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:opacity-60"
          >
            {pending ? 'משחזר...' : 'שחזור הביקורת'}
          </button>
        </div>
      ) : (
        <div className="mt-3">
          {formOpen ? (
            <form onSubmit={submitDismiss} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm text-gray-700">
                הביקורת תצא מהממוצעים ומהגרפים. אפשר לשחזר אותה אחר כך.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PRODUCT_FEEDBACK_DISMISS_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setReason(preset)}
                    className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold ${
                      reason === preset
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-xs font-semibold text-gray-600">
                סיבה
                <input
                  type="text"
                  value={reason}
                  maxLength={300}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-normal text-gray-900"
                />
              </label>
              {formError && <p role="alert" className="mt-2 text-sm text-red-700">{formError}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="min-h-[44px] rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  {pending ? 'מנטרל...' : 'נטרול'}
                </button>
                <button
                  type="button"
                  onClick={() => { setFormOpen(false); setFormError(''); }}
                  className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                  ביטול
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="min-h-[44px] text-sm font-semibold text-red-700 hover:underline"
            >
              נטרול ביקורת
            </button>
          )}
        </div>
      )}
    </article>
  );
};

const ProductRow = ({
  product,
  panelId,
  expanded,
  onToggle,
  pendingReviewId,
  onDismiss,
  onRestore,
}) => {
  const { summary } = product;
  return (
    <li className="border-t border-gray-100 first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-right hover:bg-gray-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-gray-900">{product.productName}</span>
          {product.businessName && <span className="block truncate text-xs text-gray-500">{product.businessName}</span>}
          <span className="mt-1.5 block max-w-xs">
            <DistributionBar distribution={summary.distribution} count={summary.count} />
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-gray-600 sm:flex-row sm:items-center sm:gap-3">
          {summary.refundCount > 0 && (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 font-semibold text-orange-900">
              {summary.refundCount} החזרים
            </span>
          )}
          <span>{summary.count} {summary.count === 1 ? 'דירוג' : 'דירוגים'}</span>
          <AverageBadge average={summary.average} count={summary.count} />
        </span>
        <span aria-hidden="true" className={`shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {expanded && (
        <div id={panelId} className="grid grid-cols-1 gap-3 bg-slate-50 p-4 md:grid-cols-2">
          {product.reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              pending={pendingReviewId === review.id}
              onDismiss={onDismiss}
              onRestore={onRestore}
            />
          ))}
        </div>
      )}
    </li>
  );
};

const ProductFeedbackAdmin = () => {
  const { currentUser, userRole, loading: authLoading } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moderationAvailable, setModerationAvailable] = useState(true);
  const [pendingReviewId, setPendingReviewId] = useState('');
  const [actionError, setActionError] = useState('');
  const [period, setPeriod] = useState(FEEDBACK_PERIOD.WEEK);
  const [basis, setBasis] = useState(FEEDBACK_DATE_BASIS.DELIVERY);
  const [sort, setSort] = useState(FEEDBACK_PRODUCT_SORT.COUNT);
  const [preset, setPreset] = useState('12w');
  const [fromDate, setFromDate] = useState(() => getPresetFrom(84));
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [visiblePeriods, setVisiblePeriods] = useState(PERIODS_PAGE_SIZE);
  const isAdmin = userRole === 'admin' || ADMIN_UIDS.includes(currentUser?.uid);

  useEffect(() => {
    const load = async () => {
      if (authLoading) return;
      if (!isAdmin) {
        setError('העמוד זמין למנהלים בלבד');
        setLoading(false);
        return;
      }
      try {
        setError('');
        setLoading(true);
        const loaded = await getAdminProductFeedback();
        setReviews(loaded.reviews);
        setModerationAvailable(loaded.moderationAvailable);
      } catch (loadError) {
        console.error('Failed to load product feedback', loadError);
        setError('לא הצלחנו לטעון את המשובים. יש לוודא שחוקי Firestore המעודכנים נפרסו.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isAdmin, authLoading]);

  const activeReviews = useMemo(
    () => reviews.filter((review) => !isDismissedProductFeedback(review)),
    [reviews],
  );
  const filteredReviews = useMemo(() => {
    const term = search.trim().toLowerCase();
    return filterReviewsByDateRange(activeReviews, { from: fromDate, to: toDate, basis })
      .filter((review) => matchesSearch(review, term));
  }, [activeReviews, fromDate, toDate, basis, search]);
  const dismissedReviews = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reviews.filter((review) => isDismissedProductFeedback(review) && matchesSearch(review, term));
  }, [reviews, search]);

  const periods = useMemo(
    () => groupProductFeedbackByPeriod(filteredReviews, { period, basis, sort }),
    [filteredReviews, period, basis, sort],
  );
  const totals = useMemo(() => summarizeReviews(filteredReviews), [filteredReviews]);
  const productCount = useMemo(
    () => new Set(filteredReviews.map((review) => review.productId || review.productName)).size,
    [filteredReviews],
  );

  const applyPreset = (nextPreset) => {
    setPreset(nextPreset.id);
    setFromDate(getPresetFrom(nextPreset.days));
    setToDate('');
    setVisiblePeriods(PERIODS_PAGE_SIZE);
  };

  const toggleRow = (rowKey) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const highShare = totals.count ? Math.round((totals.highCount / totals.count) * 100) : 0;

  const updateReviewModeration = (reviewId, moderation) => {
    setReviews((current) => current.map((review) => (
      review.id === reviewId ? { ...review, ...moderation } : review
    )));
  };

  const dismissReview = async (review, reason) => {
    setPendingReviewId(review.id);
    try {
      await dismissProductFeedback({ reviewId: review.id, reason, adminUid: currentUser?.uid });
      updateReviewModeration(review.id, {
        dismissed: true,
        dismissReason: reason.trim(),
        dismissedAt: new Date(),
      });
    } finally {
      setPendingReviewId('');
    }
  };

  const restoreReview = async (review) => {
    setPendingReviewId(review.id);
    setActionError('');
    try {
      await restoreProductFeedback({ reviewId: review.id, adminUid: currentUser?.uid });
      updateReviewModeration(review.id, { dismissed: false, dismissReason: '' });
    } catch (restoreError) {
      setActionError(restoreError.message || 'לא הצלחנו לשחזר את הביקורת');
    } finally {
      setPendingReviewId('');
    }
  };

  return (
    <main dir="rtl" className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <Link to="/admin" className="inline-flex min-h-[44px] items-center text-sm text-blue-700 hover:underline">
        ← חזרה ללוח הניהול
      </Link>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">משוב לקוחות על מוצרים</h1>
      <p className="mt-2 text-sm text-gray-600">
        דירוגים ומשוב בונה של לקוחות שרכשו את המוצר. המידע פרטי ואינו מוצג בחנות.
      </p>

      {loading && <p className="py-12 text-center text-gray-600">טוען משובים...</p>}
      {error && (
        <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}
      {!loading && !error && reviews.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
          עדיין לא נשלחו משובים.
        </div>
      )}

      {!loading && !error && reviews.length > 0 && (
        <>
          {!moderationAvailable && (
            <div role="status" className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              לא הצלחנו לטעון אילו ביקורות נוטרלו. ניטרול חדש יעבוד אחרי פריסת חוקי Firestore המעודכנים.
            </div>
          )}
          <section
            aria-label="סינון ותצוגה"
            className="mt-6 flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <SegmentedControl
              label="קיבוץ לפי"
              value={period}
              onChange={setPeriod}
              options={[
                { value: FEEDBACK_PERIOD.WEEK, label: 'שבוע' },
                { value: FEEDBACK_PERIOD.DAY, label: 'יום' },
              ]}
            />
            <SegmentedControl
              label="לפי תאריך"
              value={basis}
              onChange={setBasis}
              options={[
                { value: FEEDBACK_DATE_BASIS.DELIVERY, label: 'משלוח' },
                { value: FEEDBACK_DATE_BASIS.SUBMITTED, label: 'שליחת המשוב' },
              ]}
            />
            <SegmentedControl
              label="תקופה"
              value={preset}
              onChange={(id) => applyPreset(RANGE_PRESETS.find((item) => item.id === id))}
              options={RANGE_PRESETS.map((item) => ({ value: item.id, label: item.label }))}
            />
            <label className="text-xs font-semibold text-gray-600">
              <span className="mb-1 block">מתאריך</span>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => { setFromDate(event.target.value); setPreset('custom'); }}
                className="min-h-[40px] rounded-lg border border-gray-300 px-2 text-sm text-gray-900"
              />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              <span className="mb-1 block">עד תאריך</span>
              <input
                type="date"
                value={toDate}
                onChange={(event) => { setToDate(event.target.value); setPreset('custom'); }}
                className="min-h-[40px] rounded-lg border border-gray-300 px-2 text-sm text-gray-900"
              />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              <span className="mb-1 block">מיון מוצרים</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="min-h-[40px] rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900"
              >
                <option value={FEEDBACK_PRODUCT_SORT.COUNT}>הכי הרבה דירוגים</option>
                <option value={FEEDBACK_PRODUCT_SORT.LOWEST}>דירוג נמוך קודם</option>
                <option value={FEEDBACK_PRODUCT_SORT.HIGHEST}>דירוג גבוה קודם</option>
              </select>
            </label>
            <label className="min-w-[200px] flex-1 text-xs font-semibold text-gray-600">
              <span className="mb-1 block">חיפוש</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="מוצר, ספק, לקוח או טלפון"
                className="min-h-[40px] w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900"
              />
            </label>
          </section>

          <section aria-label="סיכום" className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="ממוצע כללי"
              value={totals.count ? `★ ${totals.average.toFixed(1)}` : '—'}
              hint={`${totals.count} דירוגים`}
            />
            <StatCard label="מוצרים שדורגו" value={productCount} />
            <StatCard label="דירוגים 4-5" value={`${highShare}%`} hint={`${totals.lowCount} דירוגים של 1-2`} />
            <StatCard label="החזר על אותו מוצר" value={totals.refundCount} />
          </section>

          <ProductFeedbackCharts reviews={filteredReviews} periods={periods} period={period} />

          <h2 className="mt-8 text-xl font-bold text-gray-900">
            {period === FEEDBACK_PERIOD.DAY ? 'דירוגים לפי יום' : 'דירוגים לפי שבוע'}
          </h2>
          <p className="text-sm text-gray-500">לחיצה על מוצר פותחת את הדירוג של כל לקוח.</p>

          {periods.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
              אין משובים שמתאימים לסינון.
            </div>
          )}

          <div className="mt-4 space-y-4">
            {periods.slice(0, visiblePeriods).map((group, groupIndex) => (
              <section key={group.key} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <header className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 px-4 py-3">
                  <h3 className="font-bold text-gray-900">{formatFeedbackPeriodLabel(group.key, period)}</h3>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span>{group.products.length} מוצרים · {group.summary.count} דירוגים</span>
                    <AverageBadge average={group.summary.average} count={group.summary.count} />
                  </div>
                </header>
                <ul>
                  {group.products.map((product, productIndex) => {
                    const rowKey = `${group.key}|${product.key}`;
                    return (
                      <ProductRow
                        key={product.key}
                        product={product}
                        panelId={`feedback-panel-${groupIndex}-${productIndex}`}
                        expanded={expanded.has(rowKey)}
                        onToggle={() => toggleRow(rowKey)}
                        pendingReviewId={pendingReviewId}
                        onDismiss={dismissReview}
                        onRestore={restoreReview}
                      />
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          {periods.length > visiblePeriods && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setVisiblePeriods((count) => count + PERIODS_PAGE_SIZE)}
                className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                הצג תקופות נוספות
              </button>
            </div>
          )}

          {(dismissedReviews.length > 0 || actionError) && (
            <section className="mt-8 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">
                ביקורות שנוטרלו ({dismissedReviews.length})
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                הביקורות האלה לא נספרות בממוצעים ובגרפים.
              </p>
              {actionError && (
                <p role="alert" className="mt-3 text-sm text-red-700">{actionError}</p>
              )}
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {dismissedReviews.map((review) => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    showProduct
                    pending={pendingReviewId === review.id}
                    onRestore={restoreReview}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
};

export default ProductFeedbackAdmin;
