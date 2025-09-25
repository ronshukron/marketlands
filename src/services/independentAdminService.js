import axios from 'axios';
import { getAuth } from 'firebase/auth';
// import { getUserEmail } from '../utils/auth';

const CF_BASE = 'https://us-central1-auth-development-323c3.cloudfunctions.net';

export async function acceptCommunityPayment({ orderId, community }) {
  const url = `${CF_BASE}/settleIndependentCommunity`;
  const { data } = await axios.post(url, { orderId, community });
  return data;
}

export async function cancelCommunityPayment({ orderId, community }) {
  const url = `${CF_BASE}/cancelIndependentCommunity`;
  const { data } = await axios.post(url, { orderId, community });
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

