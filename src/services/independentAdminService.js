import axios from 'axios';

export async function acceptCommunityPayment({ orderId, community }) {
  const url = `/api/independent/settleCommunity`;
  const { data } = await axios.post(url, { orderId, community });
  return data;
}

export async function cancelCommunityPayment({ orderId, community }) {
  const url = `/api/independent/cancelCommunity`;
  const { data } = await axios.post(url, { orderId, community });
  return data;
} 