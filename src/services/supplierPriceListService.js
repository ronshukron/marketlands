import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { isIndependentBusinessAccount } from '../utils/accountRoles';
import {
  compareSupplierReports,
} from '../utils/supplierPriceMatching';

const IMPORTS_COLLECTION = 'supplierPriceImports';
const MAPPINGS_COLLECTION = 'supplierPriceMappings';
const WRITE_CHUNK_SIZE = 350;

export const parseSupplierPdf = async (file) => {
  if (!file || (file.type && file.type !== 'application/pdf')) {
    throw new Error('יש לבחור קובץ PDF תקין');
  }
  const { parseSupplierPdfFile } = await import('./supplierPdfParser');
  return parseSupplierPdfFile(file);
};

export const hashSupplierFile = async (file) => {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }
  const digest = await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export const loadSupplierImportContext = async () => {
  const [businessSnapshot, mappingSnapshot] = await Promise.all([
    getDocs(collection(db, 'businesses')),
    getDocs(collection(db, MAPPINGS_COLLECTION)),
  ]);

  const businesses = businessSnapshot.docs
    .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
    .filter((business) => !isIndependentBusinessAccount(business))
    .sort((a, b) => (
      a.businessName || a.name || a.email || a.id
    ).localeCompare(b.businessName || b.name || b.email || b.id, 'he'));

  const productEntries = await Promise.all(
    businesses.map(async (business) => {
      const productSnapshot = await getDocs(query(
        collection(db, 'Products'),
        where('Owner_ID', '==', business.id)
      ));
      return [
        business.id,
        productSnapshot.docs
          .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he')),
      ];
    })
  );

  return {
    businesses,
    productsByBusiness: Object.fromEntries(productEntries),
    mappings: mappingSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() })),
  };
};

export const loadLatestSupplierImport = async ({ includeReviews = false } = {}) => {
  const snapshot = await getDocs(query(
    collection(db, IMPORTS_COLLECTION),
    orderBy('reportDate', 'desc'),
    limit(1)
  ));
  if (snapshot.empty) return null;

  const importSnapshot = snapshot.docs[0];
  const [itemSnapshot, reviewSnapshot] = await Promise.all([
    getDocs(collection(importSnapshot.ref, 'items')),
    includeReviews
      ? getDocs(collection(importSnapshot.ref, 'reviews'))
      : Promise.resolve({ docs: [] }),
  ]);
  return {
    id: importSnapshot.id,
    ...importSnapshot.data(),
    rows: itemSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    reviews: reviewSnapshot.docs.map((review) => ({ id: review.id, ...review.data() })),
  };
};

export const prepareSupplierReportComparison = async (rows) => {
  const previousImport = await loadLatestSupplierImport();
  const comparison = compareSupplierReports(rows, previousImport?.rows || []);
  return { previousImport, ...comparison };
};

const commitOperations = async (operations) => {
  for (let index = 0; index < operations.length; index += WRITE_CHUNK_SIZE) {
    const batch = writeBatch(db);
    operations.slice(index, index + WRITE_CHUNK_SIZE).forEach((operation) => {
      if (operation.type === 'update') batch.update(operation.ref, operation.data);
      else batch.set(operation.ref, operation.data, operation.options);
    });
    await batch.commit();
  }
};

const mappingDocumentId = (businessId, supplierCode) => (
  `${businessId}__${supplierCode}`.replaceAll('/', '_')
);

