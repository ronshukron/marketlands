import {
  buildChargeRefundDialogText,
  findOpenRefundsForCustomer,
  getRefundDisplayAmount,
  normalizeRefundPhone,
  refundMatchesCustomer,
} from './chargeRefundAlertV7';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs: jest.fn(),
}));
jest.mock('../../../../firebase/firebase', () => ({ db: {} }));

const pendingTomato = {
  id: 'r1',
  status: 'pending',
  orderId: 'order-7',
  userPhone: '050-123-4567',
  userEmail: 'a@test.com',
  reason: 'עגבניות רכות',
  requestedRefundAmount: 18.5,
};

describe('normalizeRefundPhone', () => {
  test('strips formatting and maps +972 to local 0', () => {
    expect(normalizeRefundPhone('050-123-4567')).toBe('0501234567');
    expect(normalizeRefundPhone('+972501234567')).toBe('0501234567');
  });
});

describe('refundMatchesCustomer', () => {
  test('matches by order id', () => {
    expect(refundMatchesCustomer(pendingTomato, { orderId: 'order-7' })).toBe(true);
    expect(refundMatchesCustomer(pendingTomato, { orderId: 'other' })).toBe(false);
  });

  test('matches by phone or email when order id differs', () => {
    expect(refundMatchesCustomer(pendingTomato, {
      orderId: 'other',
      phone: '+972 50-123-4567',
    })).toBe(true);
    expect(refundMatchesCustomer(pendingTomato, {
      orderId: 'other',
      email: 'A@test.com',
    })).toBe(true);
  });
});

describe('findOpenRefundsForCustomer', () => {
  test('keeps only pending / pending manual refunds for that customer', () => {
    const refunds = [
      pendingTomato,
      { ...pendingTomato, id: 'r2', status: 'rejected' },
      { ...pendingTomato, id: 'r3', status: 'pending_manual_refund', orderId: 'old' },
      { ...pendingTomato, id: 'r4', userPhone: '0500000000', userEmail: '', orderId: 'nope' },
    ];
    const found = findOpenRefundsForCustomer(refunds, {
      orderId: 'order-7',
      phone: '0501234567',
      email: 'a@test.com',
    });
    expect(found.map((item) => item.id)).toEqual(['r1', 'r3']);
  });
});

describe('buildChargeRefundDialogText', () => {
  test('returns empty when there are no refunds', () => {
    expect(buildChargeRefundDialogText([])).toBe('');
  });

  test('builds Hebrew lines that mark this order vs another', () => {
    const text = buildChargeRefundDialogText([
      pendingTomato,
      { ...pendingTomato, id: 'r3', status: 'pending_manual_refund', orderId: 'old', requestedRefundAmount: 20 },
    ], { currentOrderId: 'order-7', lang: 'he' });

    expect(text).toContain('בקשות זיכוי פתוחות');
    expect(text).toContain('הזמנה זו');
    expect(text).toContain('הזמנה אחרת');
    expect(text).toContain('עגבניות רכות');
    expect(text).toContain('/admin/refunds');
  });
});

describe('getRefundDisplayAmount', () => {
  test('prefers approved then requested amount', () => {
    expect(getRefundDisplayAmount({ approvedRefundAmount: 12, requestedRefundAmount: 9 })).toBe(12);
    expect(getRefundDisplayAmount({ requestedRefundAmount: 9 })).toBe(9);
    expect(getRefundDisplayAmount({ refundItems: [{ refundAmount: 3 }, { refundAmount: 2.5 }] })).toBe(5.5);
  });
});
