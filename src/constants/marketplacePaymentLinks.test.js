import {
  getActivePaymentLinksForStore,
  getSafeSingleOrderPaymentRedirect,
  isSafePaymentLinkUrl,
  validateStorePaymentLinks,
} from './marketplacePaymentLinks';

const store = {
  paymentLinks: {
    bit: {
      enabled: true,
      url: 'https://pay.example.com/order',
      instructions: 'לציין מספר הזמנה',
    },
  },
};

test('accepts only credential-free HTTPS payment URLs', () => {
  expect(isSafePaymentLinkUrl('https://pay.example.com/x')).toBe(true);
  expect(isSafePaymentLinkUrl('http://pay.example.com/x')).toBe(false);
  expect(isSafePaymentLinkUrl('javascript:alert(1)')).toBe(false);
  expect(isSafePaymentLinkUrl('https://user:pass@pay.example.com/x')).toBe(false);
  expect(isSafePaymentLinkUrl('https://localhost/pay')).toBe(false);
  expect(isSafePaymentLinkUrl('https://192.168.1.10/pay')).toBe(false);
  expect(isSafePaymentLinkUrl('https://100.64.0.1/pay')).toBe(false);
  expect(isSafePaymentLinkUrl('https://224.0.0.1/pay')).toBe(false);
  expect(isSafePaymentLinkUrl('https://[::1]/pay')).toBe(false);
  expect(isSafePaymentLinkUrl('https://[fd00::1]/pay')).toBe(false);
});

test('rejects enabled invalid links and excludes them from display', () => {
  const invalidStore = {
    paymentLinks: { paybox: { enabled: true, url: 'not-a-url', instructions: '' } },
  };
  expect(validateStorePaymentLinks(invalidStore).valid).toBe(false);
  expect(getActivePaymentLinksForStore(invalidStore, 'paybox')).toEqual([]);
});

test('keeps legacy instructions without exposing an unsafe legacy URL', () => {
  const legacyStore = {
    paymentLinks: {
      bit: {
        enabled: true,
        url: 'javascript:alert(1)',
        instructions: 'צרו קשר עם הדוכן לקבלת פרטי תשלום',
      },
    },
  };

  expect(getActivePaymentLinksForStore(legacyStore, 'bit')).toEqual([
    expect.objectContaining({
      method: 'bit',
      url: '',
      instructions: 'צרו קשר עם הדוכן לקבלת פרטי תשלום',
    }),
  ]);
});

test('bank transfer never persists or redirects a stale URL', () => {
  const bankStore = {
    paymentLinks: {
      bank_transfer: {
        enabled: true,
        url: 'https://pay.example.com/legacy',
        instructions: 'בנק 10, סניף 20',
      },
    },
  };

  const validation = validateStorePaymentLinks(bankStore);
  expect(validation.valid).toBe(true);
  expect(validation.links.bank_transfer.url).toBe('');
  expect(getActivePaymentLinksForStore(bankStore, 'bank_transfer')).toEqual([
    expect.objectContaining({ method: 'bank_transfer', url: '' }),
  ]);
});

test('redirects only a single created order to its selected method', () => {
  const input = {
    orders: [{ id: 'order-1', businessId: 'store-1', paymentMethod: 'bit' }],
    storesByBusiness: { 'store-1': store },
    selectedMethod: 'bit',
  };
  expect(getSafeSingleOrderPaymentRedirect(input)).toBe('https://pay.example.com/order');
  expect(
    getSafeSingleOrderPaymentRedirect({
      ...input,
      orders: [...input.orders, { id: 'order-2', businessId: 'store-2' }],
    })
  ).toBe('');
  expect(
    getSafeSingleOrderPaymentRedirect({
      ...input,
      orders: [{ businessId: 'store-1', paymentMethod: 'bit' }],
    })
  ).toBe('');
  expect(getSafeSingleOrderPaymentRedirect({ ...input, selectedMethod: 'paybox' })).toBe('');
});
