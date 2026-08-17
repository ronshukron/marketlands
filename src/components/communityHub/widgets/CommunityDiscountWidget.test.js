import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { useAuth } from '../../../contexts/authContext';
import { subscribeDisplayDiscountInfo } from '../../../services/communityDiscountService';
import CommunityDiscountWidget from './CommunityDiscountWidget';

jest.mock('../../../services/communityDiscountService', () => ({
  subscribeDisplayDiscountInfo: jest.fn(),
}));

jest.mock('../../../contexts/authContext', () => ({
  useAuth: jest.fn(),
}));

const renderCompactWidget = (props = {}) => render(
  <BrowserRouter>
    <CommunityDiscountWidget
      communityName="ניצנים"
      deliveryWeekKey="2026-08-16"
      variant="compact"
      showCommunityLink
      {...props}
    />
  </BrowserRouter>,
);

describe('CommunityDiscountWidget compact store variant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ userLoggedIn: true, loading: false });
  });

  test('shows pilot progress and links to the selected community hub', async () => {
    subscribeDisplayDiscountInfo.mockImplementation(({ onValue }) => {
      onValue({
        discountPercent: 1,
        currentTier: { displayThreshold: 1000, realThreshold: 800, discountPercent: 1 },
        nextTier: { displayThreshold: 2000, realThreshold: 1600, discountPercent: 2 },
        weeklyTotal: 1200,
        tiers: [
          { displayThreshold: 1000, realThreshold: 800, discountPercent: 1 },
          { displayThreshold: 2000, realThreshold: 1600, discountPercent: 2 },
        ],
        isVip: true,
        vipPerks: {},
      });
      return jest.fn();
    });

    renderCompactWidget();

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '1200');
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /למרכז הקהילה/ })).toHaveAttribute(
      'href',
      `/community/${encodeURIComponent('ניצנים')}`,
    );
    expect(subscribeDisplayDiscountInfo).toHaveBeenCalledWith(expect.objectContaining({
      communityName: 'ניצנים',
      deliveryWeekKey: '2026-08-16',
    }));
  });

  test('renders nothing in the store for a non-pilot community', async () => {
    subscribeDisplayDiscountInfo.mockImplementation(({ onValue }) => {
      onValue({
        discountPercent: 0,
        currentTier: null,
        nextTier: null,
        weeklyTotal: 0,
        tiers: [],
        isVip: false,
      });
      return jest.fn();
    });

    const { container } = renderCompactWidget({ communityName: 'קהילה אחרת' });

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  test('asks guests to log in instead of showing progress', async () => {
    useAuth.mockReturnValue({ userLoggedIn: false, loading: false });
    subscribeDisplayDiscountInfo.mockImplementation(({ onValue }) => {
      onValue({
        discountPercent: 1,
        currentTier: { displayThreshold: 1000, realThreshold: 800, discountPercent: 1 },
        nextTier: { displayThreshold: 2000, realThreshold: 1600, discountPercent: 2 },
        weeklyTotal: 1200,
        tiers: [
          { displayThreshold: 1000, realThreshold: 800, discountPercent: 1 },
          { displayThreshold: 2000, realThreshold: 1600, discountPercent: 2 },
        ],
        isVip: false,
      });
      return jest.fn();
    });

    renderCompactWidget();

    expect(await screen.findByText('יש להתחבר כדי לצפות')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'התחברות' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
