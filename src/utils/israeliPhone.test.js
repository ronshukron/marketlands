import { formatIsraeliMobile, toIsraeliMobileE164 } from './israeliPhone';

test('normalizes Israeli mobile numbers for SMS', () => {
  expect(toIsraeliMobileE164('050-123 4567')).toBe('+972501234567');
  expect(toIsraeliMobileE164('0501234567')).toBe('+972501234567');
  expect(toIsraeliMobileE164('+972 50-123-4567')).toBe('+972501234567');
  expect(toIsraeliMobileE164('972501234567')).toBe('+972501234567');
  expect(toIsraeliMobileE164('03-1234567')).toBeNull();
  expect(toIsraeliMobileE164('+15551234567')).toBeNull();
  expect(toIsraeliMobileE164('')).toBeNull();
  expect(formatIsraeliMobile('+972501234567')).toBe('050-1234567');
});
