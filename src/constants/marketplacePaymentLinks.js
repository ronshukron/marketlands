export const PAYMENT_LINK_METHODS = ['bit', 'paybox', 'bank_transfer', 'other'];

export const PAYMENT_LINK_LABELS = {
  bit: 'Bit',
  paybox: 'PayBox',
  bank_transfer: 'העברה בנקאית',
  other: 'אחר',
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
      url: String(slot.url || '').trim(),
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
      const hasUrl = Boolean(slot.url);
      const hasInstructions = Boolean(slot.instructions);
      if (!hasUrl && !hasInstructions) return null;
      return {
        method,
        label: PAYMENT_LINK_LABELS[method] || method,
        url: slot.url,
        instructions: slot.instructions,
      };
    })
    .filter(Boolean);
};

export const DEFAULT_MARKETPLACE_GLOBAL_SETTINGS = {
  enabled: true,
  highlightLimit: 8,
  paymentLinksOnConfirmationEnabled: true,
  confirmationIntroText: '',
  confirmationNextStepsText: '',
};

export const normalizeMarketplaceGlobalSettings = (data = {}) => ({
  ...DEFAULT_MARKETPLACE_GLOBAL_SETTINGS,
  ...data,
  paymentLinksOnConfirmationEnabled: data.paymentLinksOnConfirmationEnabled !== false,
  confirmationIntroText: data.confirmationIntroText || '',
  confirmationNextStepsText: data.confirmationNextStepsText || '',
});
