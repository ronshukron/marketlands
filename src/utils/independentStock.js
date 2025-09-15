import axios from 'axios';

/**
 * Check and update stock via backend, similar to weekly flow.
 * Filters out shipping items and returns a result with success flag or error details.
 * Structure mirrors the weekly function so the UI can reuse patterns.
 */
export async function checkAndUpdateIndependentStock(groupedItemsByOrder) {
  try {
    // Reuse existing Cloud Function endpoint shape, but keep separate util in case of future divergence
    // Prod
    const response = await axios.post(
    //   'https://us-central1-auth-development-323c3.cloudfunctions.net/checkAndUpdateStock',
      'http://127.0.0.1:5001/auth-development-323c3/us-central1/checkAndUpdateStock',

      { orderItems: groupedItemsByOrder },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      return error.response.data;
    }
    return {
      success: false,
      error: error.message || 'Failed to check stock availability'
    };
  }
} 