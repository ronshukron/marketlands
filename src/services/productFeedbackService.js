import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { ensureLineIdsInBreakdown, flattenOrderBreakdown } from '../components/adminV5/deliveryWeighingV5/v7/orderDraftUtils';
import {
  buildProductFeedbackId,
  isProductFeedbackEligible,
  normalizeFeedbackText,
  validateProductFeedback,
} from '../utils/productFeedbackUtils';

export const PRODUCT_FEEDBACK_COLLECTION = 'productFeedback';
const CUSTOMER_ORDER_COLLECTIONS = new Set(['customerOrders', 'customerOrdersDelayed']);

export const submitProductFeedback = async ({
  orderId,
  orderCollection = 'customerOrders',
  lineId,
  rating,
  feedback,
  userId,
}) => {
  if (!userId) throw new Error('יש להתחבר כדי לשלוח משוב');
  if (!CUSTOMER_ORDER_COLLECTIONS.has(orderCollection)) throw new Error('מקור ההזמנה אינו נתמך');

  const validationError = validateProductFeedback({ rating, feedback });
  if (validationError) throw new Error(validationError);

  const orderRef = doc(db, orderCollection, orderId);
  const feedbackRef = doc(db, PRODUCT_FEEDBACK_COLLECTION, buildProductFeedbackId(orderId, lineId));

  await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw new Error('ההזמנה לא נמצאה');

    const order = { id: orderSnap.id, ...orderSnap.data() };
    const { breakdown } = ensureLineIdsInBreakdown(orderId, order.orderBreakdown || {});
    const line = flattenOrderBreakdown(breakdown).find((item) => item.lineId === lineId);

    if (!isProductFeedbackEligible({ order, line, userId })) {
      throw new Error('ניתן לדרג רק מוצר שנרכש בהזמנה שלך');
    }

    transaction.set(feedbackRef, {
      userId,
      orderId,
      orderCollection,
      lineId,
      productId: String(line.productId || '').slice(0, 200),
      productName: String(line.productName || line.name || 'מוצר').slice(0, 160),
      businessId: String(line.businessId || '').slice(0, 200),
      businessName: String(line.businessName || '').slice(0, 160),
      rating: Number(rating),
      feedback: normalizeFeedbackText(feedback),
      active: true,
      submittedAt: serverTimestamp(),
    }, { merge: true });
  });

  return { id: feedbackRef.id };
};

export const getAdminProductFeedback = async () => {
  const snap = await getDocs(collection(db, PRODUCT_FEEDBACK_COLLECTION));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.active !== false)
    .sort((a, b) => (
      (b.submittedAt?.toMillis?.() || 0) - (a.submittedAt?.toMillis?.() || 0)
    ));
};
