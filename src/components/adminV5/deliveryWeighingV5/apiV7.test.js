jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn((db, ...segments) => segments.join('/')),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  onSnapshot: jest.fn(),
  query: jest.fn(),
  runTransaction: jest.fn(),
  updateDoc: jest.fn(),
  where: jest.fn(),
}));
jest.mock('../../../firebase/firebase', () => ({ db: {} }));
jest.mock('../../../utils/functionsClient', () => ({
  functionsEndpoint: jest.fn((name) => `https://example.test/${name}`),
}));

import { runTransaction } from 'firebase/firestore';
import {
  buildCommunityDiscountFingerprint,
  buildSettlementPayload,
} from './v7/orderDraftUtils';
import { prepareCommunityDiscountForSettlementV7 } from './apiV7';

const orderId = 'order-7';
const communityDiscount = {
  percent: 10,
  tierIndex: 1,
  deliveryWeekKey: '2026-08-09',
  community: 'קהילה א',
  cohortTotal: 1000,
};
const session = {
  sessionId: 'user::station',
  stationId: 'station',
  userId: 'user',
  userName: 'Admin',
};

const buildOrderData = (overrides = {}) => ({
  paymentStatus: 'held',
  delayedOrderStatus: 'pending_weighing',
  grandTotal: 100,
  orderBreakdown: {
    business: {
      businessId: 'business',
      items: [{
        productId: 'product',
        productName: 'Product',
        lineSeed: 's0',
        quantity: 2,
        estimatedChargeQuantity: 2,
        estimatedLineTotal: 100,
        price: 50,
        effectivePrice: 50,
      }],
    },
  },
  ...overrides,
});

const mockTransaction = (orderData) => {
  const transaction = {
    get: jest.fn(async () => ({
      exists: () => true,
      data: () => orderData,
    })),
    update: jest.fn(),
  };
  runTransaction.mockImplementationOnce(async (db, callback) => callback(transaction));
  return transaction;
};

describe('prepareCommunityDiscountForSettlementV7', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('atomically prepares discounted prices before settlement', async () => {
    const transaction = mockTransaction(buildOrderData());
    const result = await prepareCommunityDiscountForSettlementV7({
      orderId,
      communityDiscount,
      session,
    });

    expect(result).toMatchObject({ ok: true, skipped: false, grandTotal: 90 });
    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.update.mock.calls[0][1]).toMatchObject({
      grandTotal: 90,
      communityDiscount: expect.objectContaining({ percent: 10 }),
      communityDiscountPreparation: expect.objectContaining({
        status: 'prepared',
        fingerprint: result.fingerprint,
        preparedBySessionId: session.sessionId,
      }),
      adminEditAction: 'prepare_community_discount',
    });
    const writtenLine = transaction.update.mock.calls[0][1].orderBreakdown.business.items[0];
    expect(writtenLine).toMatchObject({
      communityDiscountOriginalPrice: 50,
      price: 45,
      effectivePrice: 45,
      estimatedLineTotal: 90,
    });
  });

  test('treats an identical prepared fingerprint as an idempotent retry', async () => {
    const fingerprint = buildCommunityDiscountFingerprint({ orderId, communityDiscount });
    const existingPreparation = {
      status: 'prepared',
      fingerprint,
      snapshot: { ...communityDiscount, fingerprint },
    };
    const transaction = mockTransaction(buildOrderData({
      communityDiscountPreparation: existingPreparation,
    }));

    const result = await prepareCommunityDiscountForSettlementV7({
      orderId,
      communityDiscount,
      session,
    });

    expect(result).toMatchObject({
      ok: true,
      skipped: true,
      fingerprint,
      preparation: existingPreparation,
    });
    expect(transaction.update).not.toHaveBeenCalled();
  });

  test('reuses original basket prices after a failed charge and refresh', async () => {
    const basketOrder = buildOrderData({
      grandTotal: 30,
      orderBreakdown: {
        business: {
          items: [
            {
              productId: 'basket-product',
              productName: 'Basket Product',
              lineSeed: 's0',
              quantity: 1,
              price: 35,
              estimatedLineTotal: 35,
              measurementType: 'package',
              isBasketComponent: true,
              basketId: 'basket',
              basketInstanceId: 'basket-1',
              basketPrice: 30,
            },
            {
              productId: 'basket-adjustment',
              productName: 'Basket Adjustment',
              lineSeed: 's1',
              quantity: 1,
              price: -5,
              estimatedLineTotal: -5,
              isShipping: true,
              isBasketAdjustment: true,
              basketInstanceId: 'basket-1',
              basketPrice: 30,
            },
          ],
        },
      },
    });
    const firstTransaction = mockTransaction(basketOrder);
    const first = await prepareCommunityDiscountForSettlementV7({
      orderId,
      communityDiscount,
      session,
    });
    const write = firstTransaction.update.mock.calls[0][1];
    const retryOrder = {
      ...basketOrder,
      ...write,
      communityDiscountPreparation: first.preparation,
    };
    mockTransaction(retryOrder);

    const retry = await prepareCommunityDiscountForSettlementV7({
      orderId,
      communityDiscount,
      session,
    });
    const settlement = buildSettlementPayload({
      selectedOrder: { id: orderId },
      items: retry.preparedItems,
      draft: {},
      communityDiscount,
    });

    expect(retry.preparedItems[0].pricePerUnit).toBe(35);
    expect(retry.preparedItems[0].basketPrice).toBe(30);
    expect(settlement.finalSum).toBe(27);
  });

  test('blocks a conflicting prepared discount', async () => {
    mockTransaction(buildOrderData({
      communityDiscountPreparation: {
        status: 'prepared',
        fingerprint: 'different',
        snapshot: { percent: 5 },
      },
    }));

    await expect(prepareCommunityDiscountForSettlementV7({
      orderId,
      communityDiscount,
      session,
    })).rejects.toThrow('different community discount');
  });

  test('blocks preparation when the order is not held for weighing', async () => {
    mockTransaction(buildOrderData({
      paymentStatus: 'completed',
      delayedOrderStatus: 'completed',
    }));

    await expect(prepareCommunityDiscountForSettlementV7({
      orderId,
      communityDiscount,
      session,
    })).rejects.toThrow('no longer eligible');
  });

  test('blocks first preparation outside the selected pilot communities', async () => {
    let readCount = 0;
    const transaction = {
      get: jest.fn(async () => {
        readCount += 1;
        if (readCount === 2) {
          return {
            exists: () => true,
            data: () => ({
              enabled: true,
              availabilityMode: 'selected',
              pilotCommunities: ['קהילה ב'],
            }),
          };
        }
        return {
          exists: () => true,
          data: () => buildOrderData(),
        };
      }),
      update: jest.fn(),
    };
    runTransaction.mockImplementationOnce(async (db, callback) => callback(transaction));

    await expect(prepareCommunityDiscountForSettlementV7({
      orderId,
      communityDiscount,
      session,
    })).rejects.toThrow('not available for this community');
    expect(transaction.update).not.toHaveBeenCalled();
  });

  test('surfaces transaction failures so charging can be stopped', async () => {
    runTransaction.mockRejectedValueOnce(new Error('permission-denied'));

    await expect(prepareCommunityDiscountForSettlementV7({
      orderId,
      communityDiscount,
      session,
    })).rejects.toThrow('permission-denied');
  });
});
