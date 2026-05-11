import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const CONFIG_DOC_PATH = 'settings/paymentConfig';
export const REGULAR_PAYMENT_PROVIDERS = ['bit_legacy', 'grow_payment_link'];
export const DELAYED_PAYMENT_GATEWAYS = ['grow_j5_legacy', 'grow_payment_link'];
const DEFAULT_REUSABLE_CARTON_CONFIG = {
  enabledSpots: [],
  defaultSelectedSpots: [],
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
    const configRef = doc(db, CONFIG_DOC_PATH);
    const configSnap = await getDoc(configRef);
    
    if (configSnap.exists()) {
      return configSnap.data().delayedPaymentSpots || [];
    }
    return [];
  } catch (error) {
    console.error('Error fetching delayed payment spots:', error);
    return [];
  }
};

/**
 * Check if a specific pickup spot uses delayed payment
 * @param {string} pickupSpot - The pickup spot name to check
 * @returns {Promise<boolean>} True if the spot uses delayed payment
 */
export const isDelayedPaymentSpot = async (pickupSpot) => {
  if (!pickupSpot) return false;
  
  const delayedSpots = await getDelayedPaymentSpots();
  return delayedSpots.includes(pickupSpot);
};

/**
 * Update the list of pickup spots that use delayed payment
 * @param {string[]} spots - Array of pickup spot names
 * @returns {Promise<boolean>} True if successful
 */
export const setDelayedPaymentSpots = async (spots) => {
  try {
    const configRef = doc(db, CONFIG_DOC_PATH);
    await setDoc(configRef, {
      delayedPaymentSpots: spots,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Error setting delayed payment spots:', error);
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
