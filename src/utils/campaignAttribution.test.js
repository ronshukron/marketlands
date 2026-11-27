import {
  campaignPathLabel,
  getActiveCampaign,
  normalizeCampaignCode,
  rememberCampaign,
  safeCampaignTarget,
} from './campaignAttribution';

const memory = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
};
const DAY = 86400000;

test('codes are short English slugs', () => {
  expect(normalizeCampaignCode(' Green-1 ')).toBe('green-1');
  expect(normalizeCampaignCode('ירוק')).toBe('');
  expect(normalizeCampaignCode('-x')).toBe('');
});

test('the last scan wins, for 30 days', () => {
  const storage = memory();
  const t0 = Date.parse('2026-12-01T10:00:00Z');
  rememberCampaign('green', { now: t0, storage });
  rememberCampaign('blue', { now: t0 + DAY, storage });
  expect(getActiveCampaign({ now: t0 + 2 * DAY, storage })).toEqual({ code: 'blue', at: new Date(t0 + DAY).toISOString() });
  expect(getActiveCampaign({ now: t0 + 32 * DAY, storage })).toBeNull();
  expect(storage.getItem('bastaCampaign')).toBeNull();
  expect(rememberCampaign('בית', { now: t0, storage })).toBeNull();
});

test('links only lead to pages on this site', () => {
  expect(safeCampaignTarget('/?category=פירות')).toBe('/?category=פירות');
  expect(safeCampaignTarget('https://evil.example')).toBe('/');
  expect(safeCampaignTarget('//evil.example')).toBe('/');
  expect(safeCampaignTarget('')).toBe('/');
});

test('pages are labelled by path, with the store category', () => {
  expect(campaignPathLabel('/', '?category=ירקות&c=12')).toBe('/?category=ירקות');
  expect(campaignPathLabel('/my-orders/', '')).toBe('/my-orders');
  expect(campaignPathLabel('/', '')).toBe('/');
});
