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

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" dir="rtl">
      <button
        type="button"
        aria-label="סגירה"
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (submitted) onSubmittedRef.current();
          else if (!submitting) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        {submitted ? (
          <div className="py-8 text-center">
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={titleId} className="text-lg font-bold text-gray-900">
                  {productName || target?.productName || 'המוצר'}
                </h2>
                {orderDate && (
                  <p className="mt-1 text-sm text-gray-500">מההזמנה שלכם ב־{orderDate}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-gray-500 hover:bg-gray-100"
                aria-label="סגירה"
              >
                ×
              </button>
            </div>

            <StarRatingPicker
              value={rating}
              onChange={(nextRating) => {
                setRating(nextRating);
                setError('');
              }}
            />

            <div className="mt-4">
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
                      className={`min-h-11 rounded-full border px-3 py-2 text-sm ${
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

            <label htmlFor="quick-product-feedback" className="mt-4 block text-sm font-medium text-gray-700">
              משהו נוסף (לא חובה)
            </label>
            <textarea
              id="quick-product-feedback"
              rows="3"
              maxLength={PRODUCT_FEEDBACK_MAX_LENGTH}
              value={feedback}
              onChange={(event) => {
                setFeedback(event.target.value);
                setError('');
              }}
              placeholder="למשל: היה טרי, אבל קטן מהצפוי"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />

            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || rating < 1}
              className="mt-4 flex h-11 w-full items-center justify-center rounded-lg bg-amber-700 font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'שולח...' : 'שליחה'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default QuickProductReviewSheet;
