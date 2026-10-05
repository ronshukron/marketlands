import { countActiveOrderItems, crateMarkV8 } from './crateTypeThaiV8';

describe('crateMarkV8', () => {
  test('small new crate at 10 items, large above 10', () => {
    expect(crateMarkV8({ reusable: false, itemCount: 10 })).toEqual({ reusable: false, large: false });
    expect(crateMarkV8({ reusable: false, itemCount: 11 })).toEqual({ reusable: false, large: true });
  });

  test('reused crates keep the same size rule', () => {
    expect(crateMarkV8({ reusable: true, itemCount: 3 })).toEqual({ reusable: true, large: false });
    expect(crateMarkV8({ reusable: true, itemCount: 12 })).toEqual({ reusable: true, large: true });
  });

  test('countActiveOrderItems skips removed lines', () => {
    const order = { items: [{ lineId: 'a' }, { lineId: 'b' }, { lineId: 'c' }] };
    expect(countActiveOrderItems(order, { removedLineIds: { b: true } })).toBe(2);
    expect(countActiveOrderItems(order, {})).toBe(3);
  });
});