import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { ensureLineIdsInBreakdown, flattenOrderBreakdown } from '../components/adminV5/deliveryWeighingV5/v7/orderDraftUtils';
import {
  attachProductFeedbackContext,
  buildProductFeedbackId,
  isProductFeedbackEligible,
  normalizeFeedbackTags,
  normalizeFeedbackText,
  PRODUCT_FEEDBACK_SOURCES,
  validateDismissReason,
  validateProductFeedback,
} from '../utils/productFeedbackUtils';
import { getOrderDeliveryDate } from '../utils/deliveryScheduleUtils';

export const PRODUCT_FEEDBACK_COLLECTION = 'productFeedback';
export const PRODUCT_FEEDBACK_MODERATION_COLLECTION = 'productFeedbackModeration';
const CUSTOMER_ORDER_COLLECTIONS = new Set(['customerOrders', 'customerOrdersDelayed']);

export const submitProductFeedback = async ({
  orderId,
  orderCollection = 'customerOrders',
  lineId,
  rating,
  feedback,
  tags = [],
  source = 'order_detail',
  userId,
}) => {
  if (!userId) throw new Error('יש להתחבר כדי לשלוח משוב');
  if (!CUSTOMER_ORDER_COLLECTIONS.has(orderCollection)) throw new Error('מקור ההזמנה אינו נתמך');
  if (!PRODUCT_FEEDBACK_SOURCES.includes(source)) throw new Error('מקור המשוב אינו תקין');

  const validationError = validateProductFeedback({ rating, feedback, tags });
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
      tags: normalizeFeedbackTags(tags),
      source,
      active: true,
      submittedAt: serverTimestamp(),
    }, { merge: true });
  });

  return { id: feedbackRef.id };
};

const REFUND_QUERY_CHUNK = 30;

const chunkValues = (values, size) => {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const loadFeedbackOrders = async (reviews) => {
  const orderRefs = new Map();
  reviews.forEach((review) => {
    if (!review.orderId || !CUSTOMER_ORDER_COLLECTIONS.has(review.orderCollection)) return;
    orderRefs.set(`${review.orderCollection}/${review.orderId}`, {
      collectionName: review.orderCollection,
      orderId: review.orderId,
    });
  });

  const orders = {};
  await Promise.all([...orderRefs.values()].map(async ({ collectionName, orderId }) => {
    try {
      const orderSnap = await getDoc(doc(db, collectionName, orderId));
      if (orderSnap.exists()) orders[orderId] = { id: orderSnap.id, ...orderSnap.data() };
    } catch (error) {
      console.error('Failed to load order for product feedback', orderId, error);
    }
  }));
  return orders;
};

const loadFeedbackRefunds = async (orderIds) => {
  if (orderIds.length === 0) return { refunds: [], refundsLoaded: true };
  try {
    const snapshots = await Promise.all(
      chunkValues(orderIds, REFUND_QUERY_CHUNK).map((ids) => (
        getDocs(query(collection(db, 'refunds'), where('orderId', 'in', ids)))
      )),
    );
    return {
      refunds: snapshots.flatMap((snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      refundsLoaded: true,
    };
  } catch (error) {
    console.error('Failed to load refunds for product feedback', error);
    return { refunds: [], refundsLoaded: false };
  }
};

const assertFeedbackId = (reviewId) => {
  const id = String(reviewId || '');
  if (!id || id.includes('/')) throw new Error('מזהה הביקורת אינו תקין');
  return id;
};

const wrapModerationError = (error) => {
  if (error?.code === 'permission-denied') {
    throw new Error('הפעולה נכשלה. צריך לפרוס את חוקי Firestore המעודכנים.');
  }
  throw error;
};

const loadFeedbackModeration = async () => {
  const snap = await getDocs(collection(db, PRODUCT_FEEDBACK_MODERATION_COLLECTION));
  const byId = {};
  snap.docs.forEach((item) => {
    byId[item.id] = item.data();
  });
  return byId;
};

export const dismissProductFeedback = async ({ reviewId, reason, adminUid }) => {
  const id = assertFeedbackId(reviewId);
  if (!adminUid) throw new Error('יש להתחבר כמנהל');
  const validationError = validateDismissReason(reason);
  if (validationError) throw new Error(validationError);

  try {
    await setDoc(doc(db, PRODUCT_FEEDBACK_MODERATION_COLLECTION, id), {
      feedbackId: id,
      dismissed: true,
      reason: String(reason).trim(),
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
      dismissedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    wrapModerationError(error);
  }
};

export const restoreProductFeedback = async ({ reviewId, adminUid }) => {
  const id = assertFeedbackId(reviewId);
  if (!adminUid) throw new Error('יש להתחבר כמנהל');

  try {
    await updateDoc(doc(db, PRODUCT_FEEDBACK_MODERATION_COLLECTION, id), {
      feedbackId: id,
      dismissed: false,
      reason: 'שוחזר על ידי מנהל',
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
      restoredAt: serverTimestamp(),
    });
  } catch (error) {
    wrapModerationError(error);
  }
};

export const getAdminProductFeedback = async () => {
  const snap = await getDocs(collection(db, PRODUCT_FEEDBACK_COLLECTION));
  const reviews = snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.active !== false)
    .sort((a, b) => (
      (b.submittedAt?.toMillis?.() || 0) - (a.submittedAt?.toMillis?.() || 0)
    ));

  const [orders, refundContext, moderationResult] = await Promise.all([
    loadFeedbackOrders(reviews),
    loadFeedbackRefunds([...new Set(reviews.map((review) => review.orderId).filter(Boolean))]),
    loadFeedbackModeration()
      .then((byId) => ({ byId, available: true }))
      .catch((error) => {
        console.error('Failed to load product feedback moderation', error);
        return { byId: {}, available: false };
      }),
  ]);

  return {
    moderationAvailable: moderationResult.available,
    reviews: reviews.map((review) => {
      const order = orders[review.orderId] || null;
      const moderation = moderationResult.byId[review.id] || {};
      return {
        ...attachProductFeedbackContext(review, {
          order,
          refunds: refundContext.refunds,
          refundsLoaded: refundContext.refundsLoaded,
        }),
        deliveryDate: order ? getOrderDeliveryDate(order) : null,
        dismissed: moderation.dismissed === true,
        dismissReason: String(moderation.reason || ''),
        dismissedAt: moderation.dismissedAt || null,
      };
    }),
  };
};
