import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { pickupSpotsData as staticPickupSpotsData, pickupSpotsByRegion as staticPickupSpotsByRegion } from '../data/pickupSpots';
import {
  resolveMarketplaceCommunityName,
  setMarketplaceCommunityIdentity,
} from '../utils/marketplaceCommunityIdentity';
import { compareCommunitiesForDelivery } from '../utils/communityDeliveryOrder';

export { compareCommunitiesForDelivery } from '../utils/communityDeliveryOrder';

const COMMUNITY_COLORS = [
  '#4F46E5', '#059669', '#D97706', '#DC2626', '#7C3AED',
  '#0891B2', '#BE185D', '#65A30D', '#EA580C', '#4338CA',
  '#0D9488', '#B45309', '#9333EA', '#E11D48', '#16A34A',
];

const LEGACY_NITZANIM_ALIASES = ['ניצנים ה', 'ניצנים ג'];
const CATALOG_DOC_PATH = 'settings/communitiesCatalog';
const CATALOG_STORAGE_KEY = 'bb:communitiesCatalog:v1';
const CATALOG_FETCH_TIMEOUT_MS = 8000;

let cache = {
  spots: [],
  spotsData: {},
  spotsByRegion: {},
  colorByName: {},
  aliasMap: {},
  loaded: false,
  source: null,
};
let staticCache = null;
let catalogLoadPromise = null;

const listeners = new Set();

function hashString(value = '') {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getDeterministicCommunityColor(name) {
  if (!name) return COMMUNITY_COLORS[0];
  return COMMUNITY_COLORS[hashString(name) % COMMUNITY_COLORS.length];
}

function buildFromStatic() {
  const spotsData = { ...staticPickupSpotsData };
  const spots = Object.keys(spotsData);
  const aliasMap = {};
  LEGACY_NITZANIM_ALIASES.forEach((alias) => {
    aliasMap[alias] = 'ניצנים';
  });
  const colorByName = {};
  spots.forEach((name, index) => {
    colorByName[name] = COMMUNITY_COLORS[index % COMMUNITY_COLORS.length];
  });
  return {
    spots,
    spotsData,
    spotsByRegion: { ...staticPickupSpotsByRegion },
    colorByName,
    aliasMap,
    loaded: true,
    source: 'static',
  };
}

function getStaticSnapshot() {
  if (!staticCache) staticCache = buildFromStatic();
  return staticCache;
}

function withTimeout(promise, ms = CATALOG_FETCH_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('communities catalog timeout')), ms);
    }),
  ]);
}

function persistCatalogToStorage(snapshot) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify({
      savedAt: Date.now(),
      spots: snapshot.pickupSpots,
      spotsData: snapshot.pickupSpotsData,
      spotsByRegion: snapshot.pickupSpotsByRegion,
      colorByName: snapshot.colorByName,
      aliasMap: snapshot.aliasMap,
    }));
  } catch (error) {
    console.warn('Failed to cache communities locally:', error);
  }
}

function hydrateFromLocalStorage() {
  if (cache.loaded || typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(CATALOG_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.spots) || parsed.spots.length === 0) return false;
    cache = {
      spots: parsed.spots,
      spotsData: parsed.spotsData || {},
      spotsByRegion: parsed.spotsByRegion || {},
      colorByName: parsed.colorByName || {},
      aliasMap: parsed.aliasMap || {},
      loaded: true,
      source: 'local',
    };
    notifyListeners();
    return true;
  } catch (error) {
    console.warn('Failed to read cached communities:', error);
    return false;
  }
}

function normalizeCommunityRecord(input) {
  const isDocSnap = input && typeof input.data === 'function';
  const data = isDocSnap ? (input.data() || {}) : (input || {});
  const id = isDocSnap ? input.id : (data.id || data.name || '');
  const name = data.name || id;
  return {
    id,
    name,
    region: data.region || 'אחר',
    options: Array.isArray(data.options) ? data.options : ['pickup'],
    deliveryFee: Number(data.deliveryFee) || 0,
    color: data.color || getDeterministicCommunityColor(name),
    sortOrder: Number(data.sortOrder) || 0,
    active: data.active !== false,
    aliases: Array.isArray(data.aliases) ? data.aliases : [],
    whatsappGroupLink: data.whatsappGroupLink || '',
    storeLink: data.storeLink || '',
    broadcastDeliveryNote: data.broadcastDeliveryNote || '',
    deliveryGroup: String(data.deliveryGroup || '').trim(),
    updatedAt: data.updatedAt || '',
  };
}

function normalizeCommunityDoc(docSnap) {
  return normalizeCommunityRecord(docSnap);
}

