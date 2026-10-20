import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useAuth } from './authContext';
import { ensureLineIdsInBreakdown, flattenOrderBreakdown } from '../components/adminV5/deliveryWeighingV5/v7/orderDraftUtils';
import { PRODUCT_FEEDBACK_COLLECTION } from '../services/productFeedbackService';
import {
  buildProductFeedbackId,
  isProductFeedbackEligible,
  isPurchasedOrder,
} from '../utils/productFeedbackUtils';

const REVIEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const ProductFeedbackContext = React.createContext({
  getReviewTarget: () => null,
  markReviewed: () => {},
});

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date ? date.getTime() : 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const catalogKeyFor = (businessId, catalogNumber) => {
  const catalog = String(catalogNumber || '').trim();
  const business = String(businessId || '').trim();
  if (!catalog || !business) return '';
  return `catalog:${business}:${catalog}`;
};

const loadReviewTargets = async (userId) => {
  const [standardSnap, delayedSnap] = await Promise.all([
    getDocs(query(collection(db, 'customerOrders'), where('userId', '==', userId))),
    getDocs(query(collection(db, 'customerOrdersDelayed'), where('userId', '==', userId))),
  ]);

  let ratedIds = new Set();
  try {
    const feedbackSnap = await getDocs(query(
      collection(db, PRODUCT_FEEDBACK_COLLECTION),
      where('userId', '==', userId),
    ));
    ratedIds = new Set(feedbackSnap.docs.map((item) => item.id));
  } catch (error) {
    console.warn('Existing product reviews could not be loaded', error);
  }
  const cutoff = Date.now() - REVIEW_WINDOW_MS;
  const byProductId = new Map();

  const considerOrder = (order, orderCollection) => {
    const createdAtMs = toMillis(order.createdAt);
    if (!createdAtMs || createdAtMs < cutoff || !isPurchasedOrder(order)) return;

    const { breakdown } = ensureLineIdsInBreakdown(order.id, order.orderBreakdown || {});
    flattenOrderBreakdown(breakdown).forEach((line) => {
      if (!isProductFeedbackEligible({ order, line, userId })) return;
      let feedbackId = '';
      try {
        feedbackId = buildProductFeedbackId(order.id, line.lineId);
      } catch {
        return;
      }
      if (ratedIds.has(feedbackId)) return;

      const productId = String(line.productId || '');
      const target = {
        orderId: order.id,
        orderCollection,
        lineId: line.lineId,
        productId,
        productName: line.productName || line.name || '',
        orderCreatedAt: createdAtMs,
      };
      const keys = [productId, catalogKeyFor(line.businessId, line.catalogNumber)].filter(Boolean);
      keys.forEach((key) => {
        const current = byProductId.get(key);
        if (!current || current.orderCreatedAt < createdAtMs) byProductId.set(key, target);
      });
    });
  };

  standardSnap.docs.forEach((item) => {
    considerOrder({ id: item.id, ...item.data() }, 'customerOrders');
  });
  delayedSnap.docs.forEach((item) => {
    considerOrder({ id: item.id, ...item.data() }, 'customerOrdersDelayed');
  });

  return byProductId;
};

export function ProductFeedbackProvider({ children }) {
  const { currentUser } = useAuth();
  const [byProductId, setByProductId] = useState(() => new Map());
  const [hiddenProductIds, setHiddenProductIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const userId = currentUser?.uid;
    if (!userId) {
      setByProductId(new Map());
      setHiddenProductIds(new Set());
      return undefined;
    }

    loadReviewTargets(userId)
      .then((targets) => {
        if (!cancelled) setByProductId(targets);
      })
      .catch((error) => {
        console.warn('Product review targets are unavailable', error);
        if (!cancelled) setByProductId(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid]);

  const getReviewTarget = useCallback((product) => {
    const source = product && typeof product === 'object' ? product : { id: product };
    const keys = [
      String(source.id || ''),
      catalogKeyFor(source.businessId, source.catalogNumber),
    ].filter(Boolean);
    if (keys.length === 0 || keys.some((key) => hiddenProductIds.has(key))) return null;
    return keys.map((key) => byProductId.get(key)).find(Boolean) || null;
  }, [byProductId, hiddenProductIds]);

  const markReviewed = useCallback((product) => {
    const source = product && typeof product === 'object' ? product : { id: product };
    const keys = [
      String(source.id || ''),
      catalogKeyFor(source.businessId, source.catalogNumber),
    ].filter(Boolean);
    if (keys.length === 0) return;
    setHiddenProductIds((current) => {
      if (keys.every((key) => current.has(key))) return current;
      const next = new Set(current);
      keys.forEach((key) => next.add(key));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ getReviewTarget, markReviewed }),
    [getReviewTarget, markReviewed],
  );

  return (
    <ProductFeedbackContext.Provider value={value}>
      {children}
    </ProductFeedbackContext.Provider>
  );
}

export function useProductFeedback() {
  return useContext(ProductFeedbackContext);
}
