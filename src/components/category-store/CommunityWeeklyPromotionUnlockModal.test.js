import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CommunityWeeklyPromotionUnlockModal from './CommunityWeeklyPromotionUnlockModal';
import { confirmCommunityUnlock } from '../../services/communityWeeklyPromotionService';
import { COMMUNITY_WEEKLY_PROMOTION_SHARE_TITLE } from '../../utils/communityWeeklyPromotionShareMessage';

jest.mock('../../services/communityWeeklyPromotionService', () => ({
  confirmCommunityUnlock: jest.fn(),
}));

jest.mock('../../hooks/usePickupSpots', () => () => ({
  pickupSpotsData: {
    'אור הנר': {
      whatsappGroupLink: 'https://chat.whatsapp.com/orhaner',
    },
  },
}));

jest.mock('../../services/pickupSpotsService', () => ({
  resolveCommunityName: (name) => String(name || '').trim(),
  resolveCommunityByCode: () => '',
}));

describe('CommunityWeeklyPromotionUnlockModal', () => {
  const promotion = {
    id: 'promotion-1',
    weekKey: '2026-08-23',
    productSnapshots: [
      { name: 'קרטון רימון 6 ק"ג', promotionPrice: 30 },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  it('copies the share message before showing trust-based confirmation', async () => {
    confirmCommunityUnlock.mockResolvedValue({ unlock: { unlocked: true } });
    const onUnlocked = jest.fn().mockResolvedValue(undefined);

    render(
      <CommunityWeeklyPromotionUnlockModal
        open
        promotion={promotion}
        communityCode="abc123"
        communityName="אור הנר"
        onClose={jest.fn()}
        onUnlocked={onUnlocked}
      />,
    );

    const shareText = screen.getByLabelText('ההודעה לשיתוף').value;
    expect(shareText).toContain(COMMUNITY_WEEKLY_PROMOTION_SHARE_TITLE);
    expect(shareText).toContain('• קרטון רימון 6 ק"ג - 30₪');
    expect(shareText).toContain('https://chat.whatsapp.com/orhaner');
    expect(shareText).toContain('c=abc123');
    expect(screen.queryByRole('button', { name: 'שיתפתי — פתיחת ההנחה' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'העתקת ההודעה' }));

    expect(await screen.findByText('ההודעה הועתקה!')).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(shareText);

    fireEvent.click(screen.getByRole('button', { name: 'שיתפתי — פתיחת ההנחה' }));

    await waitFor(() => {
      expect(confirmCommunityUnlock).toHaveBeenCalledWith(
        expect.objectContaining({
          promotionId: 'promotion-1',
          communityCode: 'abc123',
          promotion,
        }),
      );
      expect(onUnlocked).toHaveBeenCalledTimes(1);
    });
  });
});
