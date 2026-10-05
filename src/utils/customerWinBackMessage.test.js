import {
  buildWinBackMessage,
  buildWinBackWhatsAppUrl,
  filterLapsedCustomers,
  getWinBackStoreLink,
  isCustomerLapsed,
} from './customerWinBackMessage';

const NOW = new Date('2026-10-01T12:00:00');

function weeksBefore(weeks) {
  const date = new Date(NOW);
  date.setDate(date.getDate() - weeks * 7);
  return date;
}

describe('customerWinBackMessage', () => {
  test('builds a Hebrew invite with a store link and no gift line', () => {
    const message = buildWinBackMessage({
      name: 'דנה',
      storeLink: 'https://www.bastabasket.com/?category=הכל&community=חיפה',
    });

    expect(message).toBe([
      'היי דנה,',
      'רצינו לעדכן שהשתפרנו מאוד באתר ובשירות, ונשמח שתנסי להזמין שוב.',
      'כאן אפשר להזמין: https://www.bastabasket.com/?category=הכל&community=חיפה',
    ].join('\n'));
    expect(message).not.toContain('כמתנה');
  });

  test('adds the gift line only when a product name is attached', () => {
    const message = buildWinBackMessage({
      name: 'דנה',
      productName: 'עגבניות',
      storeLink: 'https://www.bastabasket.com',
    });

    expect(message).toContain('כמתנה להזמנה הבאה נוסיף לך עגבניות בחינם ברגע שתשלחי הזמנה.');
    expect(buildWinBackMessage({
      name: 'דנה',
      productName: '   ',
      storeLink: 'https://www.bastabasket.com',
    })).not.toContain('כמתנה');
  });

  test('lists only customers whose last completed order is older than the selected weeks', () => {
    const lapsed = {
      id: 'old',
      orders: [{ createdAt: weeksBefore(10), pickupSpot: 'חיפה' }],
      abandonedOrders: [{ createdAt: NOW }],
    };
    const recent = {
      id: 'recent',
      orders: [{ createdAt: weeksBefore(1), pickupSpot: 'חיפה' }],
    };
    const abandonedOnly = {
      id: 'abandoned',
      orders: [],
      lastOrderDate: weeksBefore(20),
    };
    const exactlySixWeeks = {
      id: 'boundary',
      orders: [{ createdAt: weeksBefore(6), pickupSpot: 'חיפה' }],
    };

    expect(isCustomerLapsed(lapsed, 6, NOW)).toBe(true);
    expect(isCustomerLapsed(recent, 6, NOW)).toBe(false);
    expect(isCustomerLapsed(abandonedOnly, 6, NOW)).toBe(false);
    expect(isCustomerLapsed(exactlySixWeeks, 6, NOW)).toBe(false);
    expect(filterLapsedCustomers(
      [lapsed, recent, abandonedOnly, exactlySixWeeks],
      6,
      NOW
    ).map((customer) => customer.id)).toEqual(['old']);
  });

  test('removes a lapsed customer when the same name or the same phone is still ordering', () => {
    const lapsedOldPhone = {
      id: 'old-phone',
      name: 'דנה כהן',
      phone: '0501111111',
      orders: [{ createdAt: weeksBefore(10), name: 'דנה כהן', phone: '0501111111' }],
    };
    const stillOrderingNewPhone = {
      id: 'new-phone',
      name: 'דנה  כהן',
      phone: '0522222222',
      orders: [{ createdAt: weeksBefore(1), name: 'דנה כהן', phone: '0522222222' }],
    };
    const lapsedSamePhone = {
      id: 'same-phone',
      name: 'מישהו אחר',
      phone: '972522222222',
      orders: [{ createdAt: weeksBefore(9), name: 'מישהו אחר', phone: '972522222222' }],
    };
    const lapsedOther = {
      id: 'other',
      name: 'יוסי לוי',
      phone: '0533333333',
      orders: [{ createdAt: weeksBefore(12), name: 'יוסי לוי', phone: '0533333333' }],
    };
    const lapsedPlaceholderName = {
      id: 'placeholder',
      name: 'ללא שם',
      phone: '0544444444',
      orders: [{ createdAt: weeksBefore(11), name: 'ללא שם', phone: '0544444444' }],
    };
    const activePlaceholderName = {
      id: 'active-placeholder',
      name: 'ללא שם',
      phone: '0555555555',
      orders: [{ createdAt: weeksBefore(1), name: 'ללא שם', phone: '0555555555' }],
    };

    const lapsedFirstName = {
      id: 'first-name',
      name: 'דנה',
      phone: '0566666666',
      orders: [{ createdAt: weeksBefore(10), name: 'דנה', phone: '0566666666' }],
    };
    const activeSameFirstName = {
      id: 'active-first-name',
      name: 'דנה',
      phone: '0577777777',
      orders: [{ createdAt: weeksBefore(1), name: 'דנה', phone: '0577777777' }],
    };

    expect(filterLapsedCustomers([
      lapsedOldPhone,
      stillOrderingNewPhone,
      lapsedSamePhone,
      lapsedOther,
      lapsedPlaceholderName,
      activePlaceholderName,
      lapsedFirstName,
      activeSameFirstName,
    ], 6, NOW).map((customer) => customer.id)).toEqual(['other', 'placeholder', 'first-name']);
  });

  test('uses the last completed order community in the store link', () => {
    const link = getWinBackStoreLink({
      orders: [
        { createdAt: weeksBefore(12), pickupSpot: 'ישן' },
        { createdAt: weeksBefore(8), pickupSpot: 'חיפה' },
      ],
    });

    expect(link).toContain('community=');
    expect(link).toContain(encodeURIComponent('חיפה'));
    expect(link).not.toContain(encodeURIComponent('ישן'));
  });

  test('does not build a WhatsApp link when the phone is missing', () => {
    expect(buildWinBackWhatsAppUrl({ phone: '', message: 'היי' })).toBe('');
    expect(buildWinBackWhatsAppUrl({ phone: '   ', message: 'היי' })).toBe('');

    const url = buildWinBackWhatsAppUrl({ phone: '0501234567', message: 'היי דנה' });
    expect(url).toBe(`https://wa.me/972501234567?text=${encodeURIComponent('היי דנה')}`);
  });
});
