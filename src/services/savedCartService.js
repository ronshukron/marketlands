/**
 * Firestore rules snippet (deploy alongside this feature):
 *
 * match /users/{userId}/savedCarts/{cartId} {
 *   allow read, write: if request.auth != null && request.auth.uid == userId;
 * }
 */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

const MAX_SAVED_CARTS = 10;

const getTimestampMillis = (value) => {
  if (!value) return 0;
  if (value.toDate) return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

export async function listSavedCarts(uid) {
  if (!uid) return [];
  const cartsRef = collection(db, 'users', uid, 'savedCarts');
  const snapshot = await getDocs(cartsRef);
  return snapshot.docs
    .map((cartDoc) => ({
      id: cartDoc.id,
      ...cartDoc.data(),
    }))
    .sort(
      (a, b) =>
        getTimestampMillis(b.updatedAt || b.createdAt) -
        getTimestampMillis(a.updatedAt || a.createdAt)
    );
}

export async function saveCart(uid, { name, cartItems, orderInfoMap, pickupSpot, estimatedTotal, itemCount }) {
  if (!uid) throw new Error('NOT_LOGGED_IN');
  if (!name || !name.trim()) throw new Error('NAME_REQUIRED');

  const existing = await listSavedCarts(uid);
  if (existing.length >= MAX_SAVED_CARTS) {
    throw new Error('LIMIT_REACHED');
  }

  const cartsRef = collection(db, 'users', uid, 'savedCarts');
  const docRef = await addDoc(cartsRef, {
    name: name.trim(),
    pickupSpot: pickupSpot || '',
    cartItems: cartItems || [],
    orderInfoMap: orderInfoMap || {},
    itemCount: itemCount || 0,
    estimatedTotal: estimatedTotal || 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function deleteSavedCart(uid, cartId) {
  if (!uid || !cartId) return;
  await deleteDoc(doc(db, 'users', uid, 'savedCarts', cartId));
}

export async function loadSavedCartSnapshot(uid, cartId) {
  if (!uid || !cartId) return null;
  const snap = await getDoc(doc(db, 'users', uid, 'savedCarts', cartId));
  if (!snap.exists()) return null;
  return {
    id: snap.id,
    ...snap.data(),
  };
}
