import axios from 'axios';

export function generateCustomerOrderId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `ind_${Date.now()}_${rand}`;
}

/**
 * Create a suspended (J5) payment process for an independent community order.
 * NOTE: This only calls your backend endpoint. The backend must handle:
 * - Credentials (userId, pageCode) and security
 * - J5 creation via provider API
 * - Saving/aligning Firestore docs and notifyUrl handling
 * - Returning a hosted payment URL
 */
export async function createSuspendedPayment({
  orderId,
  items,
  total,
  customerDetails,
  pickupSpot,
  description = 'תשלום הזמנה קהילתית - חקלאים עצמאיים',
  customerOrderId
}) {
  const endpoint = 'http://127.0.0.1:5001/auth-development-323c3/us-central1/createIndependentSuspendedPayment';
  console.log('endpoint', endpoint); // debugging
  // Assemble product data for invoice context (backend may override)
  // The provider expects integers; backend should convert/validate
  const productData = [];
  let productIndex = 0;
  for (const item of items) {
    if (!item || !item.quantity || item.quantity <= 0) continue;
    productData.push({
      [`productData[${productIndex}][catalogNumber]`]: item.catalogNumber || '',
      [`productData[${productIndex}][quantity]`]: item.quantity,
      [`productData[${productIndex}][price]`]: Number(item.price) * Number(item.quantity),
      [`productData[${productIndex}][itemDescription]`]: item.name || 'פריט'
    });
    productIndex++;
  }

  const successUrl = `${window.location.origin}/payment-success/`;
  const cancelUrl = `${window.location.origin}/payment-cancel/`;

  const payload = {
    mode: 'independent',
    orderId,
    sum: Number(total),
    description,
    customerDetails: {
      fullName: customerDetails?.name || '',
      phone: customerDetails?.phone || '',
      email: customerDetails?.email || '',
      address: customerDetails?.address || '',
      directions: customerDetails?.directions || ''
    },
    pickupSpot: pickupSpot || customerDetails?.pickupSpot || '',
    customerOrderId,
    successUrl,
    cancelUrl,
    // Flatten product data key-value pairs for backend convenience
    ...productData.reduce((acc, cur) => Object.assign(acc, cur), {})
  };

  const response = await axios.post(endpoint, payload, {
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('response', response); // debugging
  // Expecting { status: 1, data: { url } } or a similar contract from your backend
  return response.data;
} 