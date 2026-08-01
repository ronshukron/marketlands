import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import { getAdminProductFeedback } from '../../services/productFeedbackService';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];

const formatDate = (value) => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return 'לא זמין';
  return date.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
};

const ProductFeedbackAdmin = () => {
  const { currentUser, userRole } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isAdmin = userRole === 'admin' || ADMIN_UIDS.includes(currentUser?.uid);

  useEffect(() => {
    const load = async () => {
      if (!isAdmin) {
        setError('העמוד זמין למנהלים בלבד');
        setLoading(false);
        return;
      }
      try {
        setReviews(await getAdminProductFeedback());
      } catch (loadError) {
        console.error('Failed to load product feedback', loadError);
        setError('לא הצלחנו לטעון את המשובים. יש לוודא שחוקי Firestore המעודכנים נפרסו.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isAdmin]);

  return (
    <main dir="rtl" className="mx-auto min-h-screen max-w-5xl px-4 py-8">
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
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{review.productName || 'מוצר'}</h2>
                  {review.businessName && <p className="text-sm text-gray-500">{review.businessName}</p>}
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-900" aria-label={`דירוג ${review.rating} מתוך 5`}>
                  <span aria-hidden="true">★</span> {review.rating}/5
                </span>
              </div>
              <blockquote className="mt-4 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-gray-800">
                {review.feedback}
              </blockquote>
              <dl className="mt-4 grid grid-cols-1 gap-1 text-xs text-gray-500">
                <div><dt className="inline font-semibold">הזמנה: </dt><dd className="inline">{review.orderId}</dd></div>
                <div><dt className="inline font-semibold">שורת הזמנה: </dt><dd className="inline">{review.lineId}</dd></div>
                <div><dt className="inline font-semibold">עודכן: </dt><dd className="inline">{formatDate(review.submittedAt)}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </main>
  );
};

export default ProductFeedbackAdmin;
