import {
  COMMUNITY_WEEKLY_PROMOTION_DEFAULT_SHARE_BODY,
  buildCommunityStoreUrlForCode,
  buildCommunityWeeklyPromotionShareMessage,
} from './communityWeeklyPromotionShareMessage';

const STORE_URL = 'https://www.bastabasket.com/?c=abc123';
const WHATSAPP_URL = 'https://chat.whatsapp.com/orhaner';

describe('community weekly promotion share message', () => {
  const promotion = {
    productSnapshots: [
      { name: 'קרטון רימון 6 ק"ג', promotionPrice: 30, regularPrice: 45, measurementType: 'package' },
      { name: 'עגבניות', promotionPrice: 8.5, measurementType: 'kg' },
    ],
  };

  test('uses the default produce message and appends the community links', () => {
    const message = buildCommunityWeeklyPromotionShareMessage({
      promotion,
      communityName: 'אור הנר',
      storeUrl: STORE_URL,
      whatsappGroupLink: WHATSAPP_URL,
    });

    expect(message).toBe(
      [
        COMMUNITY_WEEKLY_PROMOTION_DEFAULT_SHARE_BODY.replace(/\n\nמגיעים ברביעי\.$/, ''),
        `ועוד חקלאים באתר של הבסטה:\n${STORE_URL}`,
        `לקבוצה וואטסאפ ביישוב:\n${WHATSAPP_URL}`,
        'מגיעים ברביעי.',
      ].join('\n\n'),
    );
    expect(message).toContain('🍄פטריות של מוגו🍄');
    expect(message).toContain(String.raw`* לאליק\סלנובה\תרד - 8₪`);
    expect(message).not.toContain('עגבניות');
    expect(message.indexOf('גויאבה')).toBeLessThan(message.indexOf(STORE_URL));
    expect(message.indexOf(STORE_URL)).toBeLessThan(message.indexOf(WHATSAPP_URL));
    expect(message.indexOf(WHATSAPP_URL)).toBeLessThan(message.lastIndexOf('מגיעים ברביעי.'));
  });

  test('omits the WhatsApp block when the community has no group link', () => {
    const message = buildCommunityWeeklyPromotionShareMessage({
      promotion,
      storeUrl: 'https://www.bastabasket.com/?c=nitzanim',
    });

    expect(message).toContain('ועוד חקלאים באתר של הבסטה:\nhttps://www.bastabasket.com/?c=nitzanim');
    expect(message).not.toContain('וואטסאפ');
    expect(message).toMatch(/nitzanim\n\nמגיעים ברביעי\.$/);
  });

  test('appends community links after a handwritten message', () => {
    const message = buildCommunityWeeklyPromotionShareMessage({
      promotion: { shareConfig: { message: 'הודעה שלי' } },
      storeUrl: STORE_URL,
      whatsappGroupLink: WHATSAPP_URL,
    });

    expect(message).toBe(
      [
        'הודעה שלי',
        `ועוד חקלאים באתר של הבסטה:\n${STORE_URL}`,
        `לקבוצה וואטסאפ ביישוב:\n${WHATSAPP_URL}`,
      ].join('\n\n'),
    );
    expect(message).not.toContain('פטריות');
  });

  test('moves a handwritten arrival line to after the generated links', () => {
    const message = buildCommunityWeeklyPromotionShareMessage({
      promotion: { shareConfig: { message: 'רק השבוע\n\nמגיעים בחמישי.' } },
      storeUrl: STORE_URL,
      whatsappGroupLink: WHATSAPP_URL,
    });

    expect(message).toBe(
      [
        'רק השבוע',
        `ועוד חקלאים באתר של הבסטה:\n${STORE_URL}`,
        `לקבוצה וואטסאפ ביישוב:\n${WHATSAPP_URL}`,
        'מגיעים בחמישי.',
      ].join('\n\n'),
    );
  });

  test('replaces links that were saved inside an older message', () => {
    const message = buildCommunityWeeklyPromotionShareMessage({
      promotion: {
        shareConfig: {
          message: 'הודעה שלי\n\nועוד חקלאים באתר של הבסטה:\n{{storeUrl}}\n\nלקבוצה וואטסאפ ביישוב:\nhttps://chat.whatsapp.com/old\n\nמגיעים ברביעי.',
        },
      },
      storeUrl: STORE_URL,
      whatsappGroupLink: WHATSAPP_URL,
    });

    expect(message).toBe(
      [
        'הודעה שלי',
        `ועוד חקלאים באתר של הבסטה:\n${STORE_URL}`,
        `לקבוצה וואטסאפ ביישוב:\n${WHATSAPP_URL}`,
        'מגיעים ברביעי.',
      ].join('\n\n'),
    );
    expect(message).not.toContain('{{storeUrl}}');
    expect(message).not.toContain('chat.whatsapp.com/old');
  });

  test('builds a community-specific store url from a compact community code', () => {
    expect(buildCommunityStoreUrlForCode({
      origin: 'https://www.bastabasket.com/store?other=1',
      communityCode: 'abc123',
    })).toBe('https://www.bastabasket.com/?c=abc123');
  });
});
