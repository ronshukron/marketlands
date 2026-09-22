import { parseAutoloadSetupFromSearch } from './autoloadSetupV7';

describe('parseAutoloadSetupFromSearch', () => {
  const wednesday = new Date(2026, 8, 16, 9, 0, 0);

  test('returns null without autoload or date params', () => {
    expect(parseAutoloadSetupFromSearch('', wednesday)).toBeNull();
    expect(parseAutoloadSetupFromSearch('?week=2026-09-13', wednesday)).toBeNull();
  });

  test('autoload=today uses today as the delivery day and week of that Sunday', () => {
    expect(parseAutoloadSetupFromSearch('?autoload=today', wednesday)).toEqual({
      weekKey: '2026-09-13',
      startDate: '2026-09-16',
      endDate: '2026-09-16',
      communities: [],
    });
  });

  test('explicit date= overrides today and still derives the week key', () => {
    expect(parseAutoloadSetupFromSearch('?autoload=today&date=2026-09-14', wednesday)).toEqual({
      weekKey: '2026-09-13',
      startDate: '2026-09-14',
      endDate: '2026-09-14',
      communities: [],
    });
  });

  test('date= alone is enough to autoload', () => {
    expect(parseAutoloadSetupFromSearch('?date=2026-09-20', wednesday)).toEqual({
      weekKey: '2026-09-20',
      startDate: '2026-09-20',
      endDate: '2026-09-20',
      communities: [],
    });
  });
});
