import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const CONFIG_DOC_PATH = 'settings/paymentConfig';
export const REGULAR_PAYMENT_PROVIDERS = ['bit_legacy', 'grow_payment_link'];
export const DELAYED_PAYMENT_GATEWAYS = ['grow_j5_legacy', 'grow_payment_link'];
const DEFAULT_REUSABLE_CARTON_CONFIG = {
  enabledSpots: [],
  defaultSelectedSpots: [],
};

async function readPaymentConfigDoc() {
  const configRef = doc(db, CONFIG_DOC_PATH);
  const configSnap = await getDoc(configRef);
  return configSnap.exists() ? configSnap.data() : {};
}

export async function readPaymentConfigSnapshot() {
  return readPaymentConfigDoc();
}

/**
 * Merge Firestore payment config with the current community list from DB.
 * Communities not in knownCommunities are treated as new and default to delayed payment.
 */
export const mergePaymentConfigWithCommunities = (allCommunities, config = {}) => {
  const delayedPaymentSpots = Array.isArray(config.delayedPaymentSpots) ? [...config.delayedPaymentSpots] : [];
  const knownCommunities = Array.isArray(config.knownCommunities) ? [...config.knownCommunities] : null;
  const all = Array.isArray(allCommunities) ? allCommunities.filter(Boolean) : [];

  if (!knownCommunities) {
    return {
      delayedPaymentSpots,
      knownCommunities: all,
      newCommunities: [],
    };
  }

  const newCommunities = all.filter((name) => !knownCommunities.includes(name));
  const mergedDelayed = [...new Set([...delayedPaymentSpots, ...newCommunities])];

  return {
    delayedPaymentSpots: mergedDelayed,
    knownCommunities: all,
    newCommunities,
  };
};

const normalizeReusableCartonConfig = (config = {}) => {
  const enabledSpots = Array.isArray(config.enabledSpots) ? config.enabledSpots : [];
  const defaultSelectedSpots = Array.isArray(config.defaultSelectedSpots) ? config.defaultSelectedSpots : [];
  const enabledSet = new Set(enabledSpots);

  return {
    enabledSpots,
    defaultSelectedSpots: defaultSelectedSpots.filter((spot) => enabledSet.has(spot)),
  };
};

/**
 * Get the list of pickup spots configured for delayed payment
 * @returns {Promise<string[]>} Array of pickup spot names that use delayed payment
 */
export const getDelayedPaymentSpots = async () => {
  try {
    const data = await readPaymentConfigDoc();
    return data.delayedPaymentSpots || [];
  } catch (error) {
    console.error('Error fetching delayed payment spots:', error);
    return [];
  }
};

/**
 * Load delayed-payment spots merged with DB communities (new → delayed by default).
 */
export const getDelayedPaymentSpotsForAdmin = async (allCommunities = []) => {
  try {
    const data = await readPaymentConfigDoc();
    return mergePaymentConfigWithCommunities(allCommunities, data);
  } catch (error) {
    console.error('Error fetching delayed payment spots for admin:', error);
    return mergePaymentConfigWithCommunities(allCommunities, {});
  }
};

/**
 * Check if a specific pickup spot uses delayed payment
 * @param {string} pickupSpot - The pickup spot name to check
 * @returns {Promise<boolean>} True if the spot uses delayed payment
 */
export const isDelayedPaymentSpot = async (pickupSpot) => {
  if (!pickupSpot) return false;

  try {
    const data = await readPaymentConfigDoc();
    const delayedSpots = data.delayedPaymentSpots || [];
    const knownCommunities = data.knownCommunities;

    if (delayedSpots.includes(pickupSpot)) return true;
    if (Array.isArray(knownCommunities)) {
      return !knownCommunities.includes(pickupSpot);
    }
    return false;
  } catch (error) {
    console.error('Error checking delayed payment spot:', error);
    return false;
  }
};

/**
 * Update the list of pickup spots that use delayed payment
 * @param {string[]} spots - Array of pickup spot names
 * @returns {Promise<boolean>} True if successful
 */
