import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const SUPPLIER_BASE_URL = 'https://www.meshek-dahan.co.il/';
const PROXY_URL = `https://api.allorigins.win/raw?url=${encodeURIComponent(SUPPLIER_BASE_URL)}`;
const SNAPSHOT_COLLECTION = 'supplierSnapshots';

const normalizeItem = (raw) => raw?.replace(/\s+/g, ' ').trim();

const parseItemsFromHtml = (htmlString) => {
  if (!htmlString) return [];

  try {
    let combined = [];
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const docNode = parser.parseFromString(htmlString, 'text/html');
      const nodes = docNode.querySelectorAll('h2[class*="StyledProductName"]');
      const names = Array.from(nodes)
        .map((n) => normalizeItem(n.textContent || ''))
        .filter(Boolean);

      // Also try anchors that lead to product details pages as a fallback
      const anchorNames = Array.from(docNode.querySelectorAll('a[href*="/product-details/"]'))
        .map((a) => normalizeItem(a.textContent || ''))
        .filter(Boolean);
      combined = [...names, ...anchorNames];
    } else {
      // Fallback regex parsing for non-browser contexts (e.g., tests)
      const regex = /StyledProductName[^>]*>([^<]+)</gi;
      let match;
      while ((match = regex.exec(htmlString)) !== null) {
        if (match[1]) combined.push(normalizeItem(match[1]));
      }
    }

    return Array.from(new Set(combined));
  } catch (err) {
    console.error('Failed to parse supplier HTML', err);
    return [];
  }
};

export const fetchMeshekDahanItems = async () => {
  const response = await fetch(PROXY_URL, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to fetch supplier page (${response.status})`);
  }
  const html = await response.text();
  return parseItemsFromHtml(html);
};

export const getPreviousSnapshot = async (businessId) => {
  if (!businessId) return { items: [], checkedAt: null };
  const snapshotRef = doc(db, SNAPSHOT_COLLECTION, businessId);
  const snap = await getDoc(snapshotRef);
  if (!snap.exists()) return { items: [], checkedAt: null };

  const data = snap.data() || {};
  return {
    items: Array.isArray(data.items) ? data.items : [],
    checkedAt: data.checkedAt || null,
  };
};

export const saveSnapshot = async (businessId, items) => {
  if (!businessId) return;
  const snapshotRef = doc(db, SNAPSHOT_COLLECTION, businessId);
  await setDoc(
    snapshotRef,
    {
      items: Array.isArray(items) ? items : [],
      checkedAt: new Date().toISOString(),
      supplier: 'meshek-dahan',
    },
    { merge: true }
  );
};

export const diffItems = (previous = [], current = []) => {
  const prevSet = new Set(previous);
  const currSet = new Set(current);

  const added = current.filter((item) => !prevSet.has(item));
  const removed = previous.filter((item) => !currSet.has(item));
  const unchanged = current.filter((item) => prevSet.has(item));

  return { added, removed, unchanged };
};

