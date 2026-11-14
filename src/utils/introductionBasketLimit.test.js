import {
  countCartBaskets,
  describeBlockedBasketsHtml,
  findBlockedCartBaskets,
  getCartBasketIds,
  listCartBasketInstances,
  normalizeMaxPerCustomer,
  parseMaxPerCustomerInput,
} from './introductionBasketLimit';

const basketLines = (basketId, instance, title = 'סל היכרות') => [
  { id: 'p1', basketId, basketInstanceId: instance, basketTitle: title, isBasketComponent: true },
  { id: 'p2', basketId, basketInstanceId: instance, basketTitle: title, isBasketComponent: true },
  { id: `adj:${instance}`, basketId, basketInstanceId: instance, basketTitle: title, isBasketAdjustment: true },
];

const plainItem = { id: 'tomato', orderId: 'o1' };

describe('normalizeMaxPerCustomer / parseMaxPerCustomerInput', () => {
  it('treats anything that is not a whole positive number as no limit', () => {
    expect(normalizeMaxPerCustomer(3)).toBe(3);
    expect(normalizeMaxPerCustomer('2')).toBe(2);
    expect(normalizeMaxPerCustomer(0)).toBe(0);
    expect(normalizeMaxPerCustomer(undefined)).toBe(0);
    expect(normalizeMaxPerCustomer(-4)).toBe(0);
    expect(normalizeMaxPerCustomer(500)).toBe(99);
  });

  it('accepts empty as no limit and rejects fractions and negatives', () => {
    expect(parseMaxPerCustomerInput('')).toBe(0);
    expect(parseMaxPerCustomerInput('0')).toBe(0);
    expect(parseMaxPerCustomerInput('2')).toBe(2);
    expect(parseMaxPerCustomerInput(3)).toBe(3);
    expect(parseMaxPerCustomerInput('1.5')).toBeNull();
    expect(parseMaxPerCustomerInput('-1')).toBeNull();
    expect(parseMaxPerCustomerInput('abc')).toBeNull();
    expect(parseMaxPerCustomerInput('100')).toBeNull();
  });
});

describe('cart basket listing', () => {
  const cart = [...basketLines('b1', 'i1'), plainItem, ...basketLines('b1', 'i2'), ...basketLines('b2', 'i3')];

  it('lists each basket once, in the order added', () => {
    expect(listCartBasketInstances(cart).map((b) => b.basketInstanceId)).toEqual(['i1', 'i2', 'i3']);
    expect(getCartBasketIds(cart)).toEqual(['b1', 'b2']);
    expect(countCartBaskets(cart, 'b1')).toBe(2);
    expect(countCartBaskets(cart, 'missing')).toBe(0);
  });
});

describe('findBlockedCartBaskets', () => {
  it('lets active baskets without a limit through', () => {
    const cart = [...basketLines('b1', 'i1'), ...basketLines('b1', 'i2'), plainItem];
    expect(findBlockedCartBaskets(cart, { b1: { active: true, maxPerCustomer: 0, remaining: null } })).toEqual([]);
  });

  it('blocks every copy of a basket that is no longer active', () => {
    const cart = [...basketLines('b1', 'i1'), ...basketLines('b1', 'i2'), ...basketLines('b2', 'i3')];
    const blocked = findBlockedCartBaskets(cart, {
      b1: { active: false },
      b2: { active: true, maxPerCustomer: 0 },
    });
    expect(blocked.map((b) => [b.basketInstanceId, b.reason])).toEqual([['i1', 'inactive'], ['i2', 'inactive']]);
  });

  it('blocks a basket whose state is unknown (deleted)', () => {
    const blocked = findBlockedCartBaskets(basketLines('gone', 'i1'), {});
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toBe('inactive');
  });

  it('keeps the first baskets up to the limit and blocks the ones added last', () => {
    const cart = [...basketLines('b1', 'i1'), ...basketLines('b1', 'i2'), ...basketLines('b1', 'i3')];
    const blocked = findBlockedCartBaskets(cart, { b1: { active: true, maxPerCustomer: 2 } });
    expect(blocked.map((b) => [b.basketInstanceId, b.reason, b.maxPerCustomer])).toEqual([['i3', 'limit', 2]]);
  });

  it('counts baskets from earlier orders through remaining', () => {
    const cart = [...basketLines('b1', 'i1'), ...basketLines('b1', 'i2')];
    expect(findBlockedCartBaskets(cart, { b1: { active: true, maxPerCustomer: 2, remaining: 1 } })
      .map((b) => b.basketInstanceId)).toEqual(['i2']);
    expect(findBlockedCartBaskets(cart, { b1: { active: true, maxPerCustomer: 2, remaining: 0 } })
      .map((b) => b.basketInstanceId)).toEqual(['i1', 'i2']);
  });

  it('never allows more than the limit even if remaining is larger', () => {
    const cart = [...basketLines('b1', 'i1'), ...basketLines('b1', 'i2')];
    expect(findBlockedCartBaskets(cart, { b1: { active: true, maxPerCustomer: 1, remaining: 5 } })
      .map((b) => b.basketInstanceId)).toEqual(['i2']);
  });

  it('ignores carts without baskets', () => {
    expect(findBlockedCartBaskets([plainItem], {})).toEqual([]);
    expect(findBlockedCartBaskets([], {})).toEqual([]);
  });
});

describe('describeBlockedBasketsHtml', () => {
  it('explains each reason once and escapes the title', () => {
    const html = describeBlockedBasketsHtml([
      { basketId: 'b1', title: 'סל <b>ירוק</b>', reason: 'inactive' },
      { basketId: 'b1', title: 'סל <b>ירוק</b>', reason: 'inactive' },
      { basketId: 'b2', title: 'סל פירות', reason: 'limit', maxPerCustomer: 1 },
      { basketId: 'b3', title: 'סל ירקות', reason: 'limit', maxPerCustomer: 3 },
    ]);
    expect(html).toBe([
      '"סל &lt;b&gt;ירוק&lt;/b&gt;" כבר לא זמין להזמנה.',
      '"סל פירות" מוגבל לסל אחד ללקוח.',
      '"סל ירקות" מוגבל ל-3 סלים ללקוח.',
    ].join('<br>'));
  });
});
