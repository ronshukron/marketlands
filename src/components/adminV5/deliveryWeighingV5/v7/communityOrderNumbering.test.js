import { computeLoadingOrderNumbers } from './communityOrderNumbering';

const order = (id, community, phone) => ({
  id,
  customerDetails: { pickupSpot: community, phone, name: id },
});

describe('computeLoadingOrderNumbers', () => {
  const customerNumbersMap = { p1: 1, p2: 2, p3: 3, p4: 4 };

  it('numbers the last route stop as 1 (loaded first)', () => {
    const orders = [
      order('a1', 'A', 'p2'),
      order('a2', 'A', 'p1'),
      order('b1', 'B', 'p3'),
      order('b2', 'B', 'p4'),
    ];
    const result = computeLoadingOrderNumbers({
      orders,
      communities: ['A', 'B'],
      customerNumbersMap,
    });
    expect(result).toEqual({ a2: 4, a1: 3, b1: 2, b2: 1 });
  });

  it('keeps one sequence across delivery groups', () => {
    const orders = [
      order('a1', 'A', 'p1'),
      order('b1', 'B', 'p2'),
      order('c1', 'C', 'p3'),
    ];
    const result = computeLoadingOrderNumbers({
      orders,
      communities: ['A', 'B', 'C'],
      customerNumbersMap,
    });
    expect(result).toEqual({ a1: 3, b1: 2, c1: 1 });
  });

  it('falls back to order communities when no list is given', () => {
    const result = computeLoadingOrderNumbers({
      orders: [order('x', 'X', 'p1'), order('y', 'X', 'p2')],
      customerNumbersMap,
    });
    expect(result).toEqual({ x: 2, y: 1 });
  });
});
