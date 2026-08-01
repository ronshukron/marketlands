import React, { useMemo, useState } from 'react';
import { submitProductFeedback } from '../services/productFeedbackService';
import {
  PRODUCT_FEEDBACK_MAX_LENGTH,
  isProductFeedbackEligible,
  validateProductFeedback,
} from '../utils/productFeedbackUtils';

const ProductFeedbackSection = ({ order, lines, userId }) => {
  const [drafts, setDrafts] = useState({});
  const [savingLineId, setSavingLineId] = useState('');
  const [messages, setMessages] = useState({});

  const eligibleLines = useMemo(
    () => (lines || []).filter((line) => isProductFeedbackEligible({ order, line, userId })),
    [lines, order, userId],
  );

  if (eligibleLines.length === 0) return null;

  const updateDraft = (lineId, patch) => {
    setDrafts((current) => ({
      ...current,
      [lineId]: { rating: 0, feedback: '', ...current[lineId], ...patch },
    }));
    setMessages((current) => ({ ...current, [lineId]: '' }));
  };

  const handleSubmit = async (line) => {
    const draft = drafts[line.lineId] || {};
    const validationError = validateProductFeedback(draft);
    if (validationError) {
      setMessages((current) => ({ ...current, [line.lineId]: validationError }));
      return;
    }

    setSavingLineId(line.lineId);
    try {
      await submitProductFeedback({
        orderId: order.id,
        orderCollection: order.customerOrderSource || 'customerOrders',
        lineId: line.lineId,
        rating: draft.rating,
        feedback: draft.feedback,
        userId,
      });
      setMessages((current) => ({
        ...current,
        [line.lineId]: 'המשוב נשמר ויוצג לצוות הניהול בלבד. תודה!',
      }));
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [line.lineId]: error.message || 'לא הצלחנו לשמור את המשוב',
      }));
    } finally {
      setSavingLineId('');
    }
  };

  return (
    <section className="border-t border-gray-200 bg-amber-50/60 p-4 sm:p-6" aria-labelledby="product-feedback-title">
      <h2 id="product-feedback-title" className="text-xl font-bold text-gray-900">
        דירוג ומשוב על מוצרים שרכשת
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        המשוב נשלח לצוות הניהול באופן פרטי ואינו מתפרסם באתר. כתבו מה היה טוב ומה אפשר לשפר.
      </p>

      <div className="mt-5 space-y-4">
        {eligibleLines.map((line) => {
          const draft = drafts[line.lineId] || { rating: 0, feedback: '' };
          const message = messages[line.lineId] || '';
          const isSuccess = message.startsWith('המשוב נשמר');
          return (
            <div key={line.lineId} className="rounded-xl border border-amber-200 bg-white p-4">
              <h3 className="font-semibold text-gray-900">{line.productName || line.name || 'מוצר'}</h3>
              <fieldset className="mt-3">
                <legend className="text-sm font-medium text-gray-700">דירוג</legend>
                <div className="mt-1 flex flex-wrap gap-2" dir="ltr">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <label
                      key={rating}
                      className={`min-h-[44px] min-w-[44px] cursor-pointer rounded-lg border px-3 py-2 text-center text-lg ${
                        Number(draft.rating) === rating
                          ? 'border-amber-500 bg-amber-100 text-amber-900'
                          : 'border-gray-300 bg-white text-gray-600'
                      }`}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name={`rating-${line.lineId}`}
                        value={rating}
                        checked={Number(draft.rating) === rating}
                        onChange={() => updateDraft(line.lineId, { rating })}
                      />
                      <span aria-hidden="true">★</span>
                      <span className="sr-only">{rating} מתוך 5</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label htmlFor={`feedback-${line.lineId}`} className="mt-3 block text-sm font-medium text-gray-700">
                משוב בונה
              </label>
              <textarea
                id={`feedback-${line.lineId}`}
                rows="3"
                maxLength={PRODUCT_FEEDBACK_MAX_LENGTH}
                value={draft.feedback}
                onChange={(event) => updateDraft(line.lineId, { feedback: event.target.value })}
                placeholder="לדוגמה: המוצר היה טרי וטעים; נשמח לאריזה קטנה יותר"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  disabled={savingLineId === line.lineId}
                  onClick={() => handleSubmit(line)}
                  className="min-h-[44px] rounded-lg bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingLineId === line.lineId ? 'שומר...' : 'שליחת דירוג ומשוב'}
                </button>
                {message && (
                  <p role="status" className={`text-sm ${isSuccess ? 'text-green-700' : 'text-red-600'}`}>
                    {message}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default ProductFeedbackSection;
