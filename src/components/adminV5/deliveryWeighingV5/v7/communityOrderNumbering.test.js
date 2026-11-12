import {
  computeCommunityLoadingNumbers,
  computeLoadingOrderNumbers,
} from './communityOrderNumbering';

const order = (id, community, phone) => ({
  id,
  customerDetails: { pickupSpot: community, phone, name: id },
});

describe('computeLoadingOrderNumbers', () => {
  it('gives every order of a community the same number, last route stop = 1', () => {
    const orders = [
      order('x1', 'X', 'p1'),
      order('x2', 'X', 'p2'),
      order('y1', 'Y', 'p3'),
      order('z1', 'Z', 'p4'),
      order('z2', 'Z', 'p5'),
    ];
    const result = computeLoadingOrderNumbers({
      orders,
      communities: ['X', 'Y', 'Z'],
    });
    expect(result).toEqual({ z1: 1, z2: 1, y1: 2, x1: 3, x2: 3 });
  });

  it('skips communities without orders so there are no gaps', () => {
    const result = computeLoadingOrderNumbers({
      orders: [order('a1', 'A', 'p1'), order('c1', 'C', 'p2')],
      communities: ['A', 'B', 'C'],
    });
    expect(result).toEqual({ a1: 2, c1: 1 });
  });

  it('does not depend on the order of the orders list', () => {
    const result = computeLoadingOrderNumbers({
      orders: [order('b1', 'B', 'p2'), order('a1', 'A', 'p1'), order('b2', 'B', 'p3')],
      communities: ['A', 'B'],
    });
    expect(result).toEqual({ a1: 2, b1: 1, b2: 1 });
  });

  it('falls back to order communities when no list is given', () => {
    const result = computeLoadingOrderNumbers({
      orders: [order('x', 'X', 'p1'), order('y', 'X', 'p2')],
    });
    expect(result).toEqual({ x: 1, y: 1 });
  });

  it('puts communities missing from the route list last on the route', () => {
    const result = computeCommunityLoadingNumbers({
      orders: [order('a1', 'A', 'p1'), order('n1', 'New', 'p2')],
      communities: ['A'],
    });
    expect(result).toEqual({ A: 2, New: 1 });
  });
});