function shouldPreferCommunityDoc(candidate, existing) {
  const candidateIdMatch = candidate.id === candidate.name;
  const existingIdMatch = existing.id === existing.name;
  if (candidateIdMatch && !existingIdMatch) return true;
  if (existingIdMatch && !candidateIdMatch) return false;

  const candidateOptions = Array.isArray(candidate.options) ? candidate.options.length : 0;
  const existingOptions = Array.isArray(existing.options) ? existing.options.length : 0;
  if (candidateOptions !== existingOptions) return candidateOptions > existingOptions;

  return String(candidate.updatedAt || '') > String(existing.updatedAt || '');
}

function dedupeCommunityDocs(docs) {
  const byName = new Map();
  docs.forEach((docSnap) => {
    const community = normalizeCommunityDoc(docSnap);
    const existing = byName.get(community.name);
    if (!existing || shouldPreferCommunityDoc(community, existing)) {
      byName.set(community.name, community);
    }
  });
  return [...byName.values()];
}

function buildEmptyFirestoreCache() {
  return {
    spots: [],
    spotsData: {},
    spotsByRegion: {},
    colorByName: {},
    aliasMap: {},
    loaded: true,
    source: 'empty',
  };
}

function applyCommunityRecords(records, source = 'catalog') {
  const communities = dedupeCommunityDocs(
    (Array.isArray(records) ? records : []).map((record) => ({
      id: record.id || record.name,
      data: () => record,
    })),
  ).filter((c) => c.active);
  communities.sort(compareCommunitiesForDelivery(communities));

  if (communities.length === 0) {
    cache = buildEmptyFirestoreCache();
    notifyListeners();
    return;
  }

  const spotsData = {};
  const spotsByRegion = {};
  const colorByName = {};
  const aliasMap = {};

  communities.forEach((community) => {
    spotsData[community.name] = {
      name: community.name,
      options: community.options,
      deliveryFee: community.deliveryFee,
      region: community.region,
      color: community.color,
      sortOrder: community.sortOrder,
      deliveryGroup: community.deliveryGroup || '',
      active: community.active !== false,
      aliases: community.aliases,
      whatsappGroupLink: community.whatsappGroupLink,
      storeLink: community.storeLink,
      broadcastDeliveryNote: community.broadcastDeliveryNote,
    };
    colorByName[community.name] = community.color;
    if (!spotsByRegion[community.region]) spotsByRegion[community.region] = [];
    spotsByRegion[community.region].push(community.name);
    community.aliases.forEach((alias) => {
      aliasMap[alias] = community.name;
    });
  });

  cache = {
    spots: communities.map((c) => c.name),
    spotsData,
    spotsByRegion,
    colorByName,
    aliasMap,
    loaded: true,
    source,
  };
  notifyListeners();
}

function applyCommunities(docs, source = 'collection') {
  applyCommunityRecords(
    (Array.isArray(docs) ? docs : []).map((docSnap) => normalizeCommunityDoc(docSnap)),
    source,
  );
}

function notifyListeners() {
  setMarketplaceCommunityIdentity({
    communities: cache.spots,
    aliases: cache.aliasMap,
  });
  const snapshot = getSnapshot();
  if (cache.loaded && cache.spots.length > 0 && cache.source !== 'static') {
    persistCatalogToStorage(snapshot);
  }
  listeners.forEach((listener) => listener(snapshot));
}

function getSnapshot() {
  setMarketplaceCommunityIdentity({
    communities: cache.spots,
    aliases: cache.aliasMap,
  });
  return {
    pickupSpots: [...cache.spots],
    pickupSpotsData: { ...cache.spotsData },
    pickupSpotsByRegion: { ...cache.spotsByRegion },
    colorByName: { ...cache.colorByName },
    aliasMap: { ...cache.aliasMap },
    loaded: cache.loaded,
    source: cache.source,
  };
}

let unsubscribeFirestore = null;

async function loadCommunitiesFromCatalog() {
  const snap = await withTimeout(getDoc(doc(db, CATALOG_DOC_PATH)));
  const records = snap.exists() ? snap.data()?.communities : null;
  if (!Array.isArray(records) || records.length === 0) return false;
  applyCommunityRecords(records, 'catalog');
  return true;
}

async function loadCommunitiesFromCollection() {
  const snap = await withTimeout(getDocs(collection(db, 'communities')));
  if (snap.empty) {
    cache = buildEmptyFirestoreCache();
    notifyListeners();
    return true;
  }
  applyCommunities(snap.docs, 'collection');
  return true;
}

