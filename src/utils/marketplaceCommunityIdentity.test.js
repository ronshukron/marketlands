import {
  marketplaceCommunityNamesMatch,
  resolveMarketplaceCommunityName,
  setMarketplaceCommunityIdentity,
} from './marketplaceCommunityIdentity';

afterEach(() => {
  setMarketplaceCommunityIdentity();
});

test('resolves aliases supplied by the live community catalog', () => {
  setMarketplaceCommunityIdentity({
    communities: ['ניצנים'],
    aliases: {
      'ניצנים הישנה': 'ניצנים מערב',
      'ניצנים מערב': 'ניצנים',
    },
  });

  expect(resolveMarketplaceCommunityName('  ניצנים\u00a0הישנה ')).toBe('ניצנים');
  expect(marketplaceCommunityNamesMatch('ניצנים הישנה', 'ניצנים')).toBe(true);
});

test('stops safely when malformed live aliases contain a cycle', () => {
  setMarketplaceCommunityIdentity({
    aliases: { א: 'ב', ב: 'א' },
  });

  expect(['א', 'ב']).toContain(resolveMarketplaceCommunityName('א'));
});
