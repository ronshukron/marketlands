import { sha256Hex } from '../utils/sha256';
import {
  COMPENSATION_STATUSES,
  buildCompensationOrderLine,
  buildRedeemedOrderPayload,
  computeOriginalValue,
  injectCompensationLines,
  mergeBusinessIds,
  normalizeEmail,
  normalizePhone,
  normalizeProductSnapshot,
  resolveRecipientIdentities,
  resolveRecipientIdentity,
  validateCompensationAssignment,
} from './compensationService';

const tomato = {
  productId: 'prod-1',
  productName: 'עגבניה',
  orderId: 'order-biz-1',
  businessId: 'biz-1',
  businessName: 'החקלאי',
  selectedOption: 'גדול',
  price: 10,
  measurementType: 'kg',
  unitSize: 0.5,
  averageWeightKg: 1,
  catalogNumber: '1001',
  vatType: 3,
};

const activeGrant = (overrides = {}) => ({
  id: 'comp-1',
  identityKey: 'phone_abc',
  status: COMPENSATION_STATUSES.ACTIVE,
  quantity: 1,
  originalPrice: 10,
  originalValue: 10,
  productSnapshot: normalizeProductSnapshot(tomato, 1),
  ...overrides,
});

describe('compensation identity', () => {
  test('normalizes Israeli phone numbers', () => {
    expect(normalizePhone('050-123-4567')).toBe('0501234567');
    expect(normalizePhone('+972501234567')).toBe('0501234567');
    expect(normalizePhone('972501234567')).toBe('0501234567');
  });

  test('normalizes emails', () => {
    expect(normalizeEmail('  User@Example.com ')).toBe('user@example.com');
  });

  test('prefers uid, then phone, then email for the canonical identity', () => {
    expect(resolveRecipientIdentity({
      uid: 'user-1',
      phone: '0501234567',
      email: 'a@b.com',
    }).key).toBe('uid_user-1');

    expect(resolveRecipientIdentity({
      phone: '050-123-4567',
      email: 'a@b.com',
    }).key).toBe(`phone_${sha256Hex('0501234567')}`);

    expect(resolveRecipientIdentity({
      email: 'A@B.com',
    }).key).toBe(`email_${sha256Hex('a@b.com')}`);
  });

  test('hashes guest keys with SHA-256', () => {
    const identity = resolveRecipientIdentity({ phone: '0501234567' });
    expect(identity.key).toMatch(/^phone_[0-9a-f]{64}$/);
    expect(identity.key).not.toContain('0501234567');
  });

  test('collects every matching identity for checkout lookup', () => {
    const identities = resolveRecipientIdentities({
      uid: 'user-1',
      phone: '0501234567',
      email: 'a@b.com',
    });
    expect(identities.map((item) => item.type)).toEqual(['uid', 'phone', 'email']);
  });

  test('returns no identity when contact fields are missing', () => {
    expect(resolveRecipientIdentity({})).toBeNull();
    expect(resolveRecipientIdentities({})).toEqual([]);
  });
});

