import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Swal from 'sweetalert2';
import CampaignsAdmin from './CampaignsAdmin';
import { listCampaignLinks, saveCampaignLink } from '../../services/campaignService';

jest.mock('sweetalert2', () => ({ fire: jest.fn(() => Promise.resolve({ isConfirmed: true })) }));
const mockAuth = { currentUser: { uid: 'admin' }, userRole: 'admin', loading: false };
jest.mock('../../contexts/authContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../utils/accountRoles', () => ({ isAdminAccount: () => true }));
jest.mock('../../utils/customerOrderDateQueries', () => ({ fetchDocsByCreatedAtRange: () => Promise.resolve([]) }));
jest.mock('../../services/basketSubscriptionService', () => ({ listAllSubscriptions: () => Promise.resolve([]) }));
jest.mock('../../services/campaignService', () => ({
  campaignLink: (code) => `https://bastabasket.com/q/${code}`,
  listCampaignLinks: jest.fn(),
  saveCampaignLink: jest.fn(),
}));

const now = new Date(2026, 11, 20, 12);
const data = {
  events: [
    { sessionId: 'a', campaign: 'green', funnel: 'campaign', step: 'scan', createdAt: new Date(2026, 11, 10) },
    { sessionId: 'a', campaign: 'green', funnel: 'cart', step: 'checkout_opened', createdAt: new Date(2026, 11, 10) },
    { sessionId: 'b', campaign: 'green', funnel: 'campaign', step: 'scan', createdAt: new Date(2026, 11, 11) },
  ],
  orders: [
    { collection: 'customerOrdersDelayed', campaign: { code: 'green' }, paymentStatus: 'completed', delayedOrderStatus: 'completed', weighing: { finalSum: 150 } },
  ],
  subscriptions: [],
};

const renderPage = (loadData = jest.fn(() => Promise.resolve(data))) => {
  render(<MemoryRouter><CampaignsAdmin loadData={loadData} now={now} /></MemoryRouter>);
  return loadData;
};

beforeEach(() => {
  listCampaignLinks.mockImplementation(() => Promise.resolve([
    { id: 'green', name: 'פלייר ירוק', target: '/', active: true },
    { id: 'blue', name: 'פלייר כחול', target: '/', active: true },
  ]));
  saveCampaignLink.mockImplementation(() => Promise.resolve('red'));
  Swal.fire.mockImplementation(() => Promise.resolve({ isConfirmed: true }));
});

test('each flyer shows its link and performance for the last 30 days', async () => {
  const loadData = renderPage();
  const green = await screen.findByTestId('campaign-green');
  expect(within(green).getByText('פלייר ירוק')).toBeInTheDocument();
  expect(within(green).getByText('https://bastabasket.com/q/green')).toBeInTheDocument();
  expect(within(green).getByText('מבקרים (2 סרקו)')).toBeInTheDocument();
  expect(within(green).getByText('הוסיפו לעגלה (50%)')).toBeInTheDocument();
  expect(within(green).getByText('הזמנות · ₪150.00')).toBeInTheDocument();
  expect(screen.getByTestId('campaign-blue')).toBeInTheDocument();
  const [start, end] = loadData.mock.calls[0];
  expect(start).toEqual(new Date(2026, 10, 21));
  expect(end.getDate()).toBe(20);
});

test('a new flyer link is created from the form', async () => {
  renderPage();
  await screen.findByTestId('campaign-green');
  fireEvent.change(screen.getByPlaceholderText('פלייר ירוק'), { target: { value: 'פלייר אדום' } });
  fireEvent.change(screen.getByPlaceholderText('green'), { target: { value: 'red' } });
  fireEvent.click(screen.getByRole('button', { name: 'קישור חדש' }));
  await waitFor(() => expect(saveCampaignLink).toHaveBeenCalledWith({
    name: 'פלייר אדום', code: 'red', target: '/', active: true, isNew: true,
  }));
  await waitFor(() => expect(Swal.fire).toHaveBeenCalledWith(expect.objectContaining({ text: 'https://bastabasket.com/q/red' })));
});

test('a bad code cannot be submitted', async () => {
  renderPage();
  await screen.findByTestId('campaign-green');
  fireEvent.change(screen.getByPlaceholderText('green'), { target: { value: 'ירוק' } });
  expect(screen.getByRole('button', { name: 'קישור חדש' })).toBeDisabled();
});
