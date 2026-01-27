import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const CONFIG_DOC_PATH = 'settings/paymentConfig';

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
 * Get the correct checkout route based on pickup spot
 * @param {string} pickupSpot - The selected pickup spot
 * @returns {Promise<string>} The route path to navigate to
 */
export const getCheckoutRoute = async (pickupSpot) => {
  const isDelayed = await isDelayedPaymentSpot(pickupSpot);
  return isDelayed ? '/order-confirmation-delayed' : '/order-confirmation';
};