describe('compensation snapshots and lines', () => {
  test('keeps an immutable product snapshot with the assigned quantity', () => {
    const snapshot = normalizeProductSnapshot(tomato, 2);
    expect(snapshot.productId).toBe('prod-1');
    expect(snapshot.quantity).toBe(2);
    expect(snapshot.price).toBe(10);
    expect(computeOriginalValue(snapshot)).toBe(20);
  });

  test('rejects invalid assignments', () => {
    expect(() => validateCompensationAssignment({
      snapshot: normalizeProductSnapshot(tomato, 1),
      quantity: 0,
    })).toThrow('QUANTITY_INVALID');
    expect(() => validateCompensationAssignment({
      snapshot: { productId: '' },
      quantity: 1,
    })).toThrow('PRODUCT_REQUIRED');
  });

  test('builds a zero-price compensation order line from the snapshot', () => {
    const line = buildCompensationOrderLine(activeGrant());
    expect(line.isCompensation).toBe(true);
    expect(line.compensationId).toBe('comp-1');
    expect(line.price).toBe(0);
    expect(line.estimatedLineTotal).toBe(0);
    expect(line.originalPrice).toBe(10);
    expect(line.productName).toBe('עגבניה');
    expect(line.quantity).toBe(1);
  });

  test('injects multiple pending grants without changing paid subtotals', () => {
    const existing = {
      'order-biz-1': {
        businessId: 'biz-1',
        businessName: 'החקלאי',
        subTotal: 40,
        items: [{ productId: 'paid-1', productName: 'מלפפון', quantity: 2, price: 20 }],
      },
    };
    const second = activeGrant({
      id: 'comp-2',
      productSnapshot: normalizeProductSnapshot({
        ...tomato,
        productId: 'prod-2',
        productName: 'מלון',
        orderId: 'missing-now',
        businessId: 'biz-2',
      }, 1),
    });

    const result = injectCompensationLines(existing, [activeGrant(), second]);
    expect(result.breakdown['order-biz-1'].subTotal).toBe(40);
    expect(result.breakdown['order-biz-1'].items).toHaveLength(2);
    expect(result.breakdown['order-biz-1'].items[1].isCompensation).toBe(true);
    expect(result.breakdown['missing-now'].items[0].productName).toBe('מלון');
    expect(result.compensationItems).toHaveLength(2);
    expect(result.extraBusinessIds).toEqual(['biz-1', 'biz-2']);
  });

  test('ignores redeemed or revoked grants during inject', () => {
    const result = injectCompensationLines({}, [
      activeGrant({ status: COMPENSATION_STATUSES.REDEEMED }),
      activeGrant({ id: 'revoked', status: COMPENSATION_STATUSES.REVOKED }),
    ]);
    expect(result.compensationItems).toEqual([]);
    expect(result.breakdown).toEqual({});
  });

  test('keeps pending grants indefinitely until claimed or revoked', () => {
    const grant = activeGrant({ assignedAt: '2020-01-01T00:00:00.000Z' });
    expect(grant.status).toBe(COMPENSATION_STATUSES.ACTIVE);
    expect(injectCompensationLines({}, [grant]).compensationItems).toHaveLength(1);
  });

  test('stamps compensation metadata on the persisted order payload', () => {
    const payload = buildRedeemedOrderPayload({
      orderBreakdown: {
        'order-biz-1': { businessId: 'biz-1', businessName: 'החקלאי', subTotal: 15, items: [] },
      },
      businessIds: ['biz-1'],
      grandTotal: 15,
    }, 'temp_1', [activeGrant()]);

    expect(payload.orderData.grandTotal).toBe(15);
    expect(payload.orderData.compensationItems[0].compensationId).toBe('comp-1');
    expect(payload.orderData.orderBreakdown['order-biz-1'].items[0].isCompensation).toBe(true);
    expect(payload.orderData.orderBreakdown['order-biz-1'].items[0].lineId).toContain('prod-1');
    expect(payload.orderData.businessIds).toEqual(['biz-1']);
  });

  test('mergeBusinessIds stays unique', () => {
    expect(mergeBusinessIds(['a'], ['a', 'b'])).toEqual(['a', 'b']);
  });

  test('one-time redemption only applies still-active grants', () => {
    const first = buildRedeemedOrderPayload({
      orderBreakdown: {},
      businessIds: [],
      grandTotal: 0,
    }, 'order-a', [activeGrant()]);
    expect(first.compensationItems).toHaveLength(1);

    const alreadyRedeemed = activeGrant({
      status: COMPENSATION_STATUSES.REDEEMED,
      redeemedOrderId: 'order-a',
    });
    const second = injectCompensationLines(first.orderData.orderBreakdown, [alreadyRedeemed]);
    expect(second.compensationItems).toEqual([]);
  });

  test('revoked grants stay unused and restored grants become claimable again', () => {
    const revoked = activeGrant({ status: COMPENSATION_STATUSES.REVOKED, revokedAt: '2026-01-01' });
    expect(injectCompensationLines({}, [revoked]).compensationItems).toEqual([]);

    const restored = {
      ...revoked,
      status: COMPENSATION_STATUSES.ACTIVE,
      revokedAt: null,
      redeemedOrderId: '',
      restoredAt: '2026-01-02',
    };
    expect(injectCompensationLines({}, [restored]).compensationItems).toHaveLength(1);
  });
});
