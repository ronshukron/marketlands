import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { MARKETPLACE_PRODUCTS_COLLECTION } from '../constants/marketplaceProducts';

const PRODUCT_QUERY_CHUNK_SIZE = 10;

export const getMarketplaceProductApprovalStatus = (product = {}) => {
  const hasVerified = Object.prototype.hasOwnProperty.call(product, 'verified');
  const hasRejected = Object.prototype.hasOwnProperty.call(product, 'rejected');

  if (hasRejected && product.rejected === true) return 'rejected';
  if (hasVerified && product.verified === true) return 'verified';
  if ((hasVerified && product.verified === false) || (hasRejected && product.rejected === false)) {
    return 'pending';
  }
  return 'verified';
};

export const isMarketplaceProductApproved = (product) =>
  getMarketplaceProductApprovalStatus(product) === 'verified';

export const isMarketplaceProductInStoreCatalog = (product = {}) =>
  isMarketplaceProductApproved(product) && product.showInStore !== false;

export const getStoreCatalogProductsForBusiness = async (businessId) => {
  const products = await getApprovedMarketplaceProductsForBusiness(businessId);
  return products.filter((product) => product.showInStore !== false);
};

const mapDoc = (docSnap) => ({
  id: docSnap.id,
  ...docSnap.data(),
});

export const getMarketplaceProductsForBusiness = async (businessId) => {
  if (!businessId) return [];

  const productsQuery = query(
    collection(db, MARKETPLACE_PRODUCTS_COLLECTION),
    where('businessId', '==', businessId)
  );
  const snap = await getDocs(productsQuery);

  return snap.docs.map(mapDoc).sort((a, b) => {
    const aTime = a.createdAt?.toDate?.()?.getTime?.() || 0;
    const bTime = b.createdAt?.toDate?.()?.getTime?.() || 0;
    return bTime - aTime;
  });
};

export const getApprovedMarketplaceProductsForBusiness = async (businessId) => {
  const products = await getMarketplaceProductsForBusiness(businessId);
  return products
    .filter(isMarketplaceProductApproved)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he'));
};

export const getMarketplaceProductsByIds = async (productIds = []) => {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  const products = [];

  for (let i = 0; i < uniqueIds.length; i += PRODUCT_QUERY_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + PRODUCT_QUERY_CHUNK_SIZE);
    const productsQuery = query(
      collection(db, MARKETPLACE_PRODUCTS_COLLECTION),
      where(documentId(), 'in', chunk)
    );
    const snap = await getDocs(productsQuery);
    products.push(...snap.docs.map(mapDoc));
  }

  const orderMap = new Map(uniqueIds.map((id, index) => [id, index]));
  return products.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
};

export const getMarketplaceProduct = async (productId) => {
  if (!productId) return null;
  const snap = await getDoc(doc(db, MARKETPLACE_PRODUCTS_COLLECTION, productId));
  return snap.exists() ? mapDoc(snap) : null;
};

export const createMarketplaceProduct = async ({ businessId, ownerEmail, productData }) => {
  if (!businessId) throw new Error('Missing businessId');

  const payload = {
    businessId,
    ownerEmail: ownerEmail || '',
    name: productData.name || '',
    description: productData.description || '',
    price: Number(productData.price) || 0,
    category: productData.category || 'אחר',
    images: Array.isArray(productData.images) ? productData.images : [],
    options: Array.isArray(productData.options) && productData.options.length > 0
      ? productData.options
      : ['ללא אופציות'],
    stockAmount: Number(productData.stockAmount) || 0,
    showInStore: productData.showInStore !== false,
    measurementType: productData.measurementType || 'unit',
    unitSize: Number(productData.unitSize) || 1,
    verified: false,
    rejected: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const created = await addDoc(collection(db, MARKETPLACE_PRODUCTS_COLLECTION), payload);
  return { id: created.id, ...payload };
};

export const updateMarketplaceProduct = async (productId, productData) => {
  if (!productId) throw new Error('Missing productId');

  await updateDoc(doc(db, MARKETPLACE_PRODUCTS_COLLECTION, productId), {
    name: productData.name,
    description: productData.description,
    price: Number(productData.price) || 0,
    category: productData.category || 'אחר',
    images: Array.isArray(productData.images) ? productData.images : [],
    options: Array.isArray(productData.options) ? productData.options : [],
    stockAmount: Number(productData.stockAmount) || 0,
    showInStore: productData.showInStore !== false,
    measurementType: productData.measurementType || 'unit',
    unitSize: Number(productData.unitSize) || 1,
    updatedAt: serverTimestamp(),
  });
};

export const setMarketplaceProductShowInStore = async (productId, showInStore) => {
  if (!productId) throw new Error('Missing productId');
  await updateDoc(doc(db, MARKETPLACE_PRODUCTS_COLLECTION, productId), {
    showInStore: Boolean(showInStore),
    updatedAt: serverTimestamp(),
  });
};

export const deleteMarketplaceProduct = async (productId) => {
  if (!productId) return;
  await deleteDoc(doc(db, MARKETPLACE_PRODUCTS_COLLECTION, productId));
};

export const getPendingMarketplaceProducts = async () => {
  const snap = await getDocs(
    query(collection(db, MARKETPLACE_PRODUCTS_COLLECTION), where('verified', '==', false))
  );
  return snap.docs
    .map(mapDoc)
    .filter((product) => product.rejected !== true);
};

export const approveMarketplaceProduct = async (productId) => {
  await setDoc(
    doc(db, MARKETPLACE_PRODUCTS_COLLECTION, productId),
    { verified: true, rejected: false, updatedAt: serverTimestamp() },
    { merge: true }
  );
};

export const rejectMarketplaceProduct = async (productId, reason = 'נדחה על ידי מנהל') => {
  await setDoc(
    doc(db, MARKETPLACE_PRODUCTS_COLLECTION, productId),
    {
      verified: false,
      rejected: true,
      rejectionReason: reason,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};
