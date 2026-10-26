import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CommunityWeeklyPromotionEditor from './CommunityWeeklyPromotionEditor';

jest.mock('../../../hooks/usePickupSpots', () => () => ({
  pickupSpots: ['אור הנר', 'ניצנים'],
  pickupSpotsData: {
    'אור הנר': { whatsappGroupLink: 'https://chat.whatsapp.com/orhaner' },
    ניצנים: {},
  },
  loaded: true,
}));

jest.mock('../../../services/pickupSpotsService', () => ({
  getCommunityCode: (name) => (name === 'אור הנר' ? 'abc123' : 'nitz'),
}));

jest.mock('../../../services/communityWeeklyPromotionService', () => ({
  COMMUNITY_WEEKLY_PROMOTION_SHARE_MESSAGE_MAX_LENGTH: 4000,
  loadEligibleWeeklyProducts: jest.fn(() => Promise.resolve({ products: [], businesses: [] })),
}));

const preview = () => screen.getByLabelText('תצוגה מקדימה של הודעת הוואטסאפ');
const manualMessage = () => screen.getByLabelText('הודעה ידנית');

describe('CommunityWeeklyPromotionEditor share message', () => {
  test('uses the default WhatsApp message until one is written by hand', async () => {
    render(<CommunityWeeklyPromotionEditor onSave={jest.fn()} onCancel={jest.fn()} />);

    await waitFor(() => {
      expect(preview().value).toContain('🍄פטריות של מוגו🍄');
    });
    expect(preview().value).toContain('?c=קוד-הקהילה');
    expect(preview().value).toContain('מגיעים ברביעי.');
    expect(screen.getByText('נשלח נוסח ברירת המחדל, עם קישורים לפי היישוב')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'עריכת ברירת המחדל' }));
    expect(manualMessage().value).toContain('🍄פטריות של מוגו🍄');
    expect(manualMessage().value).toContain('מגיעים ברביעי.');
    expect(manualMessage().value).not.toContain('http');
    expect(preview().value).toContain('?c=קוד-הקהילה');
    expect(preview().value.indexOf('גויאבה')).toBeLessThan(preview().value.indexOf('?c=קוד-הקהילה'));
    expect(preview().value.indexOf('?c=קוד-הקהילה')).toBeLessThan(preview().value.lastIndexOf('מגיעים ברביעי.'));

    fireEvent.change(manualMessage(), { target: { value: 'הודעה שלי בלבד' } });
    expect(preview().value.startsWith('הודעה שלי בלבד')).toBe(true);
    expect(preview().value).toContain('ועוד חקלאים באתר של הבסטה:\nhttps://www.bastabasket.com/?c=קוד-הקהילה');
    expect(preview().value).toContain('לקבוצה וואטסאפ ביישוב:\nhttps://chat.whatsapp.com/קישור-הקבוצה');
    expect(preview().value).not.toContain('פטריות');

    fireEvent.click(screen.getByRole('button', { name: 'חזרה לברירת מחדל' }));
    expect(manualMessage().value).toBe('');
    expect(preview().value).toContain('🍄פטריות של מוגו🍄');
  });

  test('fills the selected community store and WhatsApp links in the preview', async () => {
    render(<CommunityWeeklyPromotionEditor onSave={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'אור הנר' }));

    await waitFor(() => {
      expect(preview().value).toContain('c=abc123');
      expect(preview().value).toContain('https://chat.whatsapp.com/orhaner');
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'אור הנר' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'ניצנים' }));

    await waitFor(() => {
      expect(preview().value).toContain('c=nitz');
    });
    expect(preview().value).not.toContain('וואטסאפ');
    expect(preview().value).toContain('מגיעים ברביעי.');
  });
});