function getStaticPreviewSnapshot() {
  const staticSnapshot = getStaticSnapshot();
  setMarketplaceCommunityIdentity({
    communities: staticSnapshot.spots,
    aliases: staticSnapshot.aliasMap,
  });
  return {
    pickupSpots: [...staticSnapshot.spots],
    pickupSpotsData: { ...staticSnapshot.spotsData },
    pickupSpotsByRegion: { ...staticSnapshot.spotsByRegion },
    colorByName: { ...staticSnapshot.colorByName },
    aliasMap: { ...staticSnapshot.aliasMap },
    loaded: false,
    source: 'static',
  };
}

export async function loadPickupSpots(options = {}) {
  const force = options.force === true;
  const allowCollectionFallback = options.allowCollectionFallback === true;
  if (cache.loaded && cache.source === 'catalog' && !force) {
    return getSnapshot();
  }
  if (catalogLoadPromise && !force) return catalogLoadPromise;

  catalogLoadPromise = (async () => {
    try {
      if (await loadCommunitiesFromCatalog()) return getSnapshot();
    } catch (error) {
      console.warn('Failed to load slim communities catalog:', error?.message || error);
    }

    if (cache.loaded && cache.spots.length > 0 && cache.source !== 'static') {
      return getSnapshot();
    }

    // Public store must not download the communities collection. Those docs can
    // include huge membership arrays and freeze first load. Admin pages may opt in.
    if (allowCollectionFallback) {
      try {
        await loadCommunitiesFromCollection();
        return getSnapshot();
      } catch (error) {
        console.error('Failed to load communities from Firestore:', error);
      }
    }

    return cache.loaded ? getSnapshot() : getStaticPreviewSnapshot();
  })().finally(() => {
    catalogLoadPromise = null;
  });

  return catalogLoadPromise;
}

export function subscribePickupSpots(callback) {
  listeners.add(callback);
  callback(getPickupSpotsSync());
  if (!unsubscribeFirestore) {
    unsubscribeFirestore = onSnapshot(
      doc(db, CATALOG_DOC_PATH),
      (snap) => {
        const records = snap.exists() ? snap.data()?.communities : null;
        if (Array.isArray(records) && records.length > 0) {
          applyCommunityRecords(records, 'catalog');
          return;
        }
        console.warn('Communities catalog missing; keeping local/static list for the store');
      },
      (error) => {
        console.error('Communities catalog subscription error:', error);
      }
    );
  }
  if (!cache.loaded || cache.source !== 'catalog') {
    loadPickupSpots().then((snapshot) => callback(snapshot));
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && unsubscribeFirestore) {
      unsubscribeFirestore();
      unsubscribeFirestore = null;
    }
  };
}

export function getPickupSpotsSync() {
  hydrateFromLocalStorage();
  if (!cache.loaded) return getStaticPreviewSnapshot();
  return getSnapshot();
}

export function invalidatePickupSpotsCache() {
  cache = { ...buildEmptyFirestoreCache(), loaded: false, source: null };
  catalogLoadPromise = null;
  if (unsubscribeFirestore) {
    unsubscribeFirestore();
    unsubscribeFirestore = null;
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(CATALOG_STORAGE_KEY);
    } catch {}
  }
}

export function resolveCommunityName(raw) {
  if (!raw) return raw;
  hydrateFromLocalStorage();
  const source = cache.loaded ? cache : getStaticSnapshot();
  setMarketplaceCommunityIdentity({
    communities: source.spots,
    aliases: source.aliasMap,
  });
  return resolveMarketplaceCommunityName(raw);
}

export function getCommunityCode(name) {
  const resolved = resolveCommunityName(name);
  if (!resolved) return '';
  return hashString(resolved).toString(36).padStart(6, '0');
}

export function resolveCommunityByCode(code) {
  if (!code) return '';
  hydrateFromLocalStorage();
  const source = cache.loaded ? cache : getStaticSnapshot();
  const normalizedCode = String(code).trim().toLowerCase();
  const matches = source.spots.filter((name) => getCommunityCode(name) === normalizedCode);
  return matches.length === 1 ? matches[0] : '';
}

export function getCommunityColor(name) {
  const resolved = resolveCommunityName(name);
  const source = cache.loaded ? cache : getStaticSnapshot();
  return source.colorByName[resolved] || getDeterministicCommunityColor(resolved);
}

