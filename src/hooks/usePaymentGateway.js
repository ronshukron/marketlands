import { useMemo } from 'react';

export default function usePaymentGateway({ mode, paymentRoute }) {
  const endpoint = useMemo(() => {
    if (mode === 'independent' && paymentRoute === 'threshold') {
      return process.env.REACT_APP_THRESHOLD_PAYMENT_URL || '/api/createCommunityThresholdPayment';
    }
    return process.env.REACT_APP_WEEKLY_PAYMENT_URL || '/api/createBitPayment';
  }, [mode, paymentRoute]);

  async function pay(payload) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Payment request failed');
    }
    return res.json();
  }

  return { endpoint, pay };
} 