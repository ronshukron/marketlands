import {
  PENDING_PURCHASE_KEY,
  buildEventParams,
  commerceContents,
  contentIdFor,
  discardPendingPurchase,
  installMetaPixel,
  isCustomerTrackingPath,
  normalizePixelId,
  readPendingPurchase,
  rememberPendingPurchase,
  reservePurchaseEvent,
  resetMetaPixelForTests,
  trackPageView,
} from './metaPixel';

const createStorage = () => {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
};

describe('meta pixel payloads', () => {
  test('keeps a numeric pixel id and rejects placeholders', () => {
    expect(normalizePixelId(' 1234567890 ')).toBe('1234567890');
    expect(normalizePixelId('PIXEL_ID')).toBe('');
    expect(normalizePixelId('12')).toBe('');
  });

  test('uses the product id, then the catalog number', () => {
    expect(contentIdFor({ id: 'prod-1', catalogNumber: '100' })).toBe('prod-1');
    expect(contentIdFor({ catalogNumber: 100 })).toBe('100');
    expect(contentIdFor({})).toBe('');
  });

  test('builds an ILS commerce payload and skips shipping lines', () => {
    const params = buildEventParams({
      value: 30.126,
      contentName: 'עגבניות',
      contentCategory: 'ירקות',
      items: [
        { id: 'a', quantity: 1, price: 10 },
        { id: 'a', quantity: 0.5, price: 10 },
        { id: 'ship', quantity: 1, price: 15, isShipping: true },
        { id: 'adj', quantity: 1, price: 2, isBasketAdjustment: true },
        { catalogNumber: '55', quantity: 2, price: 4 },
      ],
    });

    expect(params.currency).toBe('ILS');
    expect(params.value).toBe(30.13);
    expect(params.content_type).toBe('product');
    expect(params.content_name).toBe('עגבניות');
    expect(params.content_category).toBe('ירקות');
    expect(params.content_ids).toEqual(['a', '55']);
    expect(params.contents).toEqual([
      { id: 'a', quantity: 1.5, item_price: 10 },
      { id: '55', quantity: 2, item_price: 4 },
    ]);
    expect(params.num_items).toBe(3.5);
  });

  test('omits value and currency when the amount is missing', () => {
    expect(buildEventParams({ searchString: 'עגבניה' })).toEqual({
      search_string: 'עגבניה',
    });
    expect(commerceContents([{ isShipping: true, id: 'ship', quantity: 1 }])).toEqual([]);
  });

  test('tracks the storefront and skips staff tools', () => {
    expect(isCustomerTrackingPath('/')).toBe(true);
    expect(isCustomerTrackingPath('/payment-success/')).toBe(true);
    expect(isCustomerTrackingPath('/product/abc')).toBe(true);
    expect(isCustomerTrackingPath('/admin/delivery-v7')).toBe(false);
    expect(isCustomerTrackingPath('/driver/delivery')).toBe(false);
    expect(isCustomerTrackingPath('/order-form-business/1')).toBe(false);
    expect(isCustomerTrackingPath('/order-form/1')).toBe(true);
  });
});

describe('meta pixel purchase dedupe', () => {
  test('remembers a checkout until payment succeeds or is cancelled', () => {
    const storage = createStorage();
    rememberPendingPurchase({
      orderId: 'order-1',
      value: 48,
      items: [{ id: 'tomato', quantity: 2, price: 12 }],
    }, storage);

    expect(readPendingPurchase(storage)).toMatchObject({
      orderId: 'order-1',
      value: 48,
      items: [{ id: 'tomato', quantity: 2, price: 12 }],
    });

    discardPendingPurchase('other-order', storage);
    expect(readPendingPurchase(storage)?.orderId).toBe('order-1');

    discardPendingPurchase('order-1', storage);
    expect(readPendingPurchase(storage)).toBeNull();
  });

  test('drops a checkout that was stored too long ago', () => {
    const storage = createStorage();
    storage.setItem(PENDING_PURCHASE_KEY, JSON.stringify({
      orderId: 'old',
      value: 10,
      items: [],
      savedAt: Date.now() - (3 * 60 * 60 * 1000),
    }));
    expect(readPendingPurchase(storage)).toBeNull();
  });

  test('reserves each order id once', () => {
    const storage = createStorage();
    expect(reservePurchaseEvent(storage, 'order-1')).toBe(true);
    expect(reservePurchaseEvent(storage, 'order-1')).toBe(false);
    expect(reservePurchaseEvent(storage, 'order-2')).toBe(true);
  });
});

describe('meta pixel browser stub', () => {
  afterEach(() => {
    resetMetaPixelForTests();
  });

  test('queues init on a fake window', () => {
    const appended = [];
    const win = {
      document: {
        createElement: () => ({ async: false, src: '' }),
        getElementsByTagName: () => [],
        head: { appendChild: (node) => appended.push(node) },
      },
    };

    expect(installMetaPixel('1234567890', win)).toBe(true);
    expect(installMetaPixel('1234567890', win)).toBe(false);
    expect(Array.from(win.fbq.queue[0])).toEqual(['init', '1234567890']);
    expect(appended[0].src).toBe('https://connect.facebook.net/en_US/fbevents.js');
  });

  test('does not send a page view twice for the same route when no pixel is configured', () => {
    expect(trackPageView('/')).toBe(false);
    expect(trackPageView('/')).toBe(false);
    expect(trackPageView('/admin/delivery-v7')).toBe(false);
  });
});
