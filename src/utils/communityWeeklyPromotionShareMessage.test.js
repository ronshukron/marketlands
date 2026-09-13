import {
  COMMUNITY_WEEKLY_PROMOTION_SHARE_TITLE,
  buildCommunityStoreUrlForCode,
  buildCommunityWeeklyPromotionShareMessage,
} from './communityWeeklyPromotionShareMessage';

describe('community weekly promotion share message', () => {
  const promotion = {
    productSnapshots: [
      { name: 'קרטון רימון 6 ק"ג', promotionPrice: 30, measurementType: 'package' },
      { name: 'עגבניות', promotionPrice: 8.5, measurementType: 'kg' },
    ],
  };

  test('builds a group-ready message with items, optional WhatsApp, and community store url', () => {
    const message = buildCommunityWeeklyPromotionShareMessage({
      promotion,
      communityName: 'אור הנר',
      storeUrl: 'https://www.bastabasket.com/?c=abc123',
      whatsappGroupLink: 'https://chat.whatsapp.com/orhaner',
    });

    expect(message).toBe(
      [
        COMMUNITY_WEEKLY_PROMOTION_SHARE_TITLE,
        '• קרטון רימון 6 ק"ג - 30₪\n• עגבניות - 8.50₪',
        'קבוצת הוואטסאפ של אור הנר:\nhttps://chat.whatsapp.com/orhaner',
        'להזמנה באתר (אור הנר):\nhttps://www.bastabasket.com/?c=abc123',
      ].join('\n\n'),
    );
  });

  test('omits the WhatsApp line when the community has no group link', () => {
    const message = buildCommunityWeeklyPromotionShareMessage({
      promotion,
      communityName: 'ניצנים',
      storeUrl: 'https://www.bastabasket.com/?c=nitzanim',
    });

    expect(message).toContain(COMMUNITY_WEEKLY_PROMOTION_SHARE_TITLE);
    expect(message).toContain('• קרטון רימון 6 ק"ג - 30₪');
    expect(message).not.toContain('וואטסאפ');
    expect(message).toContain('להזמנה באתר (ניצנים):');
  });

  test('builds a community-specific store url from a compact community code', () => {
    expect(buildCommunityStoreUrlForCode({
      origin: 'https://www.bastabasket.com/store?other=1',
      communityCode: 'abc123',
    })).toBe('https://www.bastabasket.com/?c=abc123');
  });
});
