export const FUNCTIONS_BASE_URL = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
  ? 'http://127.0.0.1:5001/auth-development-323c3/us-central1'
  : 'https://us-central1-auth-development-323c3.cloudfunctions.net';

export const functionsEndpoint = (name) => `${FUNCTIONS_BASE_URL}/${name}`; 