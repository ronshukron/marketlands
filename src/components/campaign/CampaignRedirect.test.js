import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CampaignRedirect from './CampaignRedirect';
import { getCampaignLink } from '../../services/campaignService';
import { trackFunnelStep } from '../../services/funnelService';

jest.mock('../../services/campaignService', () => ({ getCampaignLink: jest.fn() }));
jest.mock('../../services/funnelService', () => ({ trackFunnelStep: jest.fn() }));

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/q/:code" element={<CampaignRedirect />} />
      <Route path="/" element={<p>home</p>} />
      <Route path="/fruits" element={<p>fruits page</p>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => localStorage.clear());

test('a known link credits the visitor, records the scan and opens its page', async () => {
  getCampaignLink.mockImplementation(() => Promise.resolve({ id: 'green', active: true, target: '/fruits' }));
  renderAt('/q/Green');
  expect(await screen.findByText('fruits page')).toBeInTheDocument();
  expect(getCampaignLink).toHaveBeenCalledWith('green');
  expect(JSON.parse(localStorage.getItem('bastaCampaign')).code).toBe('green');
  expect(trackFunnelStep).toHaveBeenCalledWith('campaign', 'scan', { campaign: 'green', dedupeKey: 'green' });
});

test('an unknown or switched-off link just opens the home page, without credit', async () => {
  getCampaignLink.mockImplementation(() => Promise.resolve({ id: 'old', active: false, target: '/fruits' }));
  renderAt('/q/old');
  expect(await screen.findByText('home')).toBeInTheDocument();
  expect(localStorage.getItem('bastaCampaign')).toBeNull();
  expect(trackFunnelStep).not.toHaveBeenCalled();
});

test('a link pointing outside the site opens the home page', async () => {
  getCampaignLink.mockImplementation(() => Promise.resolve({ id: 'x1', active: true, target: 'https://evil.example' }));
  renderAt('/q/x1');
  expect(await screen.findByText('home')).toBeInTheDocument();
});
