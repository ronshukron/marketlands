const isLocalhost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// Use emulator only when explicitly requested.
const useFunctionsEmulator = process.env.REACT_APP_USE_FUNCTIONS_EMULATOR === 'true';

export const FUNCTIONS_BASE_URL = (isLocalhost && useFunctionsEmulator)
  ? 'http://127.0.0.1:5001/auth-development-323c3/us-central1'
  : 'https://us-central1-auth-development-323c3.cloudfunctions.net';

export const functionsEndpoint = (name) => `${FUNCTIONS_BASE_URL}/${name}`; 