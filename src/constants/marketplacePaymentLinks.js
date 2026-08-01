export const PAYMENT_LINK_METHODS = ['bit', 'paybox', 'bank_transfer', 'other'];

export const PAYMENT_LINK_LABELS = {
  bit: 'Bit',
  paybox: 'PayBox',
  bank_transfer: 'העברה בנקאית',
  other: 'אחר',
};

export const normalizePaymentLinkUrl = (value) => String(value || '').trim();

const hasControlCharacter = (value) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });

const isPrivatePaymentHostname = (hostname) => {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !normalized ||
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fe80:') ||
    (/^(fc|fd)/.test(normalized) && normalized.includes(':')) ||
    normalized.startsWith('::ffff:')
  ) {
    return true;
  }

  const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((part) => part > 255)) return true;
  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    octets[0] >= 224
  );
};

export const isSafePaymentLinkUrl = (value) => {
  const normalized = normalizePaymentLinkUrl(value);
  if (!normalized || normalized.length > 2048 || hasControlCharacter(normalized)) {
    return false;
  }
  try {
    const parsed = new URL(normalized);
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !isPrivatePaymentHostname(parsed.hostname)
    );
  } catch {
    return false;
  }
};

export const validateStorePaymentLinks = (source) => {
  const links = normalizeStorePaymentLinks(source);
  const errors = {};

  PAYMENT_LINK_METHODS.forEach((method) => {
    const slot = links[method];
    if (!slot.enabled) return;
    if (method === 'bank_transfer') {
      if (!slot.instructions) errors[method] = 'יש למלא פרטי העברה בנקאית';
      return;
    }
    if (!isSafePaymentLinkUrl(slot.url)) {
      errors[method] = 'יש להזין קישור HTTPS תקין ובטוח';
    }
  });

  return { valid: Object.keys(errors).length === 0, errors, links };
};

const emptySlot = () => ({
  enabled: false,
  url: '',
  instructions: '',
});

export const DEFAULT_STORE_PAYMENT_LINKS = PAYMENT_LINK_METHODS.reduce((acc, method) => {
  acc[method] = emptySlot();
  return acc;
}, {});

export const normalizeStorePaymentLinks = (source) => {
  const data = source && typeof source === 'object' ? source : {};
  const links = data.paymentLinks && typeof data.paymentLinks === 'object' ? data.paymentLinks : {};

  return PAYMENT_LINK_METHODS.reduce((acc, method) => {
    const slot = links[method] || {};
    acc[method] = {
      enabled: Boolean(slot.enabled),
      url: method === 'bank_transfer' ? '' : String(slot.url || '').trim(),
      instructions: String(slot.instructions || '').trim(),
    };
    return acc;
  }, {});
};

export const getActivePaymentLinksForStore = (store, selectedMethod) => {
  const links = normalizeStorePaymentLinks(store);
  const methodsToShow = selectedMethod
    ? [selectedMethod].filter((m) => PAYMENT_LINK_METHODS.includes(m))
    : PAYMENT_LINK_METHODS;

  return methodsToShow
    .map((method) => {
      const slot = links[method];
      if (!slot.enabled) return null;
      const hasUrl = isSafePaymentLinkUrl(slot.url);
      const hasInstructions = Boolean(slot.instructions);
      if (!hasUrl && !hasInstructions) return null;
      return {
        method,
        label: PAYMENT_LINK_LABELS[method] || method,
        // Legacy documents may contain an unsafe URL alongside valid text
        // instructions. Keep the instructions visible, but never expose the
        // untrusted URL to an href or redirect.
        url: hasUrl ? slot.url : '',
        instructions: slot.instructions,
      };
    })
    .filter(Boolean);
};

export const getSafeSingleOrderPaymentRedirect = ({
  orders = [],
  storesByBusiness = {},
  selectedMethod = '',
} = {}) => {
  if (orders.length !== 1 || !selectedMethod) return '';
  const order = orders[0];
  if (!order?.id || !order.businessId || order.paymentMethod !== selectedMethod) return '';
  const store = storesByBusiness[order.businessId];
  const link = getActivePaymentLinksForStore(store, selectedMethod).find(
    (entry) => entry.url && isSafePaymentLinkUrl(entry.url)
  );
  return link?.url || '';
};

export const DEFAULT_MARKETPLACE_GLOBAL_SETTINGS = {
  enabled: true,
  highlightLimit: 8,
  waitlistEnabled: true,
  paymentLinksOnConfirmationEnabled: true,
  confirmationIntroText: '',
  confirmationNextStepsText: '',
};

export const normalizeMarketplaceGlobalSettings = (data = {}) => ({
  ...DEFAULT_MARKETPLACE_GLOBAL_SETTINGS,
  ...data,
  waitlistEnabled: data.waitlistEnabled !== false,
  paymentLinksOnConfirmationEnabled: data.paymentLinksOnConfirmationEnabled !== false,
  confirmationIntroText: data.confirmationIntroText || '',
  confirmationNextStepsText: data.confirmationNextStepsText || '',
});
