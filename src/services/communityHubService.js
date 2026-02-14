import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const HUB_CONFIG_PATH = 'settings/communityHubConfig';

/**
 * Default widget configuration – used when no Firestore doc exists yet.
 * Each entry: { id, enabled, order }
 */
const DEFAULT_WIDGETS = [
  { id: 'communityDiscount', enabled: true, order: 0 },
  { id: 'communityStats', enabled: true, order: 1 },
  { id: 'popularItems', enabled: true, order: 2 },
  { id: 'share', enabled: true, order: 3 },
  { id: 'recipes', enabled: true, order: 4 },
];

/**
 * Fetch hub widget config (global).
 * Returns { widgets: [...], communityOverrides: { ... } }
 */
export const getCommunityHubConfig = async () => {
  try {
    const ref = doc(db, HUB_CONFIG_PATH);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data();
    }
    return { widgets: DEFAULT_WIDGETS, communityOverrides: {} };
  } catch (error) {
    console.error('Error fetching community hub config:', error);
    return { widgets: DEFAULT_WIDGETS, communityOverrides: {} };
  }
};

/**
 * Get the resolved widget list for a specific community.
 * Merges global config with per-community overrides.
 */
export const getWidgetsForCommunity = async (communityId) => {
  const config = await getCommunityHubConfig();
  const overrides = config.communityOverrides?.[communityId];

  let widgets = config.widgets || DEFAULT_WIDGETS;

  if (overrides?.widgets) {
    // Merge: override-level enabled/order takes precedence
    const overrideMap = Object.fromEntries(overrides.widgets.map(w => [w.id, w]));
    widgets = widgets.map(w => ({ ...w, ...(overrideMap[w.id] || {}) }));
  }

  return widgets
    .filter(w => w.enabled)
    .sort((a, b) => a.order - b.order);
};

/**
 * Save the full hub config (admin).
 */
export const saveCommunityHubConfig = async (config) => {
  try {
    const ref = doc(db, HUB_CONFIG_PATH);
    await setDoc(ref, {
      ...config,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Error saving community hub config:', error);
    return false;
  }
};