export const saveSupplierPriceImport = async ({
  file,
  fileHash,
  reportDate,
  rows,
  removedRows = [],
  matches,
  currentUser,
  previousImport,
  applyPriceUpdates = false,
}) => {
  const importRef = await addDoc(collection(db, IMPORTS_COLLECTION), {
    reportDate,
    sourceFileName: file.name,
    sourceFileHash: fileHash,
    sourceFileSize: file.size,
    previousImportId: previousImport?.id || null,
    isBaseline: !previousImport,
    status: 'processing',
    rowCount: rows.length,
    removedCount: removedRows.length,
    createdBy: currentUser.uid,
    createdByEmail: currentUser.email || '',
    createdAt: serverTimestamp(),
  });

  try {
    const itemOperations = rows.map((row, index) => ({
      type: 'set',
      ref: doc(importRef, 'items', `${String(index).padStart(4, '0')}_${row.supplierCode}`),
      data: {
        supplierCode: row.supplierCode,
        name: row.name,
        unit: row.unit,
        unitLabel: row.unitLabel || '',
        cost: Number(row.cost),
        notes: row.notes || '',
        page: row.page || null,
        previousCost: row.previousCost ?? null,
        costDelta: row.costDelta ?? null,
        changePercent: row.changePercent ?? null,
        changeType: row.changeType || 'new',
      },
    }));
    await commitOperations(itemOperations);

    const selectedMatches = matches.filter((match) => match.enabled && match.productId);
    const reviewOperations = [];
    let priceUpdateCount = 0;

    selectedMatches.forEach((match, index) => {
      const shouldUpdatePrice = Boolean(
        applyPriceUpdates
        && previousImport
        && match.calculation?.valid
        && Number.isFinite(Number(match.finalPrice))
        && Number(match.finalPrice) > 0
      );
      if (shouldUpdatePrice) {
        reviewOperations.push({
          type: 'update',
          ref: doc(db, 'Products', match.productId),
          data: { price: Number(match.finalPrice) },
        });
        priceUpdateCount += 1;
      }

      reviewOperations.push(
        {
          type: 'set',
          ref: doc(db, MAPPINGS_COLLECTION, mappingDocumentId(match.businessId, match.supplierCode)),
          data: {
            supplierCode: match.supplierCode,
            supplierName: match.name,
            businessId: match.businessId,
            businessName: match.businessName,
            productId: match.productId,
            productName: match.product?.name || '',
            latestCost: Number(match.cost),
            lastImportId: importRef.id,
            updatedBy: currentUser.uid,
            updatedAt: serverTimestamp(),
          },
          options: { merge: true },
        },
        {
          type: 'set',
          ref: doc(importRef, 'reviews', `${String(index).padStart(4, '0')}_${mappingDocumentId(match.businessId, match.supplierCode)}`),
          data: {
            supplierCode: match.supplierCode,
            businessId: match.businessId,
            businessName: match.businessName,
            productId: match.productId,
            productName: match.product?.name || '',
            confidence: match.confidence,
            score: match.score,
            previousPrice: Number(match.product?.price || 0),
            previousCost: match.previousCost ?? null,
            newCost: Number(match.cost),
            suggestedPrice: match.calculation?.suggestedPrice ?? null,
            appliedPrice: shouldUpdatePrice ? Number(match.finalPrice) : null,
            baselineOnly: !previousImport,
          },
        }
      );
    });
    await commitOperations(reviewOperations);

    await updateDoc(importRef, {
      status: 'completed',
      matchedCount: selectedMatches.length,
      priceUpdateCount,
      completedAt: serverTimestamp(),
    });

    return {
      importId: importRef.id,
      baseline: !previousImport,
      matchedCount: selectedMatches.length,
      priceUpdateCount,
    };
  } catch (error) {
    await updateDoc(importRef, {
      status: 'failed',
      errorMessage: error?.message || 'Unknown error',
      failedAt: serverTimestamp(),
    }).catch(() => {});
    throw error;
  }
};

export const updateParsedSupplierRow = (rows, supplierCode, updates) => rows.map((row) => (
  row.supplierCode === supplierCode
    ? { ...row, ...updates, cost: Number(updates.cost ?? row.cost) }
    : row
));

export const createMappingPreview = async (rows) => {
  const [{ previousImport, compared, removed }, context] = await Promise.all([
    prepareSupplierReportComparison(rows),
    loadSupplierImportContext(),
  ]);
  return { previousImport, rows: compared, removed, ...context };
};
