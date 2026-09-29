/**
 * Firestore rules snippet (deploy alongside this feature):
 * docs/FarmerPastedOrders-Firestore-Rules.snippet.txt
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

export const FARMER_PASTED_ORDERS_COLLECTION = 'farmerPastedOrders';
export const FARMER_PRODUCT_ALIASES_COLLECTION = 'farmerProductAliases';

const getTimestampMillis = (value) => {
  if (!value) return 0;
  if (value.toDate) return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toOrder = (snap) => ({
  id: snap.id,
  ...snap.data(),
});

const sortOrders = (orders) => [...orders].sort(
  (a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt)
);

export async function loadFarmerProducts(email) {
  if (!email) return [];
  const snapshot = await getDocs(
    query(collection(db, 'Products'), where('Owner_Email', '==', email))
  );
  return snapshot.docs.map((productDoc) => ({
    id: productDoc.id,
    ...productDoc.data(),
  }));
}

export function subscribeFarmerPastedOrders(businessId, onChange, onError) {
  if (!businessId) {
    onChange([]);
    return () => {};
  }

  const ordersQuery = query(
    collection(db, FARMER_PASTED_ORDERS_COLLECTION),
    where('businessId', '==', businessId)
  );

  return onSnapshot(
    ordersQuery,
    (snapshot) => {
      onChange(sortOrders(snapshot.docs.map(toOrder)));
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

const serializeLine = (line) => ({
  rawLine: String(line.rawLine || ''),
  productId: String(line.productId || ''),
  productName: String(line.productName || ''),
  quantity: Number(line.quantity),
  measurementType: line.measurementType || 'kg',
  matchScore: Number(line.matchScore || line.score || 0),
  packed: line.packed === true,
});

export async function createFarmerPastedOrder({
  businessId,
  orderNumber,
  buyerName,
  rawText,
  lines,
}) {
  if (!businessId) throw new Error('NOT_LOGGED_IN');
  const number = String(orderNumber || '').trim();
  const name = String(buyerName || '').trim();
  if (!number) throw new Error('ORDER_NUMBER_REQUIRED');
  if (!name) throw new Error('BUYER_NAME_REQUIRED');
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('LINES_REQUIRED');

  const serializedLines = lines.map(serializeLine);
  if (serializedLines.some((line) => !line.productId || !Number.isFinite(line.quantity))) {
    throw new Error('LINES_INCOMPLETE');
  }

  const docRef = await addDoc(collection(db, FARMER_PASTED_ORDERS_COLLECTION), {
    businessId,
    orderNumber: number,
    buyerName: name,
    status: 'open',
    rawText: String(rawText || ''),
    lines: serializedLines,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function saveFarmerPastedOrderPacking(orderId, lines, status) {
  if (!orderId) return;
  const serializedLines = (lines || []).map(serializeLine);
  const allPacked = serializedLines.length > 0 && serializedLines.every((line) => line.packed);
  const nextStatus = status === 'done' || allPacked ? 'done' : 'open';
  await updateDoc(doc(db, FARMER_PASTED_ORDERS_COLLECTION, orderId), {
    lines: serializedLines,
    status: nextStatus,
  });
}

export async function setFarmerPastedOrderStatus(orderId, status) {
  if (!orderId) return;
  const nextStatus = status === 'done' ? 'done' : 'open';
  await updateDoc(doc(db, FARMER_PASTED_ORDERS_COLLECTION, orderId), {
    status: nextStatus,
  });
}

export async function loadFarmerProductAliases(businessId) {
  if (!businessId) return {};
  const snap = await getDoc(doc(db, FARMER_PRODUCT_ALIASES_COLLECTION, businessId));
  if (!snap.exists()) return {};
  const aliases = snap.data()?.aliases;
  return aliases && typeof aliases === 'object' ? aliases : {};
}

export async function saveFarmerProductAliases(businessId, entries = []) {
  if (!businessId || !Array.isArray(entries) || entries.length === 0) return;
  const existing = await loadFarmerProductAliases(businessId);
  const aliases = { ...existing };
  entries.forEach((entry) => {
    const key = String(entry?.key || '').trim();
    if (!key || key.includes('.') || !entry?.productId) return;
    aliases[key] = {
      productId: String(entry.productId),
      productName: String(entry.productName || ''),
      updatedAt: new Date().toISOString(),
    };
  });
  await setDoc(doc(db, FARMER_PRODUCT_ALIASES_COLLECTION, businessId), { aliases }, { merge: true });
}

export async function deleteFarmerPastedOrder(orderId) {
  if (!orderId) return;
  await deleteDoc(doc(db, FARMER_PASTED_ORDERS_COLLECTION, orderId));
}
