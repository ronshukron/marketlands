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

const COMMUNITY_COLORS = [
  '#4F46E5', '#059669', '#D97706', '#DC2626', '#7C3AED',
  '#0891B2', '#BE185D', '#65A30D', '#EA580C', '#4338CA',
  '#0D9488', '#B45309', '#9333EA', '#E11D48', '#16A34A',
];

const LEGACY_NITZANIM_ALIASES = ['ניצנים ה', 'ניצנים ג'];

let cache = {
  spots: [],
  spotsData: {},
  spotsByRegion: {},
  colorByName: {},
  aliasMap: {},
  loaded: false,
};

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
  };
}

function normalizeCommunityDoc(docSnap) {
  const data = docSnap.data() || {};
  const name = data.name || docSnap.id;
  return {
    id: docSnap.id,
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
    updatedAt: data.updatedAt || '',
  };
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
  };
}

function applyCommunities(docs) {
  const communities = dedupeCommunityDocs(docs)
    .filter((c) => c.active)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name, 'he'));

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
  };
  notifyListeners();
}

function notifyListeners() {
  setMarketplaceCommunityIdentity({
    communities: cache.spots,
    aliases: cache.aliasMap,
  });
  listeners.forEach((listener) => listener(getSnapshot()));
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
  };
}

let unsubscribeFirestore = null;

export async function loadPickupSpots() {
  try {
    const snap = await getDocs(collection(db, 'communities'));
    if (snap.empty) {
      cache = buildEmptyFirestoreCache();
      notifyListeners();
      return getSnapshot();
    }
    applyCommunities(snap.docs);
    return getSnapshot();
  } catch (error) {
    console.error('Failed to load communities from Firestore:', error);
    cache = buildFromStatic();
    notifyListeners();
    return getSnapshot();
  }
}

export function subscribePickupSpots(callback) {
  listeners.add(callback);
  if (!unsubscribeFirestore) {
    unsubscribeFirestore = onSnapshot(
      collection(db, 'communities'),
      (snap) => {
        if (snap.empty) {
          cache = buildEmptyFirestoreCache();
          notifyListeners();
          return;
        }
        applyCommunities(snap.docs);
      },
      (error) => {
        console.error('Communities subscription error:', error);
        cache = buildFromStatic();
        notifyListeners();
      }
    );
  }
  if (!cache.loaded) {
    loadPickupSpots().then(() => callback(getSnapshot()));
  } else {
    callback(getSnapshot());
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
  if (!cache.loaded) {
    return {
      pickupSpots: [],
      pickupSpotsData: {},
      pickupSpotsByRegion: {},
      colorByName: {},
      loaded: false,
    };
  }
  return getSnapshot();
}

export function resolveCommunityName(raw) {
  if (!raw) return raw;
  if (!cache.loaded) cache = buildFromStatic();
  setMarketplaceCommunityIdentity({
    communities: cache.spots,
    aliases: cache.aliasMap,
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
  if (!cache.loaded) cache = buildFromStatic();
  const normalizedCode = String(code).trim().toLowerCase();
  const matches = cache.spots.filter((name) => getCommunityCode(name) === normalizedCode);
  return matches.length === 1 ? matches[0] : '';
}

export function getCommunityColor(name) {
  const resolved = resolveCommunityName(name);
  if (!cache.loaded) cache = buildFromStatic();
  return cache.colorByName[resolved] || getDeterministicCommunityColor(resolved);
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
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  await deleteDuplicateCommunityDocs(name);

  const { addNewCommunityToPaymentConfig, readPaymentConfigSnapshot } = await import('./paymentConfigService');
  const paymentConfig = await readPaymentConfigSnapshot();
  const knownCommunities = paymentConfig.knownCommunities;
  if (isNew || (Array.isArray(knownCommunities) && !knownCommunities.includes(name))) {
    await addNewCommunityToPaymentConfig(name);
  }
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

// Populated from Firestore via subscribePickupSpots / loadPickupSpots
cache = { ...buildEmptyFirestoreCache(), loaded: false };
