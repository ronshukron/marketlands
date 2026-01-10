import axios from 'axios';
import { functionsEndpoint } from '../../utils/functionsClient';

/**
 * Create a Grow (Meshulam) suspended charge (J5) payment process via backend.
 * IMPORTANT: Grow blocks browser->Grow direct calls. This MUST hit our backend only.
 *
 * Expected backend responsibilities:
 * - Validate/authorize
 * - Use the correct userId + pageCode per business
 * - Call createPaymentProcess with chargeType=2
 * - Store processId/processToken ONLY on server-side (never expose to customer)
 * - Return hosted payment URL to redirect the customer
 */
export async function createGrowSuspendedPaymentProcess(payload) {
  // For testing with the Functions emulator, force local endpoint when requested.
  // Set REACT_APP_FORCE_FUNCTIONS_LOCAL=true to always use emulator even if hostname isn't localhost.
  const forceLocal = process.env.REACT_APP_FORCE_FUNCTIONS_LOCAL === 'true';
  const url = forceLocal
    ? 'http://127.0.0.1:5001/auth-development-323c3/us-central1/createGrowSuspendedPayment'
    : functionsEndpoint('createGrowSuspendedPayment');
  const { data } = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  return data;
}