export const setDelayedPaymentSpots = async (spots, knownCommunities = []) => {
  try {
    const configRef = doc(db, CONFIG_DOC_PATH);
    await setDoc(configRef, {
      delayedPaymentSpots: spots,
      knownCommunities: knownCommunities.filter(Boolean),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Error setting delayed payment spots:', error);
    return false;
  }
};

export const addNewCommunityToPaymentConfig = async (communityName) => {
  const name = String(communityName || '').trim();
  if (!name) return false;

  try {
    const data = await readPaymentConfigDoc();
    const delayed = new Set(data.delayedPaymentSpots || []);
    const known = new Set(Array.isArray(data.knownCommunities) ? data.knownCommunities : []);
    delayed.add(name);
    known.add(name);

    const configRef = doc(db, CONFIG_DOC_PATH);
    await setDoc(configRef, {
      delayedPaymentSpots: [...delayed],
      knownCommunities: [...known],
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Error adding community to payment config:', error);
    return false;
  }
};

export const removeCommunityFromPaymentConfig = async (communityName) => {
  const name = String(communityName || '').trim();
  if (!name) return false;

  try {
    const data = await readPaymentConfigDoc();
    const configRef = doc(db, CONFIG_DOC_PATH);
    await setDoc(configRef, {
      delayedPaymentSpots: (data.delayedPaymentSpots || []).filter((spot) => spot !== name),
      knownCommunities: (data.knownCommunities || []).filter((spot) => spot !== name),
      reusableCartonConfig: normalizeReusableCartonConfig({
        enabledSpots: (data.reusableCartonConfig?.enabledSpots || []).filter((spot) => spot !== name),
        defaultSelectedSpots: (data.reusableCartonConfig?.defaultSelectedSpots || []).filter((spot) => spot !== name),
      }),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Error removing community from payment config:', error);
    return false;
  }
};

/**
 * Get payment provider routing config for regular + delayed flows.
 * @returns {Promise<{regularPaymentProvider: string, delayedPaymentGateway: string}>}
 */
export const getPaymentRoutingConfig = async () => {
  try {
    const configRef = doc(db, CONFIG_DOC_PATH);
    const configSnap = await getDoc(configRef);
    const data = configSnap.exists() ? configSnap.data() : {};

    const regularPaymentProvider = REGULAR_PAYMENT_PROVIDERS.includes(data?.regularPaymentProvider)
      ? data.regularPaymentProvider
      : 'bit_legacy';
    const delayedPaymentGateway = DELAYED_PAYMENT_GATEWAYS.includes(data?.delayedPaymentGateway)
      ? data.delayedPaymentGateway
      : 'grow_j5_legacy';

    return { regularPaymentProvider, delayedPaymentGateway };
  } catch (error) {
    console.error('Error fetching payment routing config:', error);
    return {
      regularPaymentProvider: 'bit_legacy',
      delayedPaymentGateway: 'grow_j5_legacy'
    };
  }
};

/**
 * Save payment provider routing config for regular + delayed flows.
 * @param {{regularPaymentProvider: string, delayedPaymentGateway: string}} config
 * @returns {Promise<boolean>} True if successful
 */
export const setPaymentRoutingConfig = async (config) => {
  try {
    const regularPaymentProvider = REGULAR_PAYMENT_PROVIDERS.includes(config?.regularPaymentProvider)
      ? config.regularPaymentProvider
      : 'bit_legacy';
    const delayedPaymentGateway = DELAYED_PAYMENT_GATEWAYS.includes(config?.delayedPaymentGateway)
      ? config.delayedPaymentGateway
      : 'grow_j5_legacy';

    const configRef = doc(db, CONFIG_DOC_PATH);
    await setDoc(configRef, {
      regularPaymentProvider,
      delayedPaymentGateway,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Error setting payment routing config:', error);
    return false;
  }
};

/**
 * Get reusable farmer carton rollout/default config.
 * @returns {Promise<{enabledSpots: string[], defaultSelectedSpots: string[]}>}
 */
export const getReusableCartonConfig = async () => {
  try {
    const configRef = doc(db, CONFIG_DOC_PATH);
    const configSnap = await getDoc(configRef);

    if (configSnap.exists()) {
      return normalizeReusableCartonConfig(configSnap.data().reusableCartonConfig);
    }
    return DEFAULT_REUSABLE_CARTON_CONFIG;
  } catch (error) {
    console.error('Error fetching reusable carton config:', error);
    return DEFAULT_REUSABLE_CARTON_CONFIG;
  }
};

/**
 * Save reusable farmer carton rollout/default config.
 * @param {{enabledSpots: string[], defaultSelectedSpots: string[]}} config
 * @returns {Promise<boolean>} True if successful
 */
export const setReusableCartonConfig = async (config) => {
  try {
    const configRef = doc(db, CONFIG_DOC_PATH);
    await setDoc(configRef, {
      reusableCartonConfig: normalizeReusableCartonConfig(config),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Error setting reusable carton config:', error);
    return false;
  }
};

/**
 * Get the correct checkout route based on pickup spot
 * @param {string} pickupSpot - The selected pickup spot
 * @returns {Promise<string>} The route path to navigate to
 */
export const getCheckoutRoute = async (pickupSpot) => {
  const isDelayed = await isDelayedPaymentSpot(pickupSpot);
  return isDelayed ? '/order-confirmation-delayed' : '/order-confirmation';
};
