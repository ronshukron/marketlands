import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/authContext';
import { submitProductFeedback } from '../../services/productFeedbackService';
import {
  PRODUCT_FEEDBACK_MAX_LENGTH,
  PRODUCT_FEEDBACK_TAGS,
  validateProductFeedback,
} from '../../utils/productFeedbackUtils';
import StarRatingPicker from '../StarRatingPicker';

const formatOrderDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
};

const QuickProductReviewSheet = ({
  productName,
  target,
  onClose,
  onSubmitted,
}) => {
  const { currentUser } = useAuth();
  const titleId = useId();
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const onSubmittedRef = useRef(onSubmitted);
  const orderDate = formatOrderDate(target?.orderCreatedAt);
  onSubmittedRef.current = onSubmitted;

  useEffect(() => {
    if (!submitted) return undefined;
    const timer = window.setTimeout(() => onSubmittedRef.current(), 1200);
    return () => window.clearTimeout(timer);
  }, [submitted]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && (!submitting || submitted)) {
        if (submitted) onSubmittedRef.current();
        else onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, submitted, submitting]);

  const toggleTag = (tag) => {
    setTags((current) => (
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]
    ));
    setError('');
  };

  const handleSubmit = async () => {
    const validationError = validateProductFeedback({ rating, feedback, tags });
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!currentUser?.uid) {
      setError('יש להתחבר כדי לשלוח דירוג');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await submitProductFeedback({
        orderId: target.orderId,
        orderCollection: target.orderCollection,
        lineId: target.lineId,
        rating,
        feedback,
        tags,
        source: 'homepage',
        userId: currentUser.uid,
      });
      setSubmitting(false);
      setSubmitted(true);
    } catch (submitError) {
      const denied = submitError?.code === 'permission-denied'
        || String(submitError?.message || '').includes('insufficient permissions');
      setError(denied
        ? 'אין הרשאה לשמור את הדירוג. נסו שוב אחרי רענון.'
        : (submitError.message || 'לא הצלחנו לשמור את הדירוג'));
      setSubmitting(false);
    }
  };

  const closeSheet = () => {
    if (submitted) onSubmittedRef.current();
    else if (!submitting) onClose();
  };

  // Phones: never taller than the screen. The title and × stay at the top,
  // the middle scrolls, and "שליחה" stays at the bottom (also with the
  // keyboard open). [&_p]:mb-0 cancels Bootstrap's gap under paragraphs.
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" dir="rtl">
      <button
        type="button"
        aria-label="סגירה"
        className="absolute inset-0 bg-black/40"
        onClick={closeSheet}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl bg-white text-right shadow-xl sm:rounded-2xl [&_p]:mb-0"
        style={{ maxHeight: '92dvh' }}
      >
        {submitted ? (
          <div className="px-5 py-8 text-center">
            <p className="text-lg font-bold text-green-800">תודה! הדירוג נשמר.</p>
            <button
              type="button"
              onClick={() => onSubmittedRef.current()}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-green-700 px-6 font-semibold text-white"
            >
              סגירה
            </button>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-bold leading-snug text-gray-900 sm:text-lg">
                  {productName || target?.productName || 'המוצר'}
                </h2>
                {orderDate && (
                  <p className="mt-0.5 text-sm text-gray-500">מההזמנה שלכם ב־{orderDate}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-gray-600 hover:bg-gray-100"
                aria-label="סגירה"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5">
              <StarRatingPicker
                value={rating}
                onChange={(nextRating) => {
                  setRating(nextRating);
                  setError('');
                }}
              />

              <div className="mt-3">
                <p className="text-sm font-medium text-gray-700">תגיות (לא חובה)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PRODUCT_FEEDBACK_TAGS.map((tag) => {
                    const selected = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleTag(tag)}
                        className={`min-h-10 rounded-full border px-3 py-1.5 text-sm ${
                          selected
                            ? 'border-amber-500 bg-amber-100 text-amber-950'
                            : 'border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label htmlFor="quick-product-feedback" className="mt-3 block text-sm font-medium text-gray-700">
                משהו נוסף (לא חובה)
              </label>
              <textarea
                id="quick-product-feedback"
                rows="2"
                maxLength={PRODUCT_FEEDBACK_MAX_LENGTH}
                value={feedback}
                onChange={(event) => {
                  setFeedback(event.target.value);
                  setError('');
                }}
                placeholder="למשל: היה טרי, אבל קטן מהצפוי"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200 sm:text-sm"
              />
            </div>

            <div className="shrink-0 border-t border-gray-100 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
              {error && (
                <p role="alert" className="mb-2 text-sm text-red-600">{error}</p>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || rating < 1}
                className="flex h-11 w-full items-center justify-center rounded-lg bg-amber-700 font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'שולח...' : rating < 1 ? 'בחרו דירוג כדי לשלוח' : 'שליחה'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default QuickProductReviewSheet;
