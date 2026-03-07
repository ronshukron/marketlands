import axios from 'axios';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { functionsEndpoint } from '../utils/functionsClient';

const CONFIG_DOC_PATH = 'settings/paymentConfig';
const PROVIDER_OVERRIDE_KEY = 'regularPaymentProviderOverride';

export const REGULAR_PAYMENT_PROVIDERS = {
  GROW_PAYMENT_LINK: 'grow_payment_link',
  BIT_LEGACY: 'bit_legacy',
};

const DEFAULT_PROVIDER = REGULAR_PAYMENT_PROVIDERS.BIT_LEGACY;

const parseProvider = (value) => {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return Object.values(REGULAR_PAYMENT_PROVIDERS).includes(normalized) ? normalized : null;
};

const shouldFallbackToBit = () => process.env.REACT_APP_REGULAR_PAYMENT_FALLBACK_BIT !== 'false';

const normalizePaymentUrl = (responseData) => {
  return (
    responseData?.data?.url ||
    responseData?.url ||
    responseData?.data?.paymentLink ||
    responseData?.paymentLink ||
    responseData?.data?.paymentUrl ||
    responseData?.paymentUrl ||
    null
  );
};

const callGrowPaymentLinkCheckout = async (payload) => {
  const endpoint = functionsEndpoint('createGrowPaymentLinkCheckout');
  const { data } = await axios.post(endpoint, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  return data;
};

const callBitLegacyCheckout = async (payload) => {
  const endpoint = functionsEndpoint('createBitPayment');
  const { data } = await axios.post(endpoint, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  return data;
};

export const getRegularPaymentProvider = async () => {
  const localOverride = parseProvider(localStorage.getItem(PROVIDER_OVERRIDE_KEY));
  if (localOverride) return localOverride;

  const envProvider = parseProvider(process.env.REACT_APP_REGULAR_PAYMENT_PROVIDER);
  if (envProvider) return envProvider;

  try {
    const configRef = doc(db, CONFIG_DOC_PATH);
    const configSnap = await getDoc(configRef);
    if (configSnap.exists()) {
      const configured = parseProvider(configSnap.data()?.regularPaymentProvider);
      if (configured) return configured;
    }
  } catch (error) {
    console.error('Error reading regular payment provider config:', error);
  }

  return DEFAULT_PROVIDER;
};

export const createRegularPaymentCheckout = async (payload) => {
  const provider = await getRegularPaymentProvider();

  try {
    if (provider === REGULAR_PAYMENT_PROVIDERS.GROW_PAYMENT_LINK) {
      const result = await callGrowPaymentLinkCheckout(payload);
      return {
        provider,
        fallbackUsed: false,
        raw: result,
        url: normalizePaymentUrl(result),
      };
    }

    const legacyResult = await callBitLegacyCheckout(payload);
    return {
      provider: REGULAR_PAYMENT_PROVIDERS.BIT_LEGACY,
      fallbackUsed: false,
      raw: legacyResult,
      url: normalizePaymentUrl(legacyResult),
    };
  } catch (error) {
    if (provider !== REGULAR_PAYMENT_PROVIDERS.GROW_PAYMENT_LINK || !shouldFallbackToBit()) {
      throw error;
    }

    const fallbackResult = await callBitLegacyCheckout(payload);
    return {
      provider: REGULAR_PAYMENT_PROVIDERS.BIT_LEGACY,
      fallbackUsed: true,
      raw: fallbackResult,
      url: normalizePaymentUrl(fallbackResult),
    };
  }
};

