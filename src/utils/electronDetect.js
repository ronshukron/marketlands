/**
 * Electron Detection Utility
 * 
 * Provides utilities for detecting if the app is running in Electron
 * and for conditional behavior between web and desktop versions.
 */

/**
 * Check if the app is running in Electron
 * @returns {boolean} True if running in Electron
 */
export const isElectron = () => {
  return typeof window !== 'undefined' && window.electron !== undefined;
};

/**
 * Check if the app is running in development mode
 * @returns {boolean} True if in development
 */
export const isDevelopment = () => {
  return process.env.NODE_ENV === 'development';
};

/**
 * Get the platform the app is running on
 * @returns {string} Platform name ('win32', 'darwin', 'linux', or 'web')
 */
export const getPlatform = () => {
  if (isElectron() && window.electron.platform) {
    return window.electron.platform;
  }
  return 'web';
};

/**
 * Check if scale API is available
 * @returns {boolean} True if scale API is available
 */
export const hasScaleSupport = () => {
  return isElectron() && window.electron.scale !== undefined;
};

/**
 * Check if auto-updater is available
 * @returns {boolean} True if auto-updater is available
 */
export const hasAutoUpdater = () => {
  return isElectron() && window.electron.updater !== undefined;
};

/**
 * Execute a function only in Electron environment
 * @param {function} fn - Function to execute
 * @param {any} fallback - Value to return if not in Electron
 * @returns {any} Result of function or fallback
 */
export const electronOnly = (fn, fallback = null) => {
  if (isElectron()) {
    return fn();
  }
  return fallback;
};

/**
 * Execute a function only in web environment
 * @param {function} fn - Function to execute
 * @param {any} fallback - Value to return if not in web
 * @returns {any} Result of function or fallback
 */
export const webOnly = (fn, fallback = null) => {
  if (!isElectron()) {
    return fn();
  }
  return fallback;
};

export default {
  isElectron,
  isDevelopment,
  getPlatform,
  hasScaleSupport,
  hasAutoUpdater,
  electronOnly,
  webOnly,
};

