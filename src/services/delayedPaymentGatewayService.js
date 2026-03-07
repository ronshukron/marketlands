import axios from 'axios';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { functionsEndpoint } from '../utils/functionsClient';

const CONFIG_DOC_PATH = 'settings/paymentConfig';
const GATEWAY_OVERRIDE_KEY = 'delayedPaymentGatewayOverride';

export const DELAYED_PAYMENT_GATEWAYS = {
  GROW_PAYMENT_LINK: 'grow_payment_link',
  GROW_J5_LEGACY: 'grow_j5_legacy',
};

const DEFAULT_GATEWAY = DELAYED_PAYMENT_GATEWAYS.GROW_J5_LEGACY;

const parseGateway = (value) => {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return Object.values(DELAYED_PAYMENT_GATEWAYS).includes(normalized) ? normalized : null;
};

const shouldFallbackToLegacy = () => process.env.REACT_APP_DELAYED_PAYMENT_FALLBACK_LEGACY !== 'false';

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

const callGrowLegacyJ5Checkout = async (payload) => {
  const endpoint = functionsEndpoint('createGrowSuspendedPayment');
  const { data } = await axios.post(endpoint, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  return data;
};

export const getDelayedPaymentGateway = async () => {
  const localOverride = parseGateway(localStorage.getItem(GATEWAY_OVERRIDE_KEY));
  if (localOverride) return localOverride;

  const envGateway = parseGateway(process.env.REACT_APP_DELAYED_PAYMENT_GATEWAY);
  if (envGateway) return envGateway;

  try {
    const configRef = doc(db, CONFIG_DOC_PATH);
    const configSnap = await getDoc(configRef);
    if (configSnap.exists()) {
      const configured = parseGateway(configSnap.data()?.delayedPaymentGateway);
      if (configured) return configured;
    }
  } catch (error) {
    console.error('Error reading delayed payment gateway config:', error);
  }

  return DEFAULT_GATEWAY;
};

export const createDelayedPaymentCheckout = async (payload) => {
  const gateway = await getDelayedPaymentGateway();

  try {
    if (gateway === DELAYED_PAYMENT_GATEWAYS.GROW_PAYMENT_LINK) {
      const result = await callGrowPaymentLinkCheckout(payload);
      return {
        gateway,
        fallbackUsed: false,
        raw: result,
        url: normalizePaymentUrl(result),
      };
    }

    const legacyResult = await callGrowLegacyJ5Checkout(payload);
    return {
      gateway: DELAYED_PAYMENT_GATEWAYS.GROW_J5_LEGACY,
      fallbackUsed: false,
      raw: legacyResult,
      url: normalizePaymentUrl(legacyResult),
    };
  } catch (error) {
    if (gateway !== DELAYED_PAYMENT_GATEWAYS.GROW_PAYMENT_LINK || !shouldFallbackToLegacy()) {
      throw error;
    }

    const fallbackResult = await callGrowLegacyJ5Checkout(payload);
    return {
      gateway: DELAYED_PAYMENT_GATEWAYS.GROW_J5_LEGACY,
      fallbackUsed: true,
      raw: fallbackResult,
      url: normalizePaymentUrl(fallbackResult),
    };
  }
};

