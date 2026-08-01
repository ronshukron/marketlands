import {
  buildCheckoutAccountProfile,
  buildOrderAccountPayload,
  CHECKOUT_ACCOUNT_ACTIONS,
  resolveCheckoutAccountAction,
} from './checkoutAccountUtils';

describe('classic checkout account helpers', () => {
  test('uses the exact current UID without requesting another auth flow', () => {
    expect(resolveCheckoutAccountAction({
      currentUser: { uid: 'uid-existing' },
      createAccount: true,
    })).toEqual({
      action: CHECKOUT_ACCOUNT_ACTIONS.USE_CURRENT,
      uid: 'uid-existing',
    });
  });

  test('resolves checked anonymous checkout to auth and unchecked checkout to guest', () => {
    expect(resolveCheckoutAccountAction({ createAccount: true }).action)
      .toBe(CHECKOUT_ACCOUNT_ACTIONS.REQUEST_AUTH);
    expect(resolveCheckoutAccountAction({ createAccount: false }))
      .toEqual({ action: CHECKOUT_ACCOUNT_ACTIONS.GUEST, uid: null });
  });

  test('normalizes the account profile and builds an explicit order payload', () => {
    expect(buildCheckoutAccountProfile({
      email: ' Buyer@Example.COM ',
      name: ' קונה ',
      phone: ' 0501234567 ',
      community: ' קהילה ',
    })).toEqual({
      email: 'buyer@example.com',
      name: 'קונה',
      phone: '0501234567',
      community: 'קהילה',
      role: 'user',
    });
    expect(buildOrderAccountPayload('created-uid')).toEqual({ userId: 'created-uid' });
    expect(buildOrderAccountPayload(null)).toEqual({ userId: null });
  });
});
