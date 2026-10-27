import fs from 'fs';
import path from 'path';
import { TR8 } from './translationsV8';

// A missing function key (e.g. t8.orderReady(name)) throws mid-pick, so every
// key the V8 code reads must exist in both languages with the same shape.
const SOURCES = [
  path.join(__dirname, 'PickingWorkspaceV8.js'),
  path.join(__dirname, '..', 'DeliveryManagementV8.js'),
];

function usedKeys() {
  const keys = new Set();
  SOURCES.forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\b(?:t8|TR8\.he|TR8\.th)\.([A-Za-z0-9_]+)/g)) keys.add(match[1]);
  });
  return [...keys].sort();
}

test('every V8 text the code uses exists in Hebrew and Thai', () => {
  const keys = usedKeys();
  expect(keys.length).toBeGreaterThan(50);
  const missing = keys.filter((key) => TR8.he[key] === undefined || TR8.th[key] === undefined);
  expect(missing).toEqual([]);
});

test('Hebrew and Thai have the same keys and the same types', () => {
  expect(Object.keys(TR8.th).sort()).toEqual(Object.keys(TR8.he).sort());
  const typeMismatch = Object.keys(TR8.he).filter((key) => typeof TR8.he[key] !== typeof TR8.th[key]);
  expect(typeMismatch).toEqual([]);
});

test('text functions return non-empty strings for typical arguments', () => {
  ['he', 'th'].forEach((lang) => {
    Object.values(TR8[lang]).forEach((value) => {
      if (typeof value !== 'function') {
        expect(typeof value).toBe('string');
        return;
      }
      const result = value(3, 'מארז');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toMatch(/undefined|NaN/);
    });
  });
});
