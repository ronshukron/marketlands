import axios from 'axios';
import { getAuth } from 'firebase/auth';
// import { getUserEmail } from '../utils/auth';

const CF_BASE = 'https://us-central1-auth-development-323c3.cloudfunctions.net';

export async function acceptCommunityPayment({ orderId, community }) {
  const token = await getAuth().currentUser.getIdToken();
  const url = `${CF_BASE}/settleIndependentCommunity`;
  const { data } = await axios.post(
    url,
    { orderId, community },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return data;
}

export async function cancelCommunityPayment({ orderId, community }) {
  const token = await getAuth().currentUser.getIdToken();
  const url = `${CF_BASE}/cancelIndependentCommunity`;
  const { data } = await axios.post(
    url,
    { orderId, community },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return data;
}

export async function verifyProduct({ productId }) {
  const token = await getAuth().currentUser.getIdToken();
  const url = `${CF_BASE}/verifyIndependentProduct`;
  console.log('verifyProduct', url, { productId });
  const { data } = await axios.post(
    url, 
    { productId }, // Send productId in body
    { 
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return data;
}

export async function rejectProduct({ productId, reason = 'נדחה על ידי מנהל' }) {
  const token = await getAuth().currentUser.getIdToken();
  const url = `${CF_BASE}/rejectIndependentProduct`;
  const { data } = await axios.post(
    url, 
    { productId, reason }, // Send both productId and reason in body
    { 
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return data;
}

export async function cancelVolunteer({ volunteerId, orderId, businessId }) {
  const token = await getAuth().currentUser.getIdToken();
  const url = `${CF_BASE}/cancelVolunteer`;
  const { data } = await axios.post(
    url,
    { volunteerId, orderId, businessId },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return data;
}

// TODO: Implement backend endpoint to send notifications to volunteers of a business
// This is a stub/shell for future implementation and is not wired yet.
export async function notifyVolunteersOfNewOrder({ businessId, orderId }) {
  // Expected backend: CF_BASE + '/notifyIndependentVolunteers'
  // Payload: { businessId, orderId }
  // For now, just log and resolve to success
  console.log('notifyVolunteersOfNewOrder [stub]', { businessId, orderId });
  return { status: 1, data: { enqueued: true } };
} 