export async function seedCommunitiesFromStatic() {
  const staticData = buildFromStatic();
  const batch = writeBatch(db);
  let sortOrder = 0;
  Object.entries(staticData.spotsData).forEach(([name, data]) => {
    const regionEntry = Object.entries(staticData.spotsByRegion).find(([, list]) => list.includes(name));
    const region = regionEntry ? regionEntry[0] : 'אחר';
    const aliases = name === 'ניצנים' ? [...LEGACY_NITZANIM_ALIASES] : [];
    const ref = doc(db, 'communities', name);
    batch.set(ref, {
      name,
      region,
      options: data.options || ['pickup'],
      deliveryFee: data.deliveryFee || 0,
      color: staticData.colorByName[name] || getDeterministicCommunityColor(name),
      sortOrder: sortOrder++,
      active: true,
      aliases,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  });
  await batch.commit();
}

function currentCommunityRecords() {
  return cache.spots.map((name) => ({
    id: name,
    ...(cache.spotsData[name] || { name }),
  }));
}

function mergeCommunityRecord(record) {
  const next = currentCommunityRecords().filter((item) => item.name !== record.name);
  next.push(record);
  applyCommunityRecords(next, cache.source || 'local');
}

function removeCommunityRecord(name) {
  applyCommunityRecords(
    currentCommunityRecords().filter((item) => item.name !== name),
    cache.source || 'local',
  );
}

async function deleteDuplicateCommunityDocs(name) {
  const byNameSnap = await getDocs(query(
    collection(db, 'communities'),
    where('name', '==', name)
  ));
  const duplicates = byNameSnap.docs.filter((docSnap) => docSnap.id !== name);
  if (duplicates.length === 0) return 0;

  const batch = writeBatch(db);
  duplicates.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
  return duplicates.length;
}

export async function cleanupDuplicateCommunities() {
  const snap = await getDocs(collection(db, 'communities'));
  if (snap.empty) return 0;

  const canonicalByName = new Map();
  snap.docs.forEach((docSnap) => {
    const community = normalizeCommunityDoc(docSnap);
    const existing = canonicalByName.get(community.name);
    if (!existing || shouldPreferCommunityDoc(community, existing)) {
      canonicalByName.set(community.name, community);
    }
  });

  const batch = writeBatch(db);
  let count = 0;
  snap.docs.forEach((docSnap) => {
    const community = normalizeCommunityDoc(docSnap);
    const canonical = canonicalByName.get(community.name);
    if (!canonical || canonical.id === docSnap.id) return;
    batch.delete(docSnap.ref);
    count += 1;
  });

  if (count > 0) await batch.commit();
  return count;
}

export async function saveCommunity(community) {
  const name = String(community.name || '').trim();
  if (!name) throw new Error('שם יישוב חובה');
  const ref = doc(db, 'communities', name);
  const existingSnap = await getDoc(ref);
  const isNew = !existingSnap.exists();
  await setDoc(ref, {
    name,
    region: community.region || 'אחר',
    options: community.options || ['pickup'],
    deliveryFee: Number(community.deliveryFee) || 0,
    color: community.color || getDeterministicCommunityColor(name),
    sortOrder: Number(community.sortOrder) || 0,
    active: community.active !== false,
    aliases: Array.isArray(community.aliases) ? community.aliases : [],
    whatsappGroupLink: String(community.whatsappGroupLink || '').trim(),
    storeLink: String(community.storeLink || '').trim(),
    broadcastDeliveryNote: String(community.broadcastDeliveryNote || '').trim(),
    deliveryGroup: String(community.deliveryGroup || '').trim(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  await deleteDuplicateCommunityDocs(name);

  const { addNewCommunityToPaymentConfig, readPaymentConfigSnapshot } = await import('./paymentConfigService');
  const paymentConfig = await readPaymentConfigSnapshot();
  const knownCommunities = paymentConfig.knownCommunities;
  if (isNew || (Array.isArray(knownCommunities) && !knownCommunities.includes(name))) {
    await addNewCommunityToPaymentConfig(name);
  }
  mergeCommunityRecord({
    id: name,
    name,
    region: community.region || 'אחר',
    options: community.options || ['pickup'],
    deliveryFee: Number(community.deliveryFee) || 0,
    color: community.color || getDeterministicCommunityColor(name),
    sortOrder: Number(community.sortOrder) || 0,
    active: community.active !== false,
    aliases: Array.isArray(community.aliases) ? community.aliases : [],
    whatsappGroupLink: String(community.whatsappGroupLink || '').trim(),
    storeLink: String(community.storeLink || '').trim(),
    broadcastDeliveryNote: String(community.broadcastDeliveryNote || '').trim(),
    deliveryGroup: String(community.deliveryGroup || '').trim(),
    updatedAt: new Date().toISOString(),
  });
}

async function collectCommunityDeleteRefs(name) {
  const refs = new Map();
  const namesToTry = new Set([String(name || '').trim()]);
  if (namesToTry.has('ניצנים')) {
    LEGACY_NITZANIM_ALIASES.forEach((alias) => namesToTry.add(alias));
  }

  await Promise.all([...namesToTry].map(async (communityName) => {
    if (!communityName) return;

    const directRef = doc(db, 'communities', communityName);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) {
      refs.set(directRef.path, directRef);
    }

    const byNameSnap = await getDocs(query(
      collection(db, 'communities'),
      where('name', '==', communityName)
    ));
    byNameSnap.docs.forEach((docSnap) => {
      refs.set(docSnap.ref.path, docSnap.ref);
    });
  }));

  return refs;
}

export async function saveCommunityOrdering(entries) {
  const list = (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      name: String(entry?.name || '').trim(),
      sortOrder: Number(entry?.sortOrder) || 0,
      deliveryGroup: String(entry?.deliveryGroup || '').trim(),
    }))
    .filter((entry) => entry.name);
  if (list.length === 0) return;

  const updatedAt = new Date().toISOString();
  const chunkSize = 400;
  for (let offset = 0; offset < list.length; offset += chunkSize) {
    const batch = writeBatch(db);
    list.slice(offset, offset + chunkSize).forEach((entry) => {
      batch.set(doc(db, 'communities', entry.name), {
        sortOrder: entry.sortOrder,
        deliveryGroup: entry.deliveryGroup,
        updatedAt,
      }, { merge: true });
    });
    await batch.commit();
  }
}

export async function deleteCommunity(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('שם יישוב חובה');

  const refsToDelete = await collectCommunityDeleteRefs(trimmed);
  if (refsToDelete.size === 0) {
    throw new Error('היישוב לא נמצא ב-Firestore (ייתכן שנמחק כבר או שנשמר תחת מזהה אחר)');
  }

  const batch = writeBatch(db);
  refsToDelete.forEach((ref) => batch.delete(ref));
  await batch.commit();

  const { removeCommunityFromPaymentConfig } = await import('./paymentConfigService');
  await removeCommunityFromPaymentConfig(trimmed);
  removeCommunityRecord(trimmed);
}

export async function migrateNitzanimNames() {
  const aliasTargets = {
    'ניצנים ה': 'ניצנים',
    'ניצנים ג': 'ניצנים',
  };

  const collectionsToScan = [
    { name: 'customerOrders', fields: ['customerDetails.pickupSpot', 'fulfillment.community', 'community'] },
    { name: 'customerOrdersDelayed', fields: ['customerDetails.pickupSpot', 'fulfillment.community', 'community'] },
    { name: 'Orders', fields: ['pickupSpots'] },
  ];

  let updated = 0;

  for (const { name: colName, fields } of collectionsToScan) {
    const snap = await getDocs(collection(db, colName));
    const batch = writeBatch(db);
    let batchCount = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const updates = {};

      fields.forEach((fieldPath) => {
        if (fieldPath === 'pickupSpots' && Array.isArray(data.pickupSpots)) {
          const next = data.pickupSpots.map((spot) => aliasTargets[spot] || spot);
          if (JSON.stringify(next) !== JSON.stringify(data.pickupSpots)) {
            updates.pickupSpots = [...new Set(next)];
          }
          return;
        }
        const parts = fieldPath.split('.');
        const top = parts[0];
        const nested = parts[1];
        const value = nested ? data[top]?.[nested] : data[top];
        if (aliasTargets[value]) {
          if (nested) {
            updates[top] = { ...(data[top] || {}), [nested]: aliasTargets[value] };
          } else {
            updates[top] = aliasTargets[value];
          }
        }
      });

      if (Object.keys(updates).length > 0) {
        batch.update(docSnap.ref, updates);
        batchCount += 1;
        updated += 1;
      }
    }

    if (batchCount > 0) await batch.commit();
  }

  const scheduleSnap = await getDocs(collection(db, 'deliverySchedules'));
  for (const oldName of Object.keys(aliasTargets)) {
    const oldDoc = scheduleSnap.docs.find((d) => d.id === oldName);
    if (oldDoc) {
      await setDoc(doc(db, 'deliverySchedules', 'ניצנים'), {
        ...oldDoc.data(),
        communityName: 'ניצנים',
        migratedFrom: oldName,
      }, { merge: true });
      await deleteDoc(oldDoc.ref);
      updated += 1;
    }
  }

  return updated;
}

// Populated from Firestore catalog via subscribePickupSpots / loadPickupSpots
cache = { ...buildEmptyFirestoreCache(), loaded: false, source: null };
hydrateFromLocalStorage();
