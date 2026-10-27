import {
  V8_VIEWS,
  readV8View,
  saveV8View,
  readV8BoxesReady,
  saveV8BoxesReady,
  readV8ItemSort,
  saveV8ItemSort,
  readV8HideDoneItems,
  saveV8HideDoneItems,
} from './localStorageV8';

beforeEach(() => {
  localStorage.clear();
});

test('view falls back to boxes and ignores unknown values', () => {
  expect(readV8View()).toBe(V8_VIEWS.boxes);
  saveV8View('items');
  expect(readV8View()).toBe(V8_VIEWS.items);
  saveV8View('not-a-view');
  expect(readV8View()).toBe(V8_VIEWS.boxes);
});

test('boxes-ready is per week, stringified, de-duplicated, and survives junk', () => {
  expect(readV8BoxesReady('')).toEqual([]);
  expect(saveV8BoxesReady('2026-09-27', ['o1', 'o1', 2, '', null])).toBe(true);
  expect(readV8BoxesReady('2026-09-27')).toEqual(['o1', '2']);
  expect(readV8BoxesReady('2026-10-04')).toEqual([]);
  localStorage.setItem('deliveryV8::boxesReady::2026-09-27', '{not-json');
  expect(readV8BoxesReady('2026-09-27')).toEqual([]);
});

test('item sort and hide-done persist only valid values', () => {
  expect(readV8ItemSort()).toBe('business');
  saveV8ItemSort('popular');
  expect(readV8ItemSort()).toBe('popular');
  saveV8ItemSort('nope');
  expect(readV8ItemSort()).toBe('business');
  expect(readV8HideDoneItems()).toBe(false);
  saveV8HideDoneItems(true);
  expect(readV8HideDoneItems()).toBe(true);
});

test('a quota / blocked localStorage does not throw', () => {
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  expect(saveV8View('items')).toBe(false);
  expect(saveV8BoxesReady('w', ['o1'])).toBe(false);
  spy.mockRestore();
});
